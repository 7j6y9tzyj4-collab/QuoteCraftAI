import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {ADMIN_IDS,isAdmin,userFromReq} from "@/lib/aiGuard";
import {sendPush} from "@/lib/push";
export const runtime="nodejs";
// 🆕 Новий користувач зареєструвався → push адміну (тільки якщо акаунт створено щойно).
export async function POST(req:NextRequest){
  const uid=await userFromReq(req);if(!uid||isAdmin(uid))return NextResponse.json({ok:true});
  const {data}=await supabaseAdmin.auth.admin.getUserById(uid);const u=data?.user;
  if(u&&Date.now()-new Date(u.created_at).getTime()<15*60e3)
    for(const a of ADMIN_IDS)await sendPush(a,{title:"🆕 Новий користувач QuoteCraft",body:`${u.email} зареєструвався(лась). Заблокувати можна в ⚙ → Використання AI.`,url:"/?screen=prices",tag:"signup-"+uid});
  return NextResponse.json({ok:true});
}
