import OpenAI from "openai";
import {NextRequest,NextResponse} from "next/server";
import {applyBathroomMeasurements,calculateBathroomAreas} from "@/lib/bathroomGeometry";
import {applyCustomerSupplied} from "@/lib/customerSupplied";

type CalcTaskLite={
  id:string;
  name:string;
  category:string;
  unit:"each"|"sqft"|"hour"|"linear_ft"|"room";
  notes?:string;
};

export const runtime="nodejs";

// Reused, unchanged from /api/parse-estimate: guards that keep the
// deterministic room-paint math from misfiring on inches or on
// furniture-scale jobs (closets, cabinets, shelving, vanities).
const INCH_UNIT_RE = /\binch\w*|дюйм\w*|інч\w*|"/i;
const FOOT_UNIT_RE = /\bft\b|\bfoot\b|\bfeet\b|фут\w*/i;
const FURNITURE_SCALE_RE =
  /шаф\w*|клозет\w*|closet\w*|тумбоч\w*|cabinet\w*|полиц\w*|shelf\w*|shelves|wardrobe\w*|гардероб\w*|vanity/i;
const EXCLUDES_CEILING_RE =
  /without\s+(?:the\s+)?ceiling|no\s+ceiling|без\s+стел\w*|стел\w*\s+не\s+(?:фарбувати|потрібно|треба)/i;

function isInchesContext(normalized: string): boolean {
  return INCH_UNIT_RE.test(normalized) && !FOOT_UNIT_RE.test(normalized);
}

// AI інколи ставить CUSTOM, хоча опис — це точна назва роботи з прайсу; повертаємо id,
// інакше рядок втрачає матеріали й оздоблення.
function remapCustomByName(result:any,tasks:{id:string;name:string}[]){
  const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/g," ").trim();
  const byName=new Map(tasks.map(t=>[norm(t.name),t.id]));
  for(const it of result?.items||[]){
    if(it.taskId!=="CUSTOM")continue;
    const id=byName.get(norm(String(it.description||"")));
    if(id)it.taskId=id;
  }
}

// AI інколи повторює ту саму площу двічі («Remove Wallpaper 258» ×2). Для sq ft / lin ft
// однаковий рядок — це дубль; штучні позиції (дві ніші по 1 each) не чіпаємо.
function dropDuplicateAreas(result:any){
  const seen=new Set<string>();
  result.items=(result?.items||[]).filter((it:any)=>{
    if(!/^(sqft|linear_ft)$/.test(String(it.unit))||/^(br|kp)_/.test(String(it.taskId)))return true;
    const k=`${it.taskId}|${Number(it.quantity)}`;
    if(seen.has(k))return false;
    seen.add(k);return true;
  });
}

// Ціну власника беремо лише якщо це число справді є в тексті — AI не може її вигадати.
function keepOnlyStatedPrices(result:any,text:string){
  // скільки разів кожне число є в тексті: «$14» двічі — дві позиції по $14; «$120» один раз — одна позиція
  const left=new Map<number,number>();
  for(const n of text.replace(/(\d),(\d{3})/g,"$1$2").match(/\d+(?:[.,]\d+)?/g)||[]){const v=Number(n.replace(",","."));left.set(v,(left.get(v)||0)+1)}
  for(const it of result?.items||[]){
    const p=Number(it.statedPrice);
    if(!(p>0)||(it.statedPriceType!=="per_unit"&&it.statedPriceType!=="total")){it.statedPrice=null;it.statedPriceType=null}
    else if(!left.has(p)){it.statedPrice=null;it.statedPriceType=null}
    else if((left.get(p)||0)>0)left.set(p,(left.get(p)||0)-1);
    // одну суму AI розбив на кілька рядків (двері + наличник за $120) — праця вже в першому рядку
    else if(it.statedPriceType==="total"){it.statedPrice=0;it.includedInStated=true}
    else{it.statedPrice=null;it.statedPriceType=null}
    if(typeof it.note==="string")it.note=it.note.replace(/\s*\(?(price|quoted|agreed)[^.;)]*\$\s?\d[\d,.]*[^.;)]*\)?[.;]?/gi,"").trim().replace(/^./,(c:string)=>c.toUpperCase())||null;
    if(typeof it.note==="string")it.note=it.note.replace(/[;,]?\s*\b(?:owner[- ])?stated(?: price| total)?\b\.?/gi,"").trim().replace(/[;,]$/,"")||null;
    if(typeof it.note==="string"&&/^(?:labor|labour)(?:\s+only)?\.?$/i.test(it.note.trim()))it.note=null;
  }
}

