import {NextRequest} from "next/server";
import {supabaseAdmin} from "./supabaseAdmin";
// Ліміт частоти: не більше max запитів з ключем key за windowSec. Якщо облік недоступний — пропускаємо (не ламаємо роботу).
export async function rateOk(key:string,max:number,windowSec:number):Promise<boolean>{
  try{const {data,error}=await supabaseAdmin.rpc("rate_hit",{p_key:key,p_max:max,p_window_sec:windowSec});if(error)return true;return data!==false}catch{return true}
}
export const ipOf=(req:NextRequest)=>(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()||req.headers.get("x-real-ip")||"unknown";
