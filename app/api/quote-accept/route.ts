import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";

export const runtime="nodejs";

// Клієнт натискає «Accept estimate» на сторінці /q/<token>.
export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const token=String(body?.token||"");
    const name=String(body?.name||"").trim().slice(0,120);
    if(!/^[0-9a-f-]{36}$/i.test(token)||!name)return NextResponse.json({error:"Invalid request"},{status:400});
    // старі посилання з AI-кошторису (/e/<token>): лише статус «accepted»
    if(body?.kind==="e"){
      const {data:e}=await supabaseAdmin.from("estimates").select("status").eq("share_token",token).maybeSingle();
      if(!e)return NextResponse.json({error:"Estimate not found"},{status:404});
      if(e.status!=="accepted"){const {error}=await supabaseAdmin.from("estimates").update({status:"accepted"}).eq("share_token",token);if(error)throw error}
      return NextResponse.json({accepted_at:new Date().toISOString()});
    }
    const {data}=await supabaseAdmin.from("shared_quotes").select("status,accepted_at").eq("token",token).maybeSingle();
    if(!data)return NextResponse.json({error:"Estimate not found"},{status:404});
    if(data.status==="accepted")return NextResponse.json({accepted_at:data.accepted_at});
    const accepted_at=new Date().toISOString();
    const {error}=await supabaseAdmin.from("shared_quotes").update({status:"accepted",accepted_at,accepted_name:name}).eq("token",token);
    if(error)throw error;
    return NextResponse.json({accepted_at});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500});
  }
}
