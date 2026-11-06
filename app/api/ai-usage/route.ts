import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {isAdmin,userFromReq,DEFAULT_AI_LIMIT} from "@/lib/aiGuard";

export const runtime="nodejs";
// 🤖 GET — моє використання AI за місяць (+ для адміна: усі користувачі). POST (адмін) — ліміт / перекладач для користувача.
const month=()=>new Date().toISOString().slice(0,7);
export async function GET(req:NextRequest){
  const uid=await userFromReq(req);if(!uid)return NextResponse.json({error:"auth"},{status:401});
  const {data:me}=await supabaseAdmin.from("ai_usage").select("calls,cost,by_feature").eq("user_id",uid).eq("month",month()).maybeSingle();
  const {data:set}=await supabaseAdmin.from("user_settings").select("ai_limit").eq("user_id",uid).maybeSingle();
  const out:any={month:month(),me:me||{calls:0,cost:0,by_feature:{}},limit:isAdmin(uid)?null:((set as any)?.ai_limit??DEFAULT_AI_LIMIT),admin:isAdmin(uid)};
  if(isAdmin(uid)){
    const {data:users}=await supabaseAdmin.auth.admin.listUsers({perPage:200});
    const {data:use}=await supabaseAdmin.from("ai_usage").select("user_id,calls,cost,by_feature").eq("month",month());
    // 📊 Статистика активності (тільки кількості — без змісту естімейтів, клієнтів і цін)
    const [{data:est},{data:sq},{data:cl},{data:st},{data:wl},{data:ps}]=await Promise.all([
      supabaseAdmin.from("user_calc_estimates").select("user_id,updated_at").limit(20000),
      supabaseAdmin.from("shared_quotes").select("user_id,viewed_at,accepted_at,created_at,kind:data->>kind").limit(20000),
      supabaseAdmin.from("user_clients").select("user_id").limit(20000),
      supabaseAdmin.from("user_statements").select("user_id,statements"),
      supabaseAdmin.from("worker_links").select("user_id").limit(5000),
      supabaseAdmin.from("push_subs").select("user_id").limit(5000),
    ]);
    const cnt=(rows:any[]|null,id:string,f?:(r:any)=>boolean)=>(rows||[]).filter(r=>r.user_id===id&&(!f||f(r))).length;
    const lastAct=(id:string)=>[...(est||[]).filter((r:any)=>r.user_id===id).map((r:any)=>r.updated_at),...(sq||[]).filter((r:any)=>r.user_id===id).map((r:any)=>r.created_at)].sort().pop()||null;
    const q1=(r:any)=>!r.kind;
    const stats=(id:string)=>({estimates:cnt(est,id),sent:cnt(sq,id,q1),viewed:cnt(sq,id,r=>q1(r)&&(!!r.viewed_at||!!r.accepted_at)),accepted:cnt(sq,id,r=>q1(r)&&!!r.accepted_at),
      clients:cnt(cl,id),projects:((st||[]).find((r:any)=>r.user_id===id) as any)?.statements?.length||0,helpers:cnt(wl,id),push:cnt(ps,id)>0,lastAct:lastAct(id)});
    const {data:sets}=await supabaseAdmin.from("user_settings").select("user_id,ai_limit,allow_translator,company");
    out.users=(users?.users||[]).map(u=>{const x=(use||[]).find((r:any)=>r.user_id===u.id) as any;const s=(sets||[]).find((r:any)=>r.user_id===u.id) as any;
      return {id:u.id,email:u.email,last:u.last_sign_in_at,company:s?.company?.name||"",calls:x?.calls||0,cost:Number(x?.cost)||0,limit:s?.ai_limit??null,translator:!!s?.allow_translator,admin:isAdmin(u.id),created:u.created_at,features:x?.by_feature||{},stats:stats(u.id),blocked:!!((u as any).banned_until&&new Date((u as any).banned_until).getTime()>Date.now())}})
      .sort((a:any,b:any)=>b.cost-a.cost);
    const anon=(use||[]).find((r:any)=>!r.user_id) as any;out.anon=anon?{calls:anon.calls,cost:Number(anon.cost)}:null;
  }
  return NextResponse.json(out);
}
export async function POST(req:NextRequest){
  const uid=await userFromReq(req);if(!isAdmin(uid))return NextResponse.json({error:"admin only"},{status:403});
  const b=await req.json();const id=String(b?.user_id||"");if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"bad id"},{status:400});
  if("blocked" in b&&!isAdmin(id)){
    const {error}=await supabaseAdmin.auth.admin.updateUserById(id,{ban_duration:b.blocked?"876000h":"none"} as any);
    if(error)return NextResponse.json({error:error.message},{status:500});
    if(Object.keys(b).length===2)return NextResponse.json({ok:true});
  }
  const upd:any={user_id:id,updated_at:new Date().toISOString()};
  if("limit" in b)upd.ai_limit=b.limit===null||b.limit===""?null:Math.max(0,Number(b.limit)||0);
  if("translator" in b)upd.allow_translator=!!b.translator;
  const {error}=await supabaseAdmin.from("user_settings").upsert(upd,{onConflict:"user_id"});
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true});
}
