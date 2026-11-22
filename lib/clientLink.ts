import type {User} from "@supabase/supabase-js";
import {supabase} from "./supabase";
import {companyName,companyContact} from "./company";

// 👤 Кабінет клієнта (/q/<token>, kind "client"): усі проєкти, рахунки й залишки клієнта на одній сторінці.
export async function clientPortalLink(user:User,client:string):Promise<string>{
  const name=String(client||"").trim();if(!name)throw new Error("Немає імені клієнта");
  const {data:rows}=await supabase.from("shared_quotes").select("token,data").eq("user_id",user.id).eq("data->>kind","client");
  const hit=((rows||[]) as any[]).find(r=>String(r.data?.client||"").trim().toLowerCase()===name.toLowerCase());
  const data={v:1,kind:"client",client:name,company:companyName(),contact:companyContact()};
  let token=hit?.token as string|undefined;
  if(token){await supabase.from("shared_quotes").update({data,updated_at:new Date().toISOString()}).eq("token",token)}
  else{token=crypto.randomUUID();const {error}=await supabase.from("shared_quotes").insert({token,user_id:user.id,data,status:"sent"});if(error)throw error}
  return `${window.location.origin}/q/${token}`;
}
