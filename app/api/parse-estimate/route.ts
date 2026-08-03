import OpenAI from "openai";
import {NextRequest,NextResponse} from "next/server";

type PriceRule={
  id:string;
  name:string;
  aliases:string[];
  unit:"each"|"sqft"|"hour"|"linear_ft"|"room";
  rate:number;
};

export const runtime="nodejs";

export async function POST(request:NextRequest){
  try{
    if(!process.env.OPENAI_API_KEY){
      return NextResponse.json(
        {error:"OPENAI_API_KEY is not configured in Vercel."},
        {status:503}
      );
    }

    const body=await request.json();
    const text=String(body?.text||"").trim();
    const prices=(Array.isArray(body?.prices)?body.prices:[]) as PriceRule[];

    if(!text){
      return NextResponse.json({error:"Job description is empty."},{status:400});
    }
    if(!prices.length){
      return NextResponse.json({error:"Price library is empty."},{status:400});
    }

    const serviceIds=prices.map(p=>p.id);
    const catalog=prices.map(p=>({
      serviceId:p.id,
      name:p.name,
      aliases:p.aliases,
      defaultUnit:p.unit
    }));

    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const model=process.env.OPENAI_MODEL||"gpt-4.1-mini";

    const completion=await client.chat.completions.create({
      model,
      temperature:0,
      messages:[
        {
          role:"system",
          content:[
            "You convert informal contractor job descriptions into structured estimate line items.",
            "The user may speak Ukrainian, English, Russian, mixed language, use slang, omit punctuation, or dictate several jobs in one sentence.",
            "Separate every distinct action into its own item.",
            "Attach every number only to the job it describes.",
            "Square footage must never become the count of a faucet, fan, toilet, vanity, door, or fixture.",
            "For fixtures with no explicit count, quantity is 1.",
            "For 'paint one wall' without area, use the matching each-based service when available.",
            "For painting with an area, use the square-foot service.",
            "Never invent a price. Select a serviceId from the supplied catalog or use CUSTOM.",
            "Return concise professional English descriptions.",
            "Preserve uncertain details in note and lower confidence.",
            "Do not combine separate areas unless the speaker clearly describes one continuous job."
          ].join(" ")
        },
        {
          role:"user",
          content:JSON.stringify({
            jobDescription:text,
            serviceCatalog:catalog
          })
        }
      ],
      response_format:{
        type:"json_schema",
        json_schema:{
          name:"contractor_estimate_items",
          strict:true,
          schema:{
            type:"object",
            additionalProperties:false,
            properties:{
              items:{
                type:"array",
                items:{
                  type:"object",
                  additionalProperties:false,
                  properties:{
                    serviceId:{type:"string",enum:[...serviceIds,"CUSTOM"]},
                    description:{type:"string"},
                    quantity:{type:"number",exclusiveMinimum:0},
                    unit:{type:"string",enum:["each","sqft","hour","linear_ft","room"]},
                    note:{type:["string","null"]},
                    confidence:{type:"number",minimum:0,maximum:1}
                  },
                  required:["serviceId","description","quantity","unit","note","confidence"]
                }
              }
            },
            required:["items"]
          }
        }
      }
    });

    const raw=completion.choices[0]?.message?.content;
    if(!raw){
      return NextResponse.json({error:"AI returned an empty response."},{status:502});
    }

    const parsed=JSON.parse(raw);
    return NextResponse.json(parsed);
  }catch(error){
    console.error(error);
    const message=error instanceof Error?error.message:"Unknown server error";
    return NextResponse.json({error:message},{status:500});
  }
}
