import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
export const runtime="nodejs";

// Прив'язаний iPhone питає: яку заявку на скан зараз чекає користувач? → токен останньої невикористаної (до 20 хв).
export async function POST(req:NextRequest){
  try{
    const b=await req.json();
    const key=String(b.deviceKey||"");
    if(!/^[a-f0-9]{64}$/.test(key))return NextResponse.json({error:"Пристрій не прив'язаний. Введи код з QuoteCraft один раз."},{status:401});
    const {data:dev,error}=await supabaseAdmin.from("scan_devices").select("user_id").eq("key",key).maybeSingle();
    if(error)return NextResponse.json({error:error.message},{status:500});
    if(!dev)return NextResponse.json({error:"Пристрій не прив'язаний. Введи код з QuoteCraft один раз."},{status:401});
    supabaseAdmin.from("scan_devices").update({last_seen:new Date().toISOString()}).eq("key",key).then(()=>{});
    const since=new Date(Date.now()-20*60e3).toISOString();
    const {data,error:e2}=await supabaseAdmin.from("scan_inbox").select("token,room_id,survey_id,created_at").eq("user_id",dev.user_id).is("used_at",null).gte("created_at",since).order("created_at",{ascending:false}).limit(1);
    if(e2)return NextResponse.json({error:e2.message},{status:500});
    const row=data?.[0];
    if(!row)return NextResponse.json({pending:false});
    return NextResponse.json({pending:true,token:row.token});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
