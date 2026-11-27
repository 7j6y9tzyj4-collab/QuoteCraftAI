import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {sendPush} from "@/lib/push";
import {weeklySummary} from "@/lib/weekly";
import {userFromReq} from "@/lib/aiGuard";

export const runtime="nodejs";
export const maxDuration=60;

// 📊 Тижневий підсумок: Vercel Cron щонеділі ввечері (див. vercel.json) → push усім, у кого увімкнені сповіщення.
export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET||"";
  if(secret.length<16||req.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"unauthorized"},{status:401});
  const {data:subs}=await supabaseAdmin.from("push_subs").select("user_id");
  const ids=[...new Set(((subs||[]) as {user_id:string}[]).map(s=>s.user_id).filter(Boolean))];
  let sent=0;
  for(const uid of ids){
    try{const w=await weeklySummary(uid);if(!w)continue;sent+=await sendPush(uid,{title:w.title,body:w.body,url:"/?screen=pay",tag:"weekly"})||0}catch{/* один користувач не ламає решту */}
  }
  return NextResponse.json({ok:true,users:ids.length,sent});
}
// Власник: «надіслати підсумок зараз» (перевірка) — тільки собі.
export async function POST(req:NextRequest){
  const uid=await userFromReq(req);
  if(!uid)return NextResponse.json({error:"Увійдіть в акаунт."},{status:401});
  const w=await weeklySummary(uid);
  if(!w)return NextResponse.json({error:"Ще нема проєктів для підсумку."},{status:400});
  const sent=await sendPush(uid,{title:w.title,body:w.body,url:"/?screen=pay",tag:"weekly"});
  return NextResponse.json({ok:true,sent,lines:w.lines});
}
