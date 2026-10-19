import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {ownerSettings,sendTelegram} from "@/lib/notify";

export const runtime="nodejs";

// Налаштування Telegram у Prices → ACCOUNT:
//  action "find_chat" — після того як написав боту /start, знаходимо твій chat id;
//  action "test"      — тестове повідомлення зі збережених налаштувань.
export async function POST(req:NextRequest){
  try{
    const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    const {data:u}=await supabaseAdmin.auth.getUser(jwt);
    if(!u?.user)return NextResponse.json({error:"Увійди в акаунт."},{status:401});
    const body=await req.json();
    if(body?.action==="find_chat"){
      const tok=String(body?.bot_token||"").trim();
      if(!/^\d+:[\w-]{20,}$/.test(tok))return NextResponse.json({error:"Невірний формат токена бота."},{status:400});
      const r=await fetch(`https://api.telegram.org/bot${tok}/getUpdates`);
      const d=await r.json();
      if(!d?.ok)return NextResponse.json({error:d?.description||"Telegram не прийняв токен."},{status:400});
      const chats=new Map<string,string>();
      for(const up of d.result||[]){const c=up.message?.chat||up.my_chat_member?.chat;if(c)chats.set(String(c.id),[c.first_name,c.last_name,c.title,c.username&&"@"+c.username].filter(Boolean).join(" "))}
      return NextResponse.json({chats:[...chats].map(([id,name])=>({id,name}))});
    }
    const s=await ownerSettings(u.user.id);
    if(!s?.telegram_bot_token||!s.telegram_chat_id)return NextResponse.json({error:"Спершу збережи токен бота й chat id."},{status:400});
    await sendTelegram(s.telegram_bot_token,s.telegram_chat_id,"✅ QuoteCraft: сповіщення працюють. Сюди прийде, коли клієнт відкриє або прийме естімейт.");
    return NextResponse.json({ok:true});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500});
  }
}
