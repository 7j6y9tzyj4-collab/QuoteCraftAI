import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {userFromReq} from "@/lib/aiGuard";
import {getLessons,saveLesson} from "@/lib/lessons";
export const runtime="nodejs";
// 🧠 Що програма запам'ятала: список правил, додати своє, вимкнути/видалити.
export async function GET(req:NextRequest){
  const uid=await userFromReq(req);if(!uid)return NextResponse.json({error:"auth"},{status:401});
  return NextResponse.json({items:await getLessons(uid,200)});
}
export async function POST(req:NextRequest){
  const uid=await userFromReq(req);if(!uid)return NextResponse.json({error:"auth"},{status:401});
  const b=await req.json();
  if(b?.action==="delete")await supabaseAdmin.from("calc_lessons").delete().eq("id",String(b.id)).eq("user_id",uid);
  else if(b?.action==="edit")await supabaseAdmin.from("calc_lessons").update({text:String(b.text||"").trim().slice(0,300),updated_at:new Date().toISOString()}).eq("id",String(b.id)).eq("user_id",uid);
  else if(b?.action==="add")await saveLesson(uid,String(b.text||""),"manual");
  return NextResponse.json({items:await getLessons(uid,200)});
}
