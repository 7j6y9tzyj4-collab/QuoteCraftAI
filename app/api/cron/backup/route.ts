import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {BACKUP_TABLES,OPTIONAL_TABLES,photoPathsOf,chicagoDate} from "@/lib/backupTables";

export const runtime="nodejs";
export const maxDuration=60;

// Щоденна резервна копія (Vercel Cron, див. vercel.json). Vercel env: CRON_SECRET (≥16 символів).
// Для кожного користувача: усі його таблиці → JSON у приватний bucket "backups": <user>/<YYYY-MM-DD>.json, зберігаємо 30 днів.
// Фото чеків копіюються окремо в <user>/receipts/… (тільки нові; список уже скопійованих — receipts/manifest.json).
// Відновлення — лише вручну.
const BUCKET="backups",SRC="receipts",KEEP_DAYS=30,MAX_PHOTOS_PER_RUN=150;

export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET||"";
  if(secret.length<16||req.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"unauthorized"},{status:401});
  const started=Date.now();
  const db=supabaseAdmin;
  try{
    const {data:b}=await db.storage.getBucket(BUCKET);
    if(!b){const {error}=await db.storage.createBucket(BUCKET,{public:false});if(error&&!/exist/i.test(error.message))throw error}

    const {data:users,error:uErr}=await db.auth.admin.listUsers({page:1,perPage:200});
    if(uErr)throw uErr;
    const day=chicagoDate();
    const report:any[]=[];
    for(const u of users.users){
      const uid=u.id;
      const tables:Record<string,any[]>={};const counts:Record<string,number>={};const skipped:string[]=[];
      for(const t of BACKUP_TABLES){
        const all:any[]=[];
        let failed=false;
        for(let from=0;;from+=1000){
          const {data,error}=await db.from(t).select("*").eq("user_id",uid).range(from,from+999);
          if(error){if(OPTIONAL_TABLES.has(t)){failed=true;break}throw new Error(`${t}: ${error.message}`)}
          all.push(...(data||[]));if(!data||data.length<1000)break;
        }
        if(failed){skipped.push(t);continue}
        tables[t]=all;counts[t]=all.length;
      }
      if(!Object.values(counts).some(n=>n>0))continue; // порожній акаунт — без копії
      const photos=photoPathsOf(tables);
      const out={app:"QuoteCraft",version:1,user_id:uid,email:u.email||"",exported_at:new Date().toISOString(),date:day,counts,skipped,receipt_photos:photos,tables};
      const {error:upErr}=await db.storage.from(BUCKET).upload(`${uid}/${day}.json`,JSON.stringify(out),{contentType:"application/json",upsert:true});
      if(upErr)throw upErr;

      // старіші за 30 днів — прибираємо (тільки файли копій YYYY-MM-DD.json)
      const {data:files}=await db.storage.from(BUCKET).list(uid,{limit:1000,sortBy:{column:"name",order:"asc"}});
      const cutoff=chicagoDate(new Date(Date.now()-KEEP_DAYS*864e5));
      const old=(files||[]).map(f=>f.name).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)&&n.slice(0,10)<cutoff).map(n=>`${uid}/${n}`);
      if(old.length)await db.storage.from(BUCKET).remove(old);

      // нові фото чеків → копія
      const manPath=`${uid}/receipts/manifest.json`;
      let copied=new Set<string>();
      const {data:man}=await db.storage.from(BUCKET).download(manPath);
      if(man){try{copied=new Set(JSON.parse(await man.text()).copied||[])}catch{/* новий список */}}
      const todo=photos.filter(p=>!copied.has(p)).slice(0,MAX_PHOTOS_PER_RUN);
      let newCopies=0;const photoErrors:string[]=[];
      for(const p of todo){
        if(Date.now()-started>45000)break; // лишок — наступної ночі
        const {data:blob,error}=await db.storage.from(SRC).download(p);
        if(error||!blob){photoErrors.push(p);copied.add(p);continue} // файл видалено — не пробуємо щоночі
        const {error:e2}=await db.storage.from(BUCKET).upload(`${uid}/receipts/${p}`,blob,{contentType:blob.type||"image/jpeg",upsert:true});
        if(e2){photoErrors.push(p);continue}
        copied.add(p);newCopies++;
      }
      if(todo.length)await db.storage.from(BUCKET).upload(manPath,JSON.stringify({updated_at:new Date().toISOString(),copied:[...copied]}),{contentType:"application/json",upsert:true});
      report.push({user:uid,file:`${uid}/${day}.json`,counts,skipped,removed:old.length,photos:photos.length,newPhotoCopies:newCopies,photoErrors:photoErrors.length,photosLeft:photos.filter(p=>!copied.has(p)).length});
    }
    return NextResponse.json({ok:true,date:day,users:report});
  }catch(e){
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});
  }
}
