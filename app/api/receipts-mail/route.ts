import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {parseReceiptAI,parseReceiptText} from "@/lib/parseReceiptAI";
import {assignMailReceipt} from "@/lib/mailAssign";
import {sendPush} from "@/lib/push";
import {OWN_ID} from "@/lib/statement";

export const runtime="nodejs";
export const maxDuration=60;

// Чеки з Gmail: скрипт у пошті власника (Google Apps Script) надсилає сюди листи магазинів по одному.
// Читаємо чек (картинка e-receipt або текст листа) → вирішуємо, в який розрахунок → mail_receipts → програма додає в Оплати.
const STORES:[RegExp,string][]=[[/flooranddecor/i,"Floor & Decor"],[/homedepot/i,"Home Depot"],[/menards/i,"Menards"],[/lowes/i,"Lowe's"]];
const SKIP=/(on its way|is ready|order'?s ready|ready for pickup|reminder|pick ?up complete|shipped|delivered|out for delivery|tell us|review|survey|rate your|cancel)/i;
const html2text=(h:string)=>h.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi," ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi,"\n").replace(/<[^>]+>/g," ")
  .replace(/&nbsp;|&zwnj;|&#8204;/g," ").replace(/&amp;/g,"&").replace(/&#36;|&dollar;/g,"$").replace(/&[a-z#0-9]+;/gi," ").replace(/[ \t]+/g," ").replace(/\n\s*\n+/g,"\n").trim();
const money=(n:number)=>(n<0?"−":"")+"$"+Math.abs(n).toFixed(2);

export async function POST(req:NextRequest){
  try{
    const b=await req.json();
    const key=String(b?.key||"");
    if(!/^[0-9a-f-]{36}$/i.test(key))return NextResponse.json({error:"bad key"},{status:401});
    const {data:owner}=await supabaseAdmin.from("user_settings").select("user_id").eq("mail_key",key).maybeSingle();
    if(!owner)return NextResponse.json({error:"bad key"},{status:401});
    const userId=owner.user_id as string;
    const msgId=String(b?.id||"").slice(0,100);const from=String(b?.from||"");const subject=String(b?.subject||"").slice(0,300);const html=String(b?.html||"");
    if(!msgId)return NextResponse.json({error:"no id"},{status:400});
    const dry=b?.dry===true; // перевірка: прочитати й розкласти, нічого не записуючи
    const {data:seen}=dry?{data:null}:await supabaseAdmin.from("mail_receipts").select("id").eq("user_id",userId).eq("msg_id",msgId).maybeSingle();
    if(seen)return NextResponse.json({ok:true,dup:true});
    const store=STORES.find(([re])=>re.test(from))?.[1]||"";
    if(!store||SKIP.test(subject))return NextResponse.json({ok:true,skipped:"not a receipt"});
    if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"OPENAI_API_KEY missing"},{status:503});

    // 1) картинка чека в листі (Floor & Decor, Home Depot e-receipt)
    const img=[...html.matchAll(/<img[^>]+>/gi)].map(m=>m[0]).find(t=>/alt=["'][^"']*receipt/i.test(t)||/src=["'][^"']*receipt[^"']*\.(jpe?g|png)/i.test(t));
    const src=img?.match(/src=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g,"&");
    let rec={date:"",store,items:"",amount:0,receiptNo:"",job:""};let photoPath="";let conf=0;
    if(src&&/^https:\/\//.test(src)){
      const r=await fetch(src);if(!r.ok)throw new Error("receipt image "+r.status);
      const buf=Buffer.from(await r.arrayBuffer());const type=r.headers.get("content-type")||"image/jpeg";
      const p=await parseReceiptAI(`data:${type};base64,${buf.toString("base64")}`);
      rec={date:p.date,store:p.store||store,items:p.items,amount:Number(p.total)||0,receiptNo:p.receipt_no||"",job:p.job||""};conf=p.confidence;
      const id=crypto.randomUUID();photoPath=`${userId}/mail/${id}.jpg`;
      if(!dry){const up=await supabaseAdmin.storage.from("receipts").upload(photoPath,buf,{contentType:type,upsert:true});if(up.error)photoPath=""}
    }else{
      // 2) текст листа (онлайн-замовлення, Menards, Lowe's)
      const p=await parseReceiptText(`From: ${from}\nSubject: ${subject}\n\n${html2text(html)}`);
      if(!p.is_receipt||!p.total){
        if(dry)return NextResponse.json({ok:true,dry:true,skipped:"not a receipt",parsed:p});
        await supabaseAdmin.from("mail_receipts").insert({user_id:userId,msg_id:msgId,store,subject,status:"skipped",reason:"не чек",payload:{}});
        return NextResponse.json({ok:true,skipped:"not a receipt"});
      }
      rec={date:p.date,store:p.store||store,items:p.items,amount:Number(p.total)||0,receiptNo:p.receipt_no||"",job:p.job||""};conf=p.confidence;
    }
    const a=await assignMailReceipt(userId,rec);
    const payload={id:crypto.randomUUID(),date:rec.date,store:rec.store,items:rec.items,amount:rec.amount,receiptNo:rec.receiptNo||undefined,photoPath:photoPath||undefined,job:rec.job||undefined,readConf:conf};
    const status=a.dupOf?"skipped":a.sid?"auto":"review";
    if(dry)return NextResponse.json({ok:true,dry:true,status,assign:a,receipt:payload});
    const {error}=await supabaseAdmin.from("mail_receipts").insert({user_id:userId,msg_id:msgId,store:rec.store,subject,payload,sid:a.sid,suggest:a.suggest,reason:a.reason,confidence:a.confidence,status});
    if(error)throw error;
    if(status!=="skipped"){
      let where="";
      if(a.sid===OWN_ID)where="Мої витрати";
      else if(a.sid){const {data:st}=await supabaseAdmin.from("user_statements").select("statements").eq("user_id",userId).maybeSingle();const s=((st?.statements||[]) as any[]).find(x=>x.id===a.sid);where=s?.client||""}
      await sendPush(userId,{title:`🧾 ${rec.store} ${money(rec.amount)}`,body:status==="auto"?`→ ${where} (${a.reason})`:"Треба розібрати: куди цей чек?",url:"/?screen=pay"});
    }
    return NextResponse.json({ok:true,status,reason:a.reason});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500})}
}
