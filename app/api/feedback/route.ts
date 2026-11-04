import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {ADMIN_IDS,isAdmin,userFromReq} from "@/lib/aiGuard";
import {sendPush} from "@/lib/push";

export const runtime="nodejs";
// 💬 Відгук / проблема від користувача → таблиця feedback + push адміну. GET (адмін) — список.
export async function POST(req:NextRequest){
  try{
    const uid=await userFromReq(req);if(!uid)return NextResponse.json({error:"Увійдіть в акаунт."},{status:401});
    const b=await req.json();const text=String(b?.text||"").trim().slice(0,3000);
    if(text.length<3)return NextResponse.json({error:"Напишіть кілька слів."},{status:400});
    const {data:u}=await supabaseAdmin.auth.admin.getUserById(uid);
    const {data:set}=await supabaseAdmin.from("user_settings").select("company").eq("user_id",uid).maybeSingle();
    const company=String((set as any)?.company?.name||"");
    const {error}=await supabaseAdmin.from("feedback").insert({user_id:uid,email:u?.user?.email||"",company,screen:String(b?.screen||"").slice(0,30),text,ua:String(req.headers.get("user-agent")||"").slice(0,200)});
    if(error)throw error;
    if(!isAdmin(uid))for(const a of ADMIN_IDS)await sendPush(a,{title:`💬 Відгук: ${company||u?.user?.email||"користувач"}`,body:text.slice(0,140),url:"/?screen=prices",tag:"feedback"});
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500})}
}
export async function GET(req:NextRequest){
  if(!isAdmin(await userFromReq(req)))return NextResponse.json({error:"admin only"},{status:403});
  const {data}=await supabaseAdmin.from("feedback").select("id,email,company,screen,text,status,created_at").order("created_at",{ascending:false}).limit(50);
  return NextResponse.json({items:data||[]});
}
export async function PATCH(req:NextRequest){
  if(!isAdmin(await userFromReq(req)))return NextResponse.json({error:"admin only"},{status:403});
  const b=await req.json();await supabaseAdmin.from("feedback").update({status:b?.status==="done"?"done":"new"}).eq("id",String(b?.id||""));
  return NextResponse.json({ok:true});
}
