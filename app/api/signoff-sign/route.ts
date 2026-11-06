import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {sendPush} from "@/lib/push";
import {shopList} from "@/lib/shop";
export const runtime="nodejs";
// ✍️ Клієнт підписує здачу роботи: ім'я + підпис пальцем → shared_quotes (status accepted) + push власнику.
export async function POST(req:NextRequest){
  try{
    const b=await req.json();const token=String(b?.token||"");
    if(!/^[0-9a-f-]{36}$/i.test(token))return NextResponse.json({error:"Invalid link."},{status:400});
    const name=String(b?.name||"").trim().slice(0,80);const sig=String(b?.sig||"");
    if(name.length<2)return NextResponse.json({error:"Please type your name."},{status:400});
    if(!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(sig)||sig.length>250000)return NextResponse.json({error:"Please sign in the box."},{status:400});
    const {data}=await supabaseAdmin.from("shared_quotes").select("status,user_id,data").eq("token",token).maybeSingle();
    const d=(data?.data||{}) as any;
    if(!data||d.kind!=="signoff")return NextResponse.json({error:"Link not found."},{status:404});
    if(data.status==="accepted")return NextResponse.json({ok:true,already:true});
    const items=(await shopList(data.user_id,String(d.sid),"punch")).map(i=>({text:i.text,done:i.done}));
    const now=new Date().toISOString();
    const {error}=await supabaseAdmin.from("shared_quotes").update({status:"accepted",accepted_at:now,accepted_name:name,data:{...d,sig,items,signedAt:now},updated_at:now}).eq("token",token).neq("status","accepted");
    if(error)throw error;
    const open=items.filter(i=>!i.done).length;
    await sendPush(data.user_id,{title:`✍️ ${name} підписав(ла) здачу роботи`,body:`${d.project||"Проєкт"}${open?` · лишилось доробок: ${open}`:" · без зауважень"}`,url:`/?screen=pay&sid=${encodeURIComponent(String(d.sid))}`,tag:`signoff-${token}`});
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500})}
}
