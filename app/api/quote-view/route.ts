import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {sendPush} from "@/lib/push";

export const runtime="nodejs";

// «Клієнт переглянув» — лише якщо це не власник (вхід у QuoteCraft на цьому пристрої або позначка qc_owner) і не робот-превʼю.
export async function POST(req:NextRequest){
  try{
    const {token}=await req.json();
    if(!/^[0-9a-f-]{36}$/i.test(String(token||"")))return NextResponse.json({ok:false},{status:400});
    const ua=req.headers.get("user-agent")||"";
    if(/facebookexternalhit|Twitterbot|Slackbot|WhatsApp|TelegramBot|Discordbot|LinkedInBot|Googlebot|bingbot|preview|crawler|spider|bot\b/i.test(ua))return NextResponse.json({ok:true,skipped:"bot"});
    const {data}=await supabaseAdmin.from("shared_quotes").select("status,user_id,data").eq("token",token).maybeSingle();
    if(!data||data.status!=="sent")return NextResponse.json({ok:true});
    if(req.cookies.get("qc_owner")?.value===data.user_id)return NextResponse.json({ok:true,skipped:"owner"});
    const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    if(jwt){const {data:u}=await supabaseAdmin.auth.getUser(jwt);if(u?.user?.id===data.user_id)return NextResponse.json({ok:true,skipped:"owner"})}
    const {data:upd}=await supabaseAdmin.from("shared_quotes").update({status:"viewed",viewed_at:new Date().toISOString()}).eq("token",token).eq("status","sent").select("token");
    // 👀 сповіщення власнику: клієнт уперше відкрив посилання
    if(upd?.length){
      const d:any=data.data||{};const who=String(d.client||"Клієнт").trim();
      const what=d.kind==="invoice"?"рахунок":d.kind==="change"?"доплату":d.kind==="bundle"?"свої естімейти":"естімейт";
      await sendPush(data.user_id,{title:`👀 ${who} відкрив(ла) ${what}`,body:[d.project,d.kind==="change"?d.title:""].filter(Boolean).join(" · ")||"Посилання переглянуто",url:d.kind==="invoice"&&d.sid?`/?screen=pay&sid=${encodeURIComponent(d.sid)}`:"/",tag:`view-${token}`});
    }
    return NextResponse.json({ok:true});
  }catch{return NextResponse.json({ok:false},{status:500})}
}
