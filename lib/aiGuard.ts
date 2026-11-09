import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "./supabaseAdmin";
import {rateOk,ipOf} from "./rateLimit";

// 🤖 Облік AI: хто скільки використав за місяць (приблизна вартість) + ліміт на користувача.
// user_settings.ai_limit — $ на місяць (null = без ліміту). Адмін (власник програми) — без ліміту.
export const ADMIN_IDS=(process.env.ADMIN_USER_IDS||"239d3941-68b8-4f7d-b058-f1a87f861143").split(",").map(s=>s.trim()).filter(Boolean);
export const isAdmin=(id?:string|null)=>!!id&&ADMIN_IDS.includes(id);
// Ліміт за замовчуванням для нових користувачів (якщо адмін не поставив свій).
export const DEFAULT_AI_LIMIT=Number(process.env.DEFAULT_AI_LIMIT||5);
const month=()=>new Date().toISOString().slice(0,7);

export async function userFromReq(req:NextRequest):Promise<string|null>{
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!jwt||jwt.length<20)return null;
  try{const {data}=await supabaseAdmin.auth.getUser(jwt);return data?.user?.id||null}catch{return null}
}

/** Посилання помічника (заголовок x-worker-token) → власник, за чий рахунок AI. */
async function ownerFromWorkerToken(req:NextRequest):Promise<string|null>{
  const t=req.headers.get("x-worker-token")||"";if(!/^[0-9a-f-]{36}$/i.test(t))return null;
  try{const {data}=await supabaseAdmin.from("worker_links").select("user_id,revoked").eq("token",t).maybeSingle();return data&&!(data as any).revoked?(data as any).user_id:null}catch{return null}
}
/** Перевірити вхід, частоту й місячний ліміт; записати використання.
 *  Без входу (або без дійсного посилання помічника) — 401: платний AI анонімно недоступний. */
export async function aiGuard(req:NextRequest,feature:string,cost:number,userId?:string|null):Promise<{ok:true;userId:string|null}|{ok:false;res:NextResponse}>{
  const uid=userId??await userFromReq(req)??await ownerFromWorkerToken(req);
  if(!uid)return {ok:false,res:NextResponse.json({error:"Увійдіть в акаунт."},{status:401})};
  if(!isAdmin(uid)&&!(await rateOk(`ai:${uid}`,40,60)))return {ok:false,res:NextResponse.json({error:"Забагато запитів підряд. Зачекайте хвилину."},{status:429})};
  if(!(await rateOk(`ai-ip:${ipOf(req)}`,120,60)))return {ok:false,res:NextResponse.json({error:"Забагато запитів. Зачекайте хвилину."},{status:429})};
  try{
    if(!isAdmin(uid)){
      const [{data:set},{data:use}]=await Promise.all([
        supabaseAdmin.from("user_settings").select("ai_limit").eq("user_id",uid).maybeSingle(),
        supabaseAdmin.from("ai_usage").select("cost").eq("user_id",uid).eq("month",month()).maybeSingle(),
      ]);
      const limit=(set as any)?.ai_limit??DEFAULT_AI_LIMIT;const used=Number((use as any)?.cost)||0;
      if(limit!=null&&Number(limit)>=0&&used>=Number(limit))
        return {ok:false,res:NextResponse.json({error:"Ліміт AI на цей місяць вичерпано. Зверніться до адміністратора програми."},{status:429})};
    }
    await supabaseAdmin.rpc("ai_track",{p_user:uid,p_month:month(),p_feature:feature,p_cost:cost});
  }catch{/* облік тимчасово недоступний — користувач увійшов, тож пропускаємо */}
  return {ok:true,userId:uid};
}
