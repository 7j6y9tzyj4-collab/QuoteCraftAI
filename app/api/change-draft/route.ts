import OpenAI from "openai";
import {aiGuard} from "@/lib/aiGuard";
import {NextRequest,NextResponse} from "next/server";
import {TARGET_HOUR} from "@/lib/statement";
export const runtime="nodejs";

// 🎤 Доплата голосом: підрядник на об'єкті диктує, що клієнт попросив додатково → готова доплата англійською з цінами.
// Ціну, яку він назвав, беремо як є; де не назвав — оцінюємо години × цільова ціна години.
export async function POST(req:NextRequest){
  const _ai=await aiGuard(req,"change-draft",0.004);if(!_ai.ok)return _ai.res;
  try{
    if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"OPENAI_API_KEY is not configured."},{status:503});
    const body=await req.json();
    const text=String(body?.text||"").trim().slice(0,3000);
    if(text.length<4)return NextResponse.json({error:"Не почув, що додати."},{status:400});
    const project=String(body?.project||"").slice(0,200);
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const r=await client.chat.completions.create({
      model:process.env.OPENAI_MODEL||"gpt-4.1-mini",temperature:0.1,
      messages:[
        {role:"system",content:`You turn a renovation contractor's spoken note (Ukrainian, sometimes mixed with English trade words) into a change order for the client, in clear professional American English.
Project: ${project||"home renovation"}. Chicago area.
Return: title (short, up to 8 words), lines (each a separate piece of extra work: description + labor amount in USD), hours (your estimate of total crew hours for all lines), priced (true only if the contractor stated the price himself).
Pricing rules:
- If the contractor names a price for a line or for everything, use exactly his numbers.
- Otherwise estimate realistic crew hours for an experienced two-person crew and price labor at $${TARGET_HOUR} per hour, rounded to the nearest $5. Small tasks have a $95 minimum.
- Labor only. Do not add materials unless he says a material price; if he does, make it a separate line ending with "(materials)".
- Do not invent work he did not mention. No discounts, no taxes.
Descriptions: one sentence each, concrete (what, where, how much), no prices inside the text.`},
        {role:"user",content:text}
      ],
      response_format:{type:"json_schema",json_schema:{name:"co",strict:true,schema:{type:"object",additionalProperties:false,
        properties:{title:{type:"string"},lines:{type:"array",items:{type:"object",additionalProperties:false,properties:{description:{type:"string"},amount:{type:"number"}},required:["description","amount"]}},hours:{type:"number"},priced:{type:"boolean"}},
        required:["title","lines","hours","priced"]}}}
    });
    const out=JSON.parse(r.choices[0]?.message?.content||"{}");
    const lines=(Array.isArray(out?.lines)?out.lines:[]).map((l:any)=>({description:String(l?.description||"").trim().slice(0,400),amount:Math.round((Number(l?.amount)||0)*100)/100})).filter((l:any)=>l.description).slice(0,12);
    if(!lines.length)throw new Error("Не вдалося скласти доплату — скажи ще раз, що саме додати.");
    return NextResponse.json({title:String(out?.title||"").slice(0,120),lines,hours:Math.round((Number(out?.hours)||0)*10)/10,priced:!!out?.priced});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500});
  }
}
