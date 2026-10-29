import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {vapidKeys,sendPush} from "@/lib/push";

export const runtime="nodejs";

// GET — публічний ключ для підписки. POST {sub} — зберегти підписку цього телефону. POST {test:true} — тест. DELETE {endpoint} — вимкнути.
async function owner(req:NextRequest){
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!jwt)return null;
  const {data}=await supabaseAdmin.auth.getUser(jwt);
  return data?.user?.id||null;
}
export async function GET(){
  try{return NextResponse.json({publicKey:(await vapidKeys()).publicKey})}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:"error"},{status:500})}
}
export async function POST(req:NextRequest){
  try{
    const uid=await owner(req);if(!uid)return NextResponse.json({error:"Увійди в QuoteCraft"},{status:401});
    const b=await req.json();
    if(b?.test){const n=await sendPush(uid,{title:"🔔 QuoteCraft",body:"Сповіщення працюють. Так прийде, коли Андрій щось додасть.",url:"/",tag:"test"});return NextResponse.json({ok:n>0,sent:n})}
    const sub=b?.sub;const endpoint=String(sub?.endpoint||"");
    if(!/^https:\/\//.test(endpoint)||!sub?.keys?.p256dh||!sub?.keys?.auth)return NextResponse.json({error:"Bad subscription"},{status:400});
    const {error}=await supabaseAdmin.from("push_subs").upsert({endpoint,user_id:uid,sub,ua:String(req.headers.get("user-agent")||"").slice(0,200),created_at:new Date().toISOString()},{onConflict:"endpoint"});
    if(error)throw error;
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"error"},{status:500})}
}
export async function DELETE(req:NextRequest){
  const uid=await owner(req);if(!uid)return NextResponse.json({error:"auth"},{status:401});
  const b=await req.json().catch(()=>({}));
  await supabaseAdmin.from("push_subs").delete().eq("user_id",uid).eq("endpoint",String(b?.endpoint||""));
  return NextResponse.json({ok:true});
}
