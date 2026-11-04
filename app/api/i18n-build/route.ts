import OpenAI from "openai";
import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {isAdmin,userFromReq} from "@/lib/aiGuard";
import STRINGS from "@/lib/i18n/strings.json";

export const runtime="nodejs";
export const maxDuration=60;
// Адмін: перекласти нові рядки інтерфейсу на англійську (пачками). Повертає, скільки лишилось.
const SYSTEM=["Translate UI strings of a mobile app for renovation contractors (estimates, invoices, receipts, clients, payments) from Ukrainian into short, natural American English UI text.",
  "Keep emojis, symbols (·, →, ✓, ＋, $, %, «») as they are (you may turn «» into quotes), keep {0},{1}… placeholders exactly, keep numbers, brand names and US trade terms.",
  "Use contractor vocabulary: естімейт=estimate, розрахунок=job statement, чек=receipt, доплата=change order, завдаток=deposit, помічник=helper, оплати=payments, прайс/ціни=price list, огляд=site survey, плитка=tile.",
  "Keep leading/trailing punctuation and spacing style. Imperative for buttons. Return the same number of strings in the same order."].join(" ");
export async function POST(req:NextRequest){
  try{
    if(!isAdmin(await userFromReq(req)))return NextResponse.json({error:"admin only"},{status:403});
    const all=STRINGS as string[];
    const have=new Set<string>();let from=0;
    for(;;){const {data}=await supabaseAdmin.from("i18n").select("key").range(from,from+999);if(!data?.length)break;for(const r of data as any[])have.add(r.key);if(data.length<1000)break;from+=1000}
    const missing=all.filter(s=>!have.has(s));
    const batch=missing.slice(0,120);
    if(batch.length){
      const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
      const parts=[batch.slice(0,40),batch.slice(40,80),batch.slice(80,120)].filter(p=>p.length);
      const res=await Promise.all(parts.map(async p=>{
        const c=await client.chat.completions.create({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",temperature:0,
          messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify({strings:p})}],
          response_format:{type:"json_schema",json_schema:{name:"tr",strict:true,schema:{type:"object",additionalProperties:false,properties:{strings:{type:"array",items:{type:"string"}}},required:["strings"]}}}});
        const o=JSON.parse(c.choices[0]?.message?.content||"{}").strings;
        return Array.isArray(o)&&o.length===p.length?p.map((k,i)=>({key:k,en:String(o[i])})):[];
      }));
      const rows=res.flat();
      if(rows.length)await supabaseAdmin.from("i18n").upsert(rows.map(r=>({...r,updated_at:new Date().toISOString()})),{onConflict:"key"});
      return NextResponse.json({total:all.length,remaining:missing.length-rows.length,failed:batch.length-rows.length});
    }
    return NextResponse.json({total:all.length,remaining:0});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500})}
}
