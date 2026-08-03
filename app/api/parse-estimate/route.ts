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

type RoomCalculation = {
  wallGross: number;
  openings: number;
  wallNet: number;
  ceiling: number;
  note: string;
};

function calculateRoomAreas(text: string): RoomCalculation | null {
  const normalized = text
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/[×х]/g, "x");

  const roomMatch =
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)/i);

  const heightMatch =
    normalized.match(/(?:height|висот\w*)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i) ||
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|фут\w*)\s*(?:height|висот\w*)/i);

  if (!roomMatch || !heightMatch) return null;

  const length = Number(roomMatch[1]);
  const width = Number(roomMatch[2]);
  const height = Number(heightMatch[1]);

  if (![length, width, height].every(Number.isFinite)) return null;

  const wallGross = 2 * (length + width) * height;
  const ceiling = length * width;

  let openings = 0;
  const openingDetails: string[] = [];

  const doorMatch = normalized.match(
    /(\d+)\s*(?:door\w*|двер\w*)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)/i
  );

  if (doorMatch) {
    const count = Number(doorMatch[1]);
    const area = count * Number(doorMatch[2]) * Number(doorMatch[3]);
    openings += area;
    openingDetails.push(`doors: ${area} sq ft`);
  }

  const windowMatch = normalized.match(
    /(\d+)\s*(?:window\w*|вік\w*)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)/i
  );

  if (windowMatch) {
    const count = Number(windowMatch[1]);
    const area = count * Number(windowMatch[2]) * Number(windowMatch[3]);
    openings += area;
    openingDetails.push(`windows: ${area} sq ft`);
  }

  const wallNet = Math.max(0, wallGross - openings);

  return {
    wallGross,
    openings,
    wallNet,
    ceiling,
    note:
      `Verified calculation: gross walls ${wallGross} sq ft` +
      (openingDetails.length ? `; ${openingDetails.join("; ")}` : "") +
      `; net walls ${wallNet} sq ft; ceiling ${ceiling} sq ft.`,
  };
}

function applyVerifiedMeasurements(result: any, text: string) {
  const room = calculateRoomAreas(text);
  if (!room || !Array.isArray(result?.items)) return result;

  const normalized = text.toLowerCase();
  const wantsCeiling = /ceiling|стел/.test(normalized);
  const wantsWalls = /wall|стін|кімнат|room/.test(normalized);

  if (wantsWalls) {
    const wallItem = result.items.find(
      (item: any) => item.serviceId === "paint_walls_sqft"
    );

    if (wallItem) {
      wallItem.quantity = room.wallNet;
      wallItem.unit = "sqft";
      wallItem.note = room.note;
      wallItem.confidence = 1;
    } else {
      result.items.push({
        serviceId: "paint_walls_sqft",
        description: "Paint walls",
        quantity: room.wallNet,
        unit: "sqft",
        note: room.note,
        confidence: 1
      });
    }
  }

  if (wantsCeiling) {
    const ceilingItem = result.items.find(
      (item: any) => item.serviceId === "paint_ceiling_sqft"
    );

    if (ceilingItem) {
      ceilingItem.quantity = room.ceiling;
      ceilingItem.unit = "sqft";
      ceilingItem.note = `Verified ceiling area: ${room.ceiling} sq ft.`;
      ceilingItem.confidence = 1;
    } else {
      result.items.push({
        serviceId: "paint_ceiling_sqft",
        description: "Paint ceiling",
        quantity: room.ceiling,
        unit: "sqft",
        note: `Verified ceiling area: ${room.ceiling} sq ft.`,
        confidence: 1
      });
    }
  }

  return result;
}


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
            "MEASUREMENT RULE: Never calculate paintable wall area as length times width times height. That is cubic volume, not square footage.",
            "For a rectangular room with length L, width W, and height H, calculate wall area as 2 * (L + W) * H.",
            "For ceiling area, calculate L * W.",
            "For walls and ceiling together, calculate 2 * (L + W) * H + L * W.",
            "If the user requests painting a room and gives length, width, and height but does not mention the ceiling, calculate walls only.",
            "Always verify that square-foot quantities are areas, never cubic volume.",
            "Example: a 25 ft by 18 ft room with 8 ft height has 688 sq ft of walls, 450 sq ft of ceiling, and 1138 sq ft for walls plus ceiling.",
            "Never return 3600 sq ft for a 25 by 18 by 8 room.",
            "Calculate walls, ceiling, doors, and windows as separate areas.",
            "Wall area for a rectangular room is 2 * (L + W) * H.",
            "Ceiling area is L * W.",
            "Door area is door width * door height for each door.",
            "Window area is window width * window height for each window.",
            "Subtract door and window areas from wall area only when the user explicitly provides their dimensions or a reliable area.",
            "If the user mentions doors or windows without dimensions, do not guess their area and do not subtract anything.",
            "If there are multiple identical doors or windows, multiply the opening area by the stated count.",
            "Return a clear note showing gross wall area, deducted opening area, and net paintable wall area.",
            "Keep wall area and ceiling area as separate estimate items unless the user explicitly asks for one combined total.",
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
    const verified=applyVerifiedMeasurements(parsed,text);
    return NextResponse.json(verified);
  }catch(error){
    console.error(error);
    const message=error instanceof Error?error.message:"Unknown server error";
    return NextResponse.json({error:message},{status:500});
  }
}
