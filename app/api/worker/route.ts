import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {loadLink} from "@/lib/workerView";
import {parseReceiptAI} from "@/lib/parseReceiptAI";

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
    if(b.action==="hours"){
      const hours=Math.round((Number(b.hours)||0)*4)/4;
      if(!(hours>0&&hours<=16))return NextResponse.json({error:"Вкажи години від 0.25 до 16."},{status:400});
      const date=/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))?String(b.date):isoToday();
      const {error}=await supabaseAdmin.from("worker_inbox").insert({...base,kind:"hours",payload:{date,hours,note:String(b.note||"").slice(0,200)}});
      if(error)throw error;
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
        return NextResponse.json({ok:true});
      }
      let r={date:"",store:"",items:"",total:0,receipt_no:"",confidence:0};
      try{if(process.env.OPENAI_API_KEY)r=await parseReceiptAI(photo)}catch{/* збережемо фото без суми */}
      const payload={id,date:r.date||isoToday(),store:r.store||"",items:r.items||"",amount:Number(r.total)||0,receiptNo:r.receipt_no||"",photoPath:path,confidence:r.confidence};
      const {error}=await supabaseAdmin.from("worker_inbox").insert({...base,kind:"receipt",payload});
      if(error)throw error;
      return NextResponse.json({ok:true,receipt:payload});
    }
    return NextResponse.json({error:"Невідома дія"},{status:400});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500})}
}
