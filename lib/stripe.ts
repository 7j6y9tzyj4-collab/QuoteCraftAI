import crypto from "crypto";

// 💳 Stripe без SDK: форма-запити до API і перевірка підпису webhook.
export const stripeOn=()=>!!process.env.STRIPE_SECRET_KEY;

function form(obj:Record<string,unknown>,prefix="",out:string[]=[]):string[]{
  for(const [k,v] of Object.entries(obj)){
    if(v===undefined||v===null)continue;
    const key=prefix?`${prefix}[${k}]`:k;
    if(typeof v==="object")form(v as Record<string,unknown>,key,out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripeReq<T=any>(method:"GET"|"POST",path:string,params?:Record<string,unknown>):Promise<T>{
  const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("Stripe is not configured");
  const body=params?form(params).join("&"):undefined;
  const url=`https://api.stripe.com/v1/${path}${method==="GET"&&body?`?${body}`:""}`;
  const r=await fetch(url,{method,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded"},body:method==="POST"?body:undefined});
  const j=await r.json();
  if(!r.ok)throw new Error(j?.error?.message||`Stripe ${r.status}`);
  return j as T;
}

/** перевірка заголовка Stripe-Signature (t=…,v1=…) */
export function verifyStripe(raw:string,header:string|null,secret:string,toleranceSec=600):boolean{
  if(!header)return false;
  const parts=Object.fromEntries(header.split(",").map(x=>{const i=x.indexOf("=");return [x.slice(0,i),x.slice(i+1)]}));
  const t=parts.t;const sigs=header.split(",").filter(x=>x.startsWith("v1=")).map(x=>x.slice(3));
  if(!t||!sigs.length)return false;
  if(Math.abs(Date.now()/1000-Number(t))>toleranceSec)return false;
  const exp=crypto.createHmac("sha256",secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some(s=>s.length===exp.length&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(exp)));
}

/** розподіл оплати по проєктах у metadata: "sid:amount;sid:amount" */
export const packAlloc=(a:{sid:string;amount:number}[])=>a.map(x=>`${x.sid}:${x.amount.toFixed(2)}`).join(";");
export const unpackAlloc=(s:string)=>String(s||"").split(";").map(x=>{const i=x.lastIndexOf(":");return {sid:x.slice(0,i),amount:Number(x.slice(i+1))||0}}).filter(x=>x.sid&&x.amount>0);
