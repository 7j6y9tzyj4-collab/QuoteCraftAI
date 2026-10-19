import {supabaseAdmin} from "./supabaseAdmin";

// Налаштування власника (таблиця user_settings): Telegram, Stripe, мінімальна ціна, нагадування.
export type OwnerSettings={
  user_id:string;
  telegram_bot_token?:string|null;
  telegram_chat_id?:string|null;
  stripe_secret_key?:string|null;
  min_job_price?:number|null;
  remind_days?:number|null;
};

export async function ownerSettings(userId:string):Promise<OwnerSettings|null>{
  if(!userId)return null;
  const {data,error}=await supabaseAdmin.from("user_settings").select("*").eq("user_id",userId).maybeSingle();
  if(error)return null; // таблиці ще нема — просто без сповіщень
  return data as OwnerSettings|null;
}

export async function sendTelegram(token:string,chatId:string,text:string){
  const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:chatId,text,parse_mode:"HTML",disable_web_page_preview:true}),
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d?.ok)throw new Error(d?.description||`Telegram ${r.status}`);
}

/** Тихо: сповіщення не повинно ламати сторінку клієнта. */
export async function notifyOwner(userId:string,text:string){
  try{
    const s=await ownerSettings(userId);
    if(!s?.telegram_bot_token||!s.telegram_chat_id)return false;
    await sendTelegram(s.telegram_bot_token,s.telegram_chat_id,text);
    return true;
  }catch{return false}
}

export const esc=(s:string)=>String(s||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c] as string));
export const usd=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
export const appUrl=()=>process.env.NEXT_PUBLIC_APP_URL||"https://quotecraftai-app.vercel.app";

/** Опис естімейту для повідомлення: «Shy — Bathroom Remodel» */
export function quoteLabel(d:any){
  if(d?.kind==="change")return `${esc(d.client||"Клієнт")} — Change order #${d.no}${d.title?` (${esc(d.title)})`:""}`;
  if(d?.kind==="bundle")return `${esc(d.client||"Клієнт")} — усі естімейти (${(d.tokens||[]).length})`;
  return `${esc(d?.client||"Клієнт")} — ${esc(d?.project||"Estimate")}`;
}
