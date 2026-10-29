import webpush from "web-push";
import {supabaseAdmin} from "./supabaseAdmin";

// Push-сповіщення на телефон власника (Web Push; iPhone — коли QuoteCraft додано на головний екран).
// Ключі VAPID генеруються один раз і лежать у таблиці app_secrets (читає лише сервер).
let cached:{publicKey:string;privateKey:string}|null=null;

export async function vapidKeys(){
  if(cached)return cached;
  if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)return cached={publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY};
  const read=async()=>{
    const {data}=await supabaseAdmin.from("app_secrets").select("value").eq("key","vapid").maybeSingle();
    return data?.value as {publicKey:string;privateKey:string}|undefined;
  };
  let v=await read();
  if(!v){
    const k=webpush.generateVAPIDKeys();
    await supabaseAdmin.from("app_secrets").upsert({key:"vapid",value:k},{onConflict:"key",ignoreDuplicates:true});
    v=await read();
  }
  if(!v)throw new Error("VAPID keys unavailable");
  return cached=v;
}

export type PushMsg={title:string;body:string;url?:string;tag?:string};

/** Надіслати на всі пристрої власника. Помилки не ламають основну дію. */
export async function sendPush(userId:string,msg:PushMsg){
  try{
    const {data:subs}=await supabaseAdmin.from("push_subs").select("endpoint,sub").eq("user_id",userId);
    if(!subs?.length)return 0;
    const k=await vapidKeys();
    webpush.setVapidDetails("https://quotecraftai-app.vercel.app",k.publicKey,k.privateKey);
    const payload=JSON.stringify({title:msg.title,body:msg.body,url:msg.url||"/?screen=pay",tag:msg.tag});
    let sent=0;
    await Promise.all(subs.map(async(s:any)=>{
      try{await webpush.sendNotification(s.sub,payload,{TTL:60*60*24});sent++}
      catch(e:any){if(e?.statusCode===404||e?.statusCode===410)await supabaseAdmin.from("push_subs").delete().eq("endpoint",s.endpoint)}
    }));
    return sent;
  }catch{return 0}
}

/** Назва проєкту (клієнт) для тексту сповіщення. */
export async function statementTitle(userId:string,sid:string){
  try{
    const {data}=await supabaseAdmin.from("user_statements").select("statements").eq("user_id",userId).maybeSingle();
    const s=((data?.statements||[]) as any[]).find(x=>x?.id===sid);
    return s?String(s.client||s.project||"").trim():"";
  }catch{return ""}
}
