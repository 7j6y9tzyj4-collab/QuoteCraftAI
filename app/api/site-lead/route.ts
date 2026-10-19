import {NextRequest,NextResponse} from "next/server";
import {timingSafeEqual} from "crypto";
import {supabaseAdmin} from "@/lib/supabaseAdmin";

export const runtime="nodejs";

// Заявка з сайту kvhouserenovation.com (send-inspection.php) → таблиця site_leads.
// Vercel env: SITE_LEAD_SECRET (той самий, що quotecraft_lead_secret у config.php сайту)
//             SITE_LEAD_USER_ID (id твого акаунта Supabase — кому належать заявки)
const BUCKET="receipts";
const str=(v:unknown,max:number)=>String(v??"").trim().slice(0,max);

function authorized(req:NextRequest){
  const secret=process.env.SITE_LEAD_SECRET||"";
  const got=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(secret.length<16||got.length!==secret.length)return false;
  return timingSafeEqual(Buffer.from(got),Buffer.from(secret));
}

export async function POST(req:NextRequest){
  try{
    if(!authorized(req))return NextResponse.json({error:"Unauthorized"},{status:401});
    const owner=process.env.SITE_LEAD_USER_ID||"";
    if(!/^[0-9a-f-]{36}$/i.test(owner))return NextResponse.json({error:"SITE_LEAD_USER_ID is not set"},{status:503});
    const b=await req.json();
    const name=str(b?.name,120),phone=str(b?.phone,30);
    if(!name||!phone)return NextResponse.json({error:"name and phone are required"},{status:400});
    const {data:lead,error}=await supabaseAdmin.from("site_leads").insert({
      user_id:owner,source:str(b?.source,80)||"website",name,phone,
      address:str(b?.address,300),description:str(b?.description,3000),
      calc_type:str(b?.calc_type,80),calc_range:str(b?.calc_range,60),calc_summary:str(b?.calc_summary,600),
    }).select("id").single();
    if(error)throw error;

    // фото (до 4) → приватне сховище, папка власника
    const photos:string[]=[];
    const list=Array.isArray(b?.photos)?b.photos.slice(0,4):[];
    for(let i=0;i<list.length;i++){
      const p=list[i];const mime=String(p?.mime||"");
      if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)||typeof p?.base64!=="string")continue;
      const buf=Buffer.from(p.base64,"base64");
      if(!buf.length||buf.length>8*1024*1024)continue;
      const ext=mime.split("/")[1].replace("jpeg","jpg");
      const path=`${owner}/site-leads/${lead.id}/${i+1}.${ext}`;
      const {error:upErr}=await supabaseAdmin.storage.from(BUCKET).upload(path,buf,{contentType:mime,upsert:true});
      if(!upErr)photos.push(path);
    }
    if(photos.length)await supabaseAdmin.from("site_leads").update({photos}).eq("id",lead.id);
    return NextResponse.json({ok:true,id:lead.id,photos:photos.length});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500});
  }
}
