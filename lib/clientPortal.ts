import {supabaseAdmin} from "./supabaseAdmin";
import {statementTotals,dueNowOf,type Statement} from "./statement";

export const sameClient=(a:string,b:string)=>String(a||"").trim().toLowerCase()===String(b||"").trim().toLowerCase();

/** проєкти клієнта з цифрами — для кабінету клієнта і оплати «все одразу» */
export async function clientProjects(userId:string,client:string){
  const {data:row}=await supabaseAdmin.from("user_statements").select("statements").eq("user_id",userId).maybeSingle();
  const list=((row?.statements||[]) as Statement[]).filter(s=>!s.own&&sameClient(s.client,client));
  return list.map(s=>{const t=statementTotals(s);const d=dueNowOf(s,t);return {s,t,due:d}});
}

/** посилання-рахунок для проєкту: існуюче або нове */
export async function invoiceTokenFor(userId:string,s:Statement,company:string,contact:string):Promise<string>{
  const {data:rows}=await supabaseAdmin.from("shared_quotes").select("token").eq("user_id",userId).eq("data->>kind","invoice").eq("data->>sid",s.id).limit(1);
  const tok=(rows as any[]|null)?.[0]?.token as string|undefined;
  if(tok)return tok;
  const token=crypto.randomUUID();
  await supabaseAdmin.from("shared_quotes").insert({token,user_id:userId,status:"sent",data:{v:1,kind:"invoice",sid:s.id,client:s.client,project:s.project,company,contact}});
  return token;
}
