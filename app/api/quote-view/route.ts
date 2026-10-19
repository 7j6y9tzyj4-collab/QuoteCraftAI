import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";

export const runtime="nodejs";

// «Клієнт переглянув» — лише якщо це не власник (вхід у QuoteCraft на цьому пристрої або позначка qc_owner) і не робот-превʼю.
export async function POST(req:NextRequest){
  try{
    const {token}=await req.json();
    if(!/^[0-9a-f-]{36}$/i.test(String(token||"")))return NextResponse.json({ok:false},{status:400});
    const ua=req.headers.get("user-agent")||"";
    if(/facebookexternalhit|Twitterbot|Slackbot|WhatsApp|TelegramBot|Discordbot|LinkedInBot|Googlebot|bingbot|preview|crawler|spider|bot\b/i.test(ua))return NextResponse.json({ok:true,skipped:"bot"});
    const {data}=await supabaseAdmin.from("shared_quotes").select("status,user_id").eq("token",token).maybeSingle();
    if(!data||data.status!=="sent")return NextResponse.json({ok:true});
    if(req.cookies.get("qc_owner")?.value===data.user_id)return NextResponse.json({ok:true,skipped:"owner"});
    const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    if(jwt){const {data:u}=await supabaseAdmin.auth.getUser(jwt);if(u?.user?.id===data.user_id)return NextResponse.json({ok:true,skipped:"owner"})}
    await supabaseAdmin.from("shared_quotes").update({status:"viewed",viewed_at:new Date().toISOString()}).eq("token",token).eq("status","sent");
    return NextResponse.json({ok:true});
  }catch{return NextResponse.json({ok:false},{status:500})}
}