function isFurnitureScale(normalized: string): boolean {
  return FURNITURE_SCALE_RE.test(normalized);
}

type RoomCalculation = {
  wallNet: number;
  ceiling: number;
  excludesCeiling: boolean;
  note: string;
};

function calculateRoomAreas(text: string): RoomCalculation | null {
  const normalized = text
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/[×х]/g, "x");

  if (isFurnitureScale(normalized)) return null;

  const roomMatch =
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)/i);

  const heightMatch =
    normalized.match(/(?:height|ceiling\w*|висот\w*|стел\w*)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i) ||
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|фут\w*|in|inch\w*|дюйм\w*)?\s*(?:height|ceiling\w*|висот\w*|стел\w*)/i) ||
    normalized.match(/(?:height|ceiling\w*|висот\w*|стел\w*)[^0-9]{0,15}(\d+(?:\.\d+)?)(?!\s*(?:x|на|by|\.?\d))/i);

  if (!roomMatch || !heightMatch) return null;

  const unitDivisor = isInchesContext(normalized) ? 12 : 1;
  const length = Number(roomMatch[1]) / unitDivisor;
  const width = Number(roomMatch[2]) / unitDivisor;
  const height = Number(heightMatch[1]) / unitDivisor;

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
    const area = count * (Number(doorMatch[2]) / unitDivisor) * (Number(doorMatch[3]) / unitDivisor);
    openings += area;
    openingDetails.push(`doors: ${area} sq ft`);
  }

  const windowMatch = normalized.match(
    /(\d+)\s*(?:window\w*|вік\w*)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)/i
  );
  if (windowMatch) {
    const count = Number(windowMatch[1]);
    const area = count * (Number(windowMatch[2]) / unitDivisor) * (Number(windowMatch[3]) / unitDivisor);
    openings += area;
    openingDetails.push(`windows: ${area} sq ft`);
  }

  const wallNet = Math.max(0, wallGross - openings);

  return {
    wallNet,
    ceiling,
    excludesCeiling: EXCLUDES_CEILING_RE.test(normalized),
    note:
      `Verified calculation: gross walls ${wallGross} sq ft` +
      (openingDetails.length ? `; ${openingDetails.join("; ")}` : "") +
      `; net walls ${wallNet} sq ft; ceiling ${ceiling} sq ft.`,
  };
}

