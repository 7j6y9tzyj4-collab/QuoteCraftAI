import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";

export const runtime="nodejs";

// Тимчасовий ключ для живого перекладача (/translate): браузер говорить з OpenAI Realtime напряму через WebRTC.
// Основний ключ OpenAI лишається на сервері. Видаємо лише власнику акаунта (вхід у QuoteCraft).
const INSTRUCTIONS=[
  "You are a live voice interpreter between Ukrainian and English for a home-renovation contractor in Chicago and his customers.",
  "When you hear Ukrainian (or Russian), say the same thing in natural American English. When you hear English, say the same thing in natural Ukrainian.",
  "Translate only. Never answer questions, never comment, never add or drop information, never say things like 'he says'. Keep the speaker's person (I/you).",
  "Be fast and short: start speaking right away, no fillers.",
  "Construction words: plitka=tile, zatyrka=grout, gipsokarton/sheetrock=drywall, tumba=vanity, dushova kabina=shower, piddon=shower pan, zmishuvach=faucet/valve, plintus=baseboard, rozetka=outlet, vymykach=switch, kut=corner, nisha=niche, hidroizoliatsiia=waterproofing. In Ukrainian keep US trade words workers use (vanity, drywall, backsplash) if that is clearer.",
  "Keep numbers, prices, sizes in inches/feet exactly. If speech is unclear or just noise, stay silent."
].join(" ");

// GET ?check=1 — перевірка, що OpenAI приймає налаштування (ключ не повертаємо)
export async function GET(req:NextRequest){
  if(req.nextUrl.searchParams.get("check")!=="1")return NextResponse.json({error:"nope"},{status:400});
  const r=await mint("selftest",{});
  return NextResponse.json({ok:!!r.key,model:r.model,transcription:r.transcription,error:r.error});
}

async function mint(userId:string,b:any):Promise<{key?:string;model?:string;transcription?:boolean;error?:string}>{
    const voice=["marin","cedar","alloy","ash","coral","sage","verse"].includes(b?.voice)?b.voice:"marin";
    const models=[process.env.OPENAI_REALTIME_MODEL,"gpt-realtime-2.1","gpt-realtime-2","gpt-realtime"].filter(Boolean) as string[];
    let last="";
    for(const model of models){
      for(const withTr of [true,false]){
        const session:any={type:"realtime",model,instructions:INSTRUCTIONS,output_modalities:["audio"],
          audio:{
            input:{turn_detection:{type:"server_vad",silence_duration_ms:Number(b?.silenceMs)||450,prefix_padding_ms:250,threshold:0.5,create_response:true,interrupt_response:false},
              noise_reduction:{type:"far_field"},...(withTr?{transcription:{model:"gpt-4o-mini-transcribe"}}:{})},
            output:{voice,speed:1.1}}};
        const r=await fetch("https://api.openai.com/v1/realtime/client_secrets",{method:"POST",
          headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json","OpenAI-Safety-Identifier":userId},
          body:JSON.stringify({session,expires_after:{anchor:"created_at",seconds:600}})});
        const d=await r.json().catch(()=>({}));
        if(r.ok&&d?.value)return {key:d.value,model,transcription:withTr};
        last=`${model}${withTr?"+tr":""}: `+(d?.error?.message||`OpenAI ${r.status}`);
      }
    }
    return {error:last};
}

export async function POST(req:NextRequest){
  try{
    const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    const {data:u}=await supabaseAdmin.auth.getUser(jwt);
    if(!u?.user)return NextResponse.json({error:"Увійди в QuoteCraft на цьому телефоні."},{status:401});
    if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"OPENAI_API_KEY is not configured."},{status:503});
    const b=await req.json().catch(()=>({}));
    const r=await mint(u.user.id,b);
    if(r.key)return NextResponse.json(r);
    return NextResponse.json({error:r.error},{status:502});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500})}
}
