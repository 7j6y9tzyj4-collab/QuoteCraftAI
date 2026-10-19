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
    const {data}=await supabaseAdmin.from("shared_quotes").select("status,accepted_at,data").eq("token",token).maybeSingle();
    if(!data)return NextResponse.json({error:"Estimate not found"},{status:404});
    if(data.status==="accepted")return NextResponse.json({accepted_at:data.accepted_at});
    const accepted_at=new Date().toISOString();
    const upd:Record<string,unknown>={status:"accepted",accepted_at,accepted_name:name};
    // Good / Better / Best — запам'ятовуємо, який варіант обрав клієнт
    const tiers=(data.data as any)?.tiers;
    if(Array.isArray(tiers)&&tiers.length){
      const tier=Number(body?.tier);
      if(!Number.isInteger(tier)||tier<0||tier>=tiers.length)return NextResponse.json({error:"Please choose an option."},{status:400});
      upd.data={...(data.data as object),chosenTier:tier};
    }
    // опційні позиції, які клієнт додав галочками
    const optional=(data.data as any)?.optional;
    if(!upd.data&&Array.isArray(optional)&&Array.isArray(body?.options)){
      const opts=[...new Set((body.options as unknown[]).map(Number).filter(i=>Number.isInteger(i)&&i>=0&&i<optional.length))].sort((a,b)=>a-b);
      upd.data={...(data.data as object),chosenOptions:opts};
    }
    const {error}=await supabaseAdmin.from("shared_quotes").update(upd).eq("token",token);
    if(error)throw error;
    return NextResponse.json({accepted_at});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500});
  }
}
