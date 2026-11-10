import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {loadLink} from "@/lib/workerView";
import {parseReceiptAI} from "@/lib/parseReceiptAI";
import {sendPush,statementTitle} from "@/lib/push";
import {aiGuard} from "@/lib/aiGuard";
import {findDuplicate} from "@/lib/receiptBatch";
import type {Statement} from "@/lib/statement";
import {shopKind,splitShop,shopList,shopAdd,shopToggle,shopDel,shopClearDone} from "@/lib/shop";

export const runtime="nodejs";
export const maxDuration=60;

// Помічник за своїм посиланням: години, чек (AI читає), фото роботи → worker_inbox (власник забирає в Оплати).
const BUCKET="receipts";
const okPhoto=(p:string)=>p.length<=800000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(p);
const toBuf=(p:string)=>Buffer.from(p.split(",")[1],"base64");
const isoToday=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"America/Chicago"});

export async function POST(req:NextRequest){
  try{
    const b=await req.json();
    const link=await loadLink(String(b?.token||""));
    if(!link)return NextResponse.json({error:"Посилання не дійсне. Попроси нове."},{status:404});
    const sid=String(b?.sid||"");
    if(!link.projects.includes(sid))return NextResponse.json({error:"Немає доступу до цього проєкту."},{status:403});
    const base={token:link.token,user_id:link.user_id,worker:link.worker,sid};
    const id=crypto.randomUUID();
    // сповіщення власнику на телефон
    const notify=async(text:string)=>{const t=await statementTitle(link.user_id,sid);await sendPush(link.user_id,{title:`👷 ${link.worker}${t?` · ${t}`:""}`,body:text,url:`/?screen=pay&sid=${encodeURIComponent(sid)}`})};
    if(String(b.action||"").startsWith("shop_")){
      const u=link.user_id;const kind=shopKind(b.kind);
      if(b.action==="shop_add"){
        const text=String(b.text||"").slice(0,1500);
        const ok=text.length<25||(await aiGuard(req,"shop-list",0.001,u)).ok;
        const items=ok?await splitShop(text,kind):text.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
        await shopAdd(u,sid,items,link.worker,kind);
        if(items.length)await notify(`${kind==="punch"?"✅ Доробки:":"🛒 Треба купити:"} ${items.slice(0,6).join(", ")}${items.length>6?` … (+${items.length-6})`:""}`);
      }
      else if(b.action==="shop_toggle"){await shopToggle(u,String(b.id),!!b.done,sid,kind);
        if(kind==="punch"&&b.done&&b.text)await notify(`✅ Зробив доробку: ${String(b.text).slice(0,100)}`)}
      else if(b.action==="shop_del")await shopDel(u,String(b.id),sid,kind);
      else if(b.action==="shop_clear")await shopClearDone(u,sid,kind);
      return NextResponse.json({items:await shopList(u,sid,kind)});
    }
    if(b.action==="hours"){
      const hours=Math.round((Number(b.hours)||0)*4)/4;
      if(!(hours>0&&hours<=16))return NextResponse.json({error:"Вкажи години від 0.25 до 16."},{status:400});
      const date=/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))?String(b.date):isoToday();
      const {error}=await supabaseAdmin.from("worker_inbox").insert({...base,kind:"hours",payload:{date,hours,note:String(b.note||"").slice(0,200)}});
      if(error)throw error;
      await notify(`⏱ Записав ${hours} год за ${date.slice(5).replace("-","/")}${b.note?` — ${String(b.note).slice(0,80)}`:""}`);
      return NextResponse.json({ok:true});
    }
    // 🧾 Чек у 2 кроки: receipt_scan — фото + AI + перевірка дубліката (нічого ще не додано);
    // receipt_confirm — помічник перевірив суму й натиснув «Додати»; receipt_cancel — прибрати фото.
    if(b.action==="receipt_scan"){
      const photo=String(b.photo||"");
      if(!okPhoto(photo))return NextResponse.json({error:"Фото не підходить (JPEG/PNG до ~0.8 МБ)."},{status:400});
      const path=`${link.user_id}/${sid}/${id}.jpg`;
      const up=await supabaseAdmin.storage.from(BUCKET).upload(path,toBuf(photo),{contentType:"image/jpeg",upsert:true});
      if(up.error)throw up.error;
      let r={date:"",store:"",items:"",total:0,receipt_no:"",confidence:0};
      try{if(process.env.OPENAI_API_KEY&&(await aiGuard(req,"worker-receipt",0.008,link.user_id)).ok)r=await parseReceiptAI(photo)}catch{/* без суми — впише вручну */}
      const draft={id,date:r.date||isoToday(),store:r.store||"",items:r.items||"",amount:Number(r.total)||0,receiptNo:r.receipt_no||"",photoPath:path,confidence:r.confidence};
      // дублікати: у всіх проєктах власника + чеки, що вже чекають у вхідних
      let dup="";
      if(draft.amount){
        const [{data:st},{data:pend}]=await Promise.all([
          supabaseAdmin.from("user_statements").select("statements").eq("user_id",link.user_id).maybeSingle(),
          supabaseAdmin.from("worker_inbox").select("sid,payload").eq("user_id",link.user_id).eq("kind","receipt").is("applied_at",null),
        ]);
        for(const s0 of ((st as any)?.statements||[]) as Statement[]){const m=findDuplicate(draft,s0.receipts||[]);if(m){dup=`${m.date} · ${m.store||"чек"} · $${(Number(m.amount)||0).toFixed(2)} — ${s0.own?"«Мої витрати»":`проєкт «${s0.client||""}${s0.project?` — ${s0.project}`:""}»`}`;break}}
        if(!dup)for(const i of (pend||[]) as any[]){if(findDuplicate(draft,[i.payload])){dup=`${i.payload?.date} · ${i.payload?.store||"чек"} · $${(Number(i.payload?.amount)||0).toFixed(2)} — вже надісланий, чекає перевірки`;break}}
      }
      return NextResponse.json({ok:true,draft,dup});
    }
    if(b.action==="receipt_confirm"){
      const d=b.draft||{};
      const path=String(d.photoPath||"");
      if(!path.startsWith(`${link.user_id}/${sid}/`)||!/^[0-9a-f-]{36}$/i.test(String(d.id||"")))return NextResponse.json({error:"Чек не знайдено, сфотографуй ще раз."},{status:400});
      const payload={id:String(d.id),date:String(d.date||isoToday()).slice(0,20),store:String(d.store||"").slice(0,80),items:String(d.items||"").slice(0,500),amount:Math.round((Number(d.amount)||0)*100)/100,receiptNo:String(d.receiptNo||"").slice(0,40),photoPath:path,confidence:Number(d.confidence)||0};
      const {error}=await supabaseAdmin.from("worker_inbox").insert({...base,kind:"receipt",payload});
      if(error)throw error;
      await notify(`🧾 Додав чек${payload.store?` ${payload.store}`:""}${payload.amount?` $${payload.amount.toFixed(2)}`:""}${b.dupOk?" (каже, що це не дубль)":""}`);
      return NextResponse.json({ok:true,receipt:payload});
    }
    if(b.action==="receipt_cancel"){
      const path=String(b.photoPath||"");
      if(path.startsWith(`${link.user_id}/${sid}/`)&&!path.includes("/photos/"))await supabaseAdmin.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ok:true});
    }
    if(b.action==="receipt"||b.action==="photo"){
      const photo=String(b.photo||"");
      if(!okPhoto(photo))return NextResponse.json({error:"Фото не підходить (JPEG/PNG до ~0.8 МБ)."},{status:400});
      const path=b.action==="receipt"?`${link.user_id}/${sid}/${id}.jpg`:`${link.user_id}/${sid}/photos/${id}.jpg`;
      const up=await supabaseAdmin.storage.from(BUCKET).upload(path,toBuf(photo),{contentType:"image/jpeg",upsert:true});
      if(up.error)throw up.error;
      if(b.action==="photo"){
        const {error}=await supabaseAdmin.from("worker_inbox").insert({...base,kind:"photo",payload:{id,path,date:isoToday(),note:String(b.note||"").slice(0,200)}});
        if(error)throw error;
        await notify(`📷 Додав фото роботи${b.note?` — ${String(b.note).slice(0,80)}`:""}`);
        return NextResponse.json({ok:true});
      }
      let r={date:"",store:"",items:"",total:0,receipt_no:"",confidence:0};
      try{if(process.env.OPENAI_API_KEY&&(await aiGuard(req,"worker-receipt",0.008,link.user_id)).ok)r=await parseReceiptAI(photo)}catch{/* збережемо фото без суми */}
      const payload={id,date:r.date||isoToday(),store:r.store||"",items:r.items||"",amount:Number(r.total)||0,receiptNo:r.receipt_no||"",photoPath:path,confidence:r.confidence};
      const {error}=await supabaseAdmin.from("worker_inbox").insert({...base,kind:"receipt",payload});
      if(error)throw error;
      await notify(`🧾 Додав чек${payload.store?` ${payload.store}`:""}${payload.amount?` $${payload.amount.toFixed(2)}`:""} — перевір суму`);
      return NextResponse.json({ok:true,receipt:payload});
    }
    return NextResponse.json({error:"Невідома дія"},{status:400});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500})}
}
