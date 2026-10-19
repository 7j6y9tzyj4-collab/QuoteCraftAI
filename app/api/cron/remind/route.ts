import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {ownerSettings,notifyOwner,quoteLabel,appUrl} from "@/lib/notify";

export const runtime="nodejs";
export const maxDuration=60;

// Щодня (vercel.json): нагадування в Telegram —
//  • клієнт не відкрив посилання N днів (N = user_settings.remind_days, за замовчуванням 3);
//  • відкрив, але не прийняв N+2 днів.
// Кожне нагадування — один раз (data.reminded).
const DAY=86400000;
export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET||"";
  if(secret.length<16||req.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"unauthorized"},{status:401});
  const since=new Date(Date.now()-30*DAY).toISOString();
  const {data,error}=await supabaseAdmin.from("shared_quotes").select("token,user_id,status,created_at,viewed_at,data").neq("status","accepted").gte("created_at",since).limit(1000);
  if(error)return NextResponse.json({error:error.message},{status:500});
  const days=new Map<string,number>();
  let sent=0;
  for(const r of data||[]){
    const d:any=r.data||{};
    if(d.kind==="bundle")continue;
    if(!days.has(r.user_id)){const s=await ownerSettings(r.user_id);days.set(r.user_id,s?.telegram_bot_token&&s.telegram_chat_id?Math.max(1,Number(s.remind_days)||3):0)}
    const n=days.get(r.user_id)||0;
    if(!n)continue;
    const reminded:string[]=Array.isArray(d.reminded)?d.reminded:[];
    const age=(iso:string|null)=>iso?(Date.now()-new Date(iso).getTime())/DAY:0;
    let kind="",text="";
    if(r.status==="sent"&&age(r.created_at)>=n&&!reminded.includes("unopened")){
      kind="unopened";text=`⏰ Клієнт ще не відкрив естімейт (${Math.floor(age(r.created_at))} дн.): <b>${quoteLabel(d)}</b>\nВарто нагадати.`;
    }else if(r.status==="viewed"&&age(r.viewed_at)>=n+2&&!reminded.includes("unaccepted")){
      kind="unaccepted";text=`⏰ Клієнт переглянув, але не прийняв (${Math.floor(age(r.viewed_at))} дн.): <b>${quoteLabel(d)}</b>\nМожна подзвонити й спитати, чи є питання.`;
    }
    if(!kind)continue;
    const ok=await notifyOwner(r.user_id,`${text}\n${appUrl()}/q/${r.token}`);
    if(ok){sent++;await supabaseAdmin.from("shared_quotes").update({data:{...d,reminded:[...reminded,kind]}}).eq("token",r.token)}
  }
  return NextResponse.json({ok:true,checked:(data||[]).length,sent});
}
