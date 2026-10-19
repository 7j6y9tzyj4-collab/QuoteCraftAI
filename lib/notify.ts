import {supabaseAdmin} from "./supabaseAdmin";

// Налаштування власника (таблиця user_settings): Zelle для завдатку, мінімальна ціна.
export type OwnerSettings={user_id:string;zelle?:string|null;min_job_price?:number|null};

export async function ownerSettings(userId:string):Promise<OwnerSettings|null>{
  if(!userId)return null;
  const {data,error}=await supabaseAdmin.from("user_settings").select("user_id,zelle,min_job_price").eq("user_id",userId).maybeSingle();
  if(error)return null;
  return data as OwnerSettings|null;
}
