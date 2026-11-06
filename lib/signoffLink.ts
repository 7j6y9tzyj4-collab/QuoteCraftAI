import type {User} from "@supabase/supabase-js";
import {supabase} from "./supabase";
import type {Statement} from "./statement";
import {companyName,companyContact,signature} from "./company";

// ✍️ Посилання клієнту на підпис здачі роботи (/q/<token>, kind "signoff"). Одне на проєкт; після підпису — нове не створюємо.
export type SignoffRow={token:string;status:string;accepted_at:string|null;accepted_name:string|null;data:any};
export async function getSignoff(user:User,sid:string):Promise<SignoffRow|null>{
  const {data}=await supabase.from("shared_quotes").select("token,status,accepted_at,accepted_name,data").eq("user_id",user.id).eq("data->>kind","signoff").eq("data->>sid",sid).order("created_at",{ascending:false}).limit(1);
  return ((data as any[]|null)?.[0]||null) as SignoffRow|null;
}
export async function signoffLink(user:User,s:Statement):Promise<string>{
  const cur=await getSignoff(user,s.id);
  let token=cur?.token;
  const data={v:1,kind:"signoff",sid:s.id,client:s.client,project:s.project,company:companyName(),contact:companyContact()};
  if(token&&cur?.status!=="accepted")await supabase.from("shared_quotes").update({data:{...cur?.data,...data},updated_at:new Date().toISOString()}).eq("token",token);
  if(!token){
    token=crypto.randomUUID();
    const {error}=await supabase.from("shared_quotes").insert({token,user_id:user.id,data,status:"sent"});
    if(error)throw error;
  }
  return `${window.location.origin}/q/${token}`;
}
export function signoffText(s:Statement,link:string){
  const first=String(s.client||"").trim().split(/\s+/)[0]||"there";
  return `Hi ${first}, the work on ${s.project||"your project"} is complete. Please take a look and confirm here (it takes 30 seconds, you can sign with your finger):\n${link}\nIf anything still needs attention, just let me know.\n${signature()}`;
}
