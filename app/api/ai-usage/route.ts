import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {isAdmin,userFromReq} from "@/lib/aiGuard";

export const runtime="nodejs";
// 🤖 GET — моє використання AI за місяць (+ для адміна: усі користувачі). POST (адмін) — ліміт / перекладач для користувача.
const month=()=>new Date().toISOString().slice(0,7);
export async function GET(req:NextRequest){
  const uid=await userFromReq(req);if(!uid)return NextResponse.json({error:"auth"},{status:401});
  const {data:me}=await supabaseAdmin.from("ai_usage").select("calls,cost,by_feature").eq("user_id",uid).eq("month",month()).maybeSingle();
  const {data:set}=await supabaseAdmin.from("user_settings").select("ai_limit").eq("user_id",uid).maybeSingle();
  const out:any={month:month(),me:me||{calls:0,cost:0,by_feature:{}},limit:(set as any)?.ai_limit??null,admin:isAdmin(uid)};
  if(isAdmin(uid)){
    const {data:users}=await supabaseAdmin.auth.admin.listUsers({perPage:200});
    const {data:use}=await supabaseAdmin.from("ai_usage").select("user_id,calls,cost").eq("month",month());
    const {data:sets}=await supabaseAdmin.from("user_settings").select("user_id,ai_limit,allow_translator,company");
    out.users=(users?.users||[]).map(u=>{const x=(use||[]).find((r:any)=>r.user_id===u.id) as any;const s=(sets||[]).find((r:any)=>r.user_id===u.id) as any;
      return {id:u.id,email:u.email,last:u.last_sign_in_at,company:s?.company?.name||"",calls:x?.calls||0,cost:Number(x?.cost)||0,limit:s?.ai_limit??null,translator:!!s?.allow_translator,admin:isAdmin(u.id)}})
      .sort((a:any,b:any)=>b.cost-a.cost);
    const anon=(use||[]).find((r:any)=>!r.user_id) as any;out.anon=anon?{calls:anon.calls,cost:Number(anon.cost)}:null;
  }
  return NextResponse.json(out);
}
export async function POST(req:NextRequest){
  const uid=await userFromReq(req);if(!isAdmin(uid))return NextResponse.json({error:"admin only"},{status:403});
  const b=await req.json();const id=String(b?.user_id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"bad id"},{status:400});
  const upd:any={user_id:id,updated_at:new Date().toISOString()};
  if("limit" in b)upd.ai_limit=b.limit===null||b.limit===""?null:Math.max(0,Number(b.limit)||0);
  if("translator" in b)upd.allow_translator=!!b.translator;
  const {error}=await supabaseAdmin.from("user_settings").upsert(upd,{onConflict:"user_id"});
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true});
}
