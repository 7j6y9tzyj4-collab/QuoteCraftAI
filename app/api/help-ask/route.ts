import OpenAI from "openai";
import {NextRequest,NextResponse} from "next/server";
import {HELP} from "@/lib/helpDocs";

export const runtime="nodejs";

// ❓ «Запитати»: відповідь тільки з довідки програми, короткими кроками, мовою питання.
const DOCS=HELP.map(h=>`## ${h.title} [screen: ${h.screen}]\n${h.steps.map((s,i)=>`${i+1}. ${s}`).join("\n")}`).join("\n\n");
export async function POST(req:NextRequest){
  try{
    if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"OPENAI_API_KEY is not configured."},{status:503});
    const b=await req.json();const q=String(b?.q||"").slice(0,500).trim();const screen=String(b?.screen||"");
    if(!q)return NextResponse.json({error:"Напишіть питання."},{status:400});
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const c=await client.chat.completions.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",temperature:0,
      messages:[{role:"system",content:"You are the in-app help for QuoteCraft, an estimating and job-payments app for renovation contractors. Answer ONLY from the help docs below: short numbered steps naming the exact buttons (keep button labels as written). Answer in the language of the question (Ukrainian, English, Russian, Polish, Spanish). If the docs do not cover it, say briefly that this function is not in the app yet. No marketing, max ~6 lines. The user is now on screen: "+screen+"\n\nHELP DOCS:\n"+DOCS},
        {role:"user",content:q}]});
    return NextResponse.json({answer:c.choices[0]?.message?.content||""});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500})}
}