// Maps the geometry above onto the calculator's own catalog IDs
// (paint_walls_sqft is priced per actual wall sq ft, unlike the flat-rate
// QuoteCraftAI catalog which only has a per-floor-area room rate).
function applyCalcMeasurements(result: any, text: string) {
  const room = calculateRoomAreas(text);
  if (!room || !Array.isArray(result?.items)) return result;

  const normalized = text.toLowerCase();
  const wantsCeiling = /ceiling|стел/.test(normalized) && !room.excludesCeiling;
  const wantsWalls = /wall|стін|кімнат|room|paint|фарб/.test(normalized);

  if (wantsWalls) {
    result.items = result.items.filter((item: any) => {
      const value = `${item?.taskId ?? ""} ${item?.description ?? ""} ${item?.note ?? ""}`.toLowerCase();
      const isCeiling = /ceiling|стел/.test(value);
      const isPainting = /paint|painting|фарб|interior.*wall|wall.*interior/.test(value);
      return isCeiling || !isPainting;
    });

    result.items.unshift({
      taskId: "paint_walls_sqft",
      description: "Paint walls",
      quantity: room.wallNet,
      unit: "sqft",
      difficulty: "standard",
      note: room.note,
      confidence: 1
    });
  }

  if (wantsCeiling) {
    result.items = result.items.filter((item: any) => {
      const value = `${item?.taskId ?? ""} ${item?.description ?? ""}`.toLowerCase();
      return !/paint_ceiling|paint.*ceiling|ceiling.*paint|фарб.*стел|стел.*фарб/.test(value);
    });

    result.items.push({
      taskId: "paint_ceiling_sqft",
      description: "Paint ceiling",
      quantity: room.ceiling,
      unit: "sqft",
      difficulty: "standard",
      note: `Verified ceiling area: ${room.ceiling} sq ft.`,
      confidence: 1
    });
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
    const tasks=(Array.isArray(body?.tasks)?body.tasks:[]) as CalcTaskLite[];

    if(!text){
      return NextResponse.json({error:"Job description is empty."},{status:400});
    }
    if(!tasks.length){
      return NextResponse.json({error:"Pricing catalog is empty."},{status:400});
    }

    const taskIds=tasks.map(t=>t.id);
    const catalog=tasks.map(t=>({
      taskId:t.id,
      name:t.name,
      category:t.category,
      defaultUnit:t.unit,
      notes:t.notes||""
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
            "You convert informal contractor job descriptions into structured labor/material estimate line items.",
            "The user may speak Ukrainian, English, Russian, mixed language, use slang, omit punctuation, or dictate several jobs in one sentence.",
            "Separate every distinct action into its own item.",
            "Attach every number only to the job it describes.",
            "Square footage must never become the count of a faucet, fan, toilet, vanity, door, or fixture.",
            "For fixtures with no explicit count, quantity is 1.",
            "Never invent a price. Select a taskId from the supplied catalog or use CUSTOM.",
            "Return concise professional English descriptions.",
            "Preserve uncertain details in note and lower confidence.",
            "Do not combine separate areas unless the speaker clearly describes one continuous job.",
            "DIFFICULTY: every item needs a difficulty of basic, standard, or difficult. Default to standard unless the speaker's own words justify otherwise — cramped, tight, awkward access, custom/built-in work, or an unusually complicated layout is difficult; a plain, quick, straightforward swap or install is basic.",
            "OWNER'S STATED PRICES: when the speaker states his own labor price for a job (\"walls at $14\", \"по 14 доларів\", \"door for $120\", \"за 680\"), put that number in statedPrice and set statedPriceType to per_unit (price per sq ft / lin ft / each / hour) or total (lump sum for the whole line). Otherwise statedPrice and statedPriceType are null. Never invent a price and never copy a price into description or note. When one stated price covers several jobs (\"skim coat and paint the ceiling at $8\"), return ONE item for it with that price and do not add separate items for the other jobs it covers. A stated price is labor only; materials and finish are still priced from the list. A stated price never makes an item CUSTOM: always use the matching taskId from the list. Do not write \"Labor\" or the price in note.",
            "WALLS AND NICHES: hanging new wallpaper is wallpaper_install_sqft (never wallpaper_remove_sqft); priming walls before wallpaper is wall_prime_sqft (not painting); a recessed niche in a regular wall (above a toilet or vanity, for art or decor) is wall_niche_drywall_each — shower niches are only for showers; a single wall shelf is shelf_install_each, not an accessories set.",
            "CUSTOMER-SUPPLIED ITEMS: never write supplied, customer-supplied or provided by customer in a description or note unless the speaker explicitly said the customer buys or supplies that item. The estimate prices basic finish materials separately.",
            "PACKAGE RATES: items whose id starts with br_ (category \"Ванна: повний ремонт\") or kp_ (category \"Кухня: повний ремонт\") are the owner's package rates for a full or major bathroom or kitchen remodel (tile demo, shower rebuild, tub or shower replacement, new floor tile, vanity and toilet in one job). When the description is such a remodel, price every line with br_ (bathroom) or kp_ (kitchen) items and do not mix in standalone items for the same work. When the speaker asks for one or two small separate jobs (replace a toilet, hang a mirror), use the standalone items instead, never br_ or kp_ items. A count in the description (2 switches/outlets, 7 light fixtures, 3 doors) is the item quantity — never collapse it to 1.",
            "LOCATION PRICING is handled separately by the user for the whole estimate — never invent or mention a location multiplier yourself.",
            "MEASUREMENT RULE: Never calculate paintable wall area as length times width times height. That is cubic volume, not square footage.",
            "For a rectangular room with length L, width W, and height H, calculate wall area as 2 * (L + W) * H.",
            "For ceiling area, calculate L * W.",
            "Example: a 25 ft by 18 ft room with 8 ft height has 688 sq ft of walls and 450 sq ft of ceiling. Never return 3600 sq ft for a 25 by 18 by 8 room.",
            "Use paint_walls_sqft for wall area painting priced per actual sq ft of wall surface (use this whenever room length, width, and height are given).",
            "Use paint_room_floor_sqft only when the speaker wants a whole room painted quoted by floor area, with no wall dimensions given.",
            "Use paint_ceiling_sqft for ceiling area, calculated as L * W, only when the speaker mentions the ceiling.",
            "Subtract door and window areas from wall area only when the user explicitly provides their dimensions or a reliable area.",
            "If there are multiple identical doors or windows, multiply the opening area by the stated count.",
            "Return a clear note showing gross wall area, deducted opening area, and net paintable wall area whenever you compute wall area yourself.",
            "DRYWALL: use drywall_minor for one small patch or hole (priced each, not per square foot). Use drywall_install_sqft for hanging, taping, mudding, and sanding new drywall over an area, priced per sq ft. Do not add drywall_minor for a hole that is already covered by a drywall_install_sqft area in the same job.",
            "The speaker often gives closet, cabinet, or furniture dimensions in inches (дюйм, інч, inch), not feet. Before computing any square footage, check whether the numbers are inches; if so, divide each dimension by 12 to get feet, then compute area in square feet. Never treat an inch measurement as if it were already a foot measurement — a 64 x 29 inch closet is a few square feet of wall, not thousands.",
            "A closet, cabinet, wardrobe, vanity, or shelving job is furniture-scale work, not a whole-room painting job, even if the word wall or paint appears. Do not produce a whole-room paint_walls_sqft or paint_ceiling_sqft line item for this kind of job; price painting of the specific small surfaces described using each or a correctly small square-foot quantity, and mark this item difficult if it involves custom built-in work.",
            "тубайфори or 2x4 refers to wood stud framing for a wall (drywall_new_wall_frame), not drywall installation or a door.",
            "полиці means shelves; тумбочки means base cabinets — keep them as separate line items when both are mentioned, do not merge them."
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
          name:"calculator_estimate_items",
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
                    taskId:{type:"string",enum:[...taskIds,"CUSTOM"]},
                    description:{type:"string"},
                    quantity:{type:"number",exclusiveMinimum:0},
                    unit:{type:"string",enum:["each","sqft","hour","linear_ft","room"]},
                    difficulty:{type:"string",enum:["basic","standard","difficult"]},
                    note:{type:["string","null"]},
                    confidence:{type:"number",minimum:0,maximum:1},
                    statedPrice:{type:["number","null"]},
                    statedPriceType:{type:["string","null"],enum:["per_unit","total",null]}
                  },
                  required:["taskId","description","quantity","unit","difficulty","note","confidence","statedPrice","statedPriceType"]
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
    const bathroom=applyBathroomMeasurements(parsed,text,"taskId");
    const verified=bathroom.applied&&calculateBathroomAreas(text)?parsed:applyCalcMeasurements(parsed,text);

    applyCustomerSupplied(verified,text,"taskId");
    remapCustomByName(verified,tasks);
    dropDuplicateAreas(verified);
    keepOnlyStatedPrices(verified,text);
    return NextResponse.json(verified);
  }catch(error){
    console.error(error);
    const message=error instanceof Error?error.message:"Unknown server error";
    return NextResponse.json({error:message},{status:500});
  }
}
