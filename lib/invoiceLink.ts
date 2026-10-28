import type {User} from "@supabase/supabase-js";
import {supabase} from "./supabase";
import type {Statement} from "./statement";
import {COMPANY_NAME,COMPANY_CONTACT} from "./calcPdf";

// Посилання клієнту на «живий» рахунок (/q/<token>): сторінка щоразу бере свіжі цифри з Оплат.
export async function invoiceLink(user:User,s:Statement):Promise<string>{
  const {data:rows}=await supabase.from("shared_quotes").select("token").eq("user_id",user.id).eq("data->>kind","invoice").eq("data->>sid",s.id).limit(1);
  let token=(rows as any[]|null)?.[0]?.token as string|undefined;
  const data={v:1,kind:"invoice",sid:s.id,client:s.client,project:s.project,company:COMPANY_NAME,contact:COMPANY_CONTACT};
  if(token){await supabase.from("shared_quotes").update({data,updated_at:new Date().toISOString()}).eq("token",token)}
  else{
    token=crypto.randomUUID();
    const {error}=await supabase.from("shared_quotes").insert({token,user_id:user.id,data,status:"sent"});
    if(error)throw error;
  }
  return `${window.location.origin}/q/${token}`;
}

export function reminderText(s:Statement,balance:number,link:string,zelle:string){
  const first=String(s.client||"").trim().split(/\s+/)[0]||"there";
  const usd=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(balance);
  return `Hi ${first}, here is the updated invoice for ${s.project||"the project"}: ${link}\nBalance due: ${usd}.${zelle?` Zelle: ${zelle}.`:""}\nThank you!\n— Vasyl, K&V House Renovation`;
}
