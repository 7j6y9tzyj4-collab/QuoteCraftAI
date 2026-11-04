import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "./supabaseAdmin";

// 🤖 Облік AI: хто скільки використав за місяць (приблизна вартість) + ліміт на користувача.
// user_settings.ai_limit — $ на місяць (null = без ліміту). Адмін (власник програми) — без ліміту.
export const ADMIN_IDS=(process.env.ADMIN_USER_IDS||"239d3941-68b8-4f7d-b058-f1a87f861143").split(",").map(s=>s.trim()).filter(Boolean);
export const isAdmin=(id?:string|null)=>!!id&&ADMIN_IDS.includes(id);
const month=()=>new Date().toISOString().slice(0,7);

export async function userFromReq(req:NextRequest):Promise<string|null>{
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!jwt||jwt.length<20)return null;
  try{const {data}=await supabaseAdmin.auth.getUser(jwt);return data?.user?.id||null}catch{return null}
}

/** Перевірити ліміт і записати використання. Повертає {ok:false,res} якщо ліміт вичерпано. */
export async function aiGuard(req:NextRequest,feature:string,cost:number,userId?:string|null):Promise<{ok:true;userId:string|null}|{ok:false;res:NextResponse}>{
  try{
    const uid=userId??await userFromReq(req);
    if(uid&&!isAdmin(uid)){
      const [{data:set},{data:use}]=await Promise.all([
        supabaseAdmin.from("user_settings").select("ai_limit").eq("user_id",uid).maybeSingle(),
        supabaseAdmin.from("ai_usage").select("cost").eq("user_id",uid).eq("month",month()).maybeSingle(),
      ]);
      const limit=(set as any)?.ai_limit;const used=Number((use as any)?.cost)||0;
      if(limit!=null&&Number(limit)>=0&&used>=Number(limit))
        return {ok:false,res:NextResponse.json({error:"Ліміт AI на цей місяць вичерпано. Зверніться до адміністратора програми."},{status:429})};
    }
    await supabaseAdmin.rpc("ai_track",{p_user:uid,p_month:month(),p_feature:feature,p_cost:cost});
    return {ok:true,userId:uid};
  }catch{return {ok:true,userId:userId??null}} // облік не повинен ламати роботу
}
