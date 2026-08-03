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
  const wantsWalls = /wall|стін|кімнат|room|paint|фарб/.test(normalized);

  if (wantsWalls) {
    // Remove every AI-generated wall/interior painting item,
    // so an incorrect AI quantity or note cannot remain visible.
    result.items = result.items.filter((item: any) => {
      const value =
        `${item?.serviceId ?? ""} ${item?.description ?? ""} ${item?.note ?? ""}`
          .toLowerCase();

      const isCeiling = /ceiling|стел/.test(value);
      const isPainting =
        /paint|painting|фарб|interior.*wall|wall.*interior/.test(value);

      return isCeiling || !isPainting;
    });

    result.items.unshift({
      serviceId: "paint_walls_sqft",
      description: "Paint walls",
      quantity: room.wallNet,
      unit: "sqft",
      note: room.note,
      confidence: 1
    });
  }

  if (wantsCeiling) {
    result.items = result.items.filter((item: any) => {
      const value =
        `${item?.serviceId ?? ""} ${item?.description ?? ""}`
          .toLowerCase();

      return !/paint_ceiling|paint.*ceiling|ceiling.*paint|фарб.*стел|стел.*фарб/.test(value);
    });

    result.items.push({
      serviceId: "paint_ceiling_sqft",
      description: "Paint ceiling",
      quantity: room.ceiling,
      unit: "sqft",
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
    const prices=(Array.isArray(body?.prices)?body.prices:[]) as PriceRule[];

    if(!text){
      return NextResponse.json({error:"Job description is empty."},{status:400});
    }
    if(!prices.length){
      return NextResponse.json({error:"Price library is empty."},{status:400});
    }

    let deterministicPaintItems: any[] = [];

    // DETERMINISTIC_ROOM_PAINT_CALCULATION
    // Room geometry is calculated here, before OpenAI is called.
    {
      const normalized = text
        .toLowerCase()
        .replace(/,/g, ".")
        .replace(/[×х]/g, "x");

      const roomMatch = normalized.match(
        /(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)/
      );

      const heightMatch =
        normalized.match(
          /(?:height|висот\w*)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/
        ) ||
        normalized.match(
          /(?:height|висот\w*)[^0-9]{0,15}(\d+(?:\.\d+)?)/
        );

      const isPainting =
        /paint|painting|пофарб|фарбув|фарб/.test(normalized);

      if (roomMatch && heightMatch && isPainting) {
        const length = Number(roomMatch[1]);
        const width = Number(roomMatch[2]);
        const height = Number(heightMatch[1]);

        const grossWalls = 2 * (length + width) * height;
        const ceilingArea = length * width;

        let doorArea = 0;
        let windowArea = 0;

        const doorMatch = normalized.match(
          /(\d+)\s*(?:door\w*|двер\w*)[^0-9]{0,25}(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)/
        );

        if (doorMatch) {
          doorArea =
            Number(doorMatch[1]) *
            Number(doorMatch[2]) *
            Number(doorMatch[3]);
        }

        const windowMatch = normalized.match(
          /(\d+)\s*(?:window\w*|вік\w*)[^0-9]{0,25}(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)/
        );

        if (windowMatch) {
          windowArea =
            Number(windowMatch[1]) *
            Number(windowMatch[2]) *
            Number(windowMatch[3]);
        }

        const netWalls = Math.max(
          0,
          grossWalls - doorArea - windowArea
        );

        const excludesCeiling =
          /without\s+(?:the\s+)?ceiling|no\s+ceiling|без\s+стел\w*|стел\w*\s+не\s+(?:фарбувати|потрібно|треба)/.test(normalized);

        const wantsCeiling =
          /ceiling|стел/.test(normalized) && !excludesCeiling;
        const items: any[] = [];

        items.push({
          serviceId: "paint_walls_sqft",
          description: "Paint walls",
          quantity: netWalls,
          unit: "sqft",
          note:
            `Verified calculation: gross walls ${grossWalls} sq ft; ` +
            `door area ${doorArea} sq ft; ` +
            `window area ${windowArea} sq ft; ` +
            `net paintable walls ${netWalls} sq ft.`,
          confidence: 1
        });

        if (wantsCeiling) {
          items.push({
            serviceId: "paint_ceiling_sqft",
            description: "Paint ceiling",
            quantity: ceilingArea,
            unit: "sqft",
            note: `Verified ceiling area: ${length} × ${width} = ${ceilingArea} sq ft.`,
            confidence: 1
          });
        }

        deterministicPaintItems = items;
      }
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
            "DRYWALL PRICING CONTEXT: If drywall patching is part of painting or renovating the same room, use a drywall patch add-on service, not the standalone repair visit.",
            "Use drywall_patch_addon_minor for one small patch or hole that is repaired while the room is already being painted.",
            "Use drywall_patch_addon_medium for a medium patch requiring more mudding and sanding while the room is already being painted.",
            "Use drywall_patch_addon_large when damaged drywall must be cut out and replaced while the room is already being painted.",
            "Use drywall_repair_standalone only when the customer requests a separate visit primarily for drywall repair and localized touch-up, without painting the whole room.",
            "Do not charge both a standalone drywall repair and a drywall add-on for the same hole.",
            "Primer and painting of the whole wall or room remain separate painting items.",
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

    if (deterministicPaintItems.length) {
      const otherItems = Array.isArray(verified?.items)
        ? verified.items.filter((item: any) => {
            const value =
              `${item?.serviceId ?? ""} ${item?.description ?? ""}`
                .toLowerCase();

            return !(
              /paint_walls_sqft|paint_ceiling_sqft/.test(value) ||
              /paint.*wall|wall.*paint|paint.*ceiling|ceiling.*paint/.test(value)
            );
          })
        : [];

      verified.items = [...deterministicPaintItems, ...otherItems];
    }

    // DETERMINISTIC_DRYWALL_PRICING
    {
      const normalized = text
        .toLowerCase()
        .replace(/,/g, ".");

      const mentionsDrywall =
        /drywall|гіпсокартон|отвор|дірк|латк|patch|hole/.test(normalized);

      const paintingWholeRoom =
        /paint|painting|пофарб|фарбув|фарб/.test(normalized) &&
        /room|кімнат|wall|стін/.test(normalized);

      const standaloneOnly =
        /drywall repair only|standalone|тільки залатати|лише залатати|тільки ремонт гіпсокартону|без фарбування кімнати/.test(normalized);

      if (mentionsDrywall && Array.isArray(verified?.items)) {
        verified.items = verified.items.filter((item: any) => {
          const id = String(item?.serviceId ?? "");
          return ![
            "drywall_patch_addon_minor",
            "drywall_patch_addon_medium",
            "drywall_patch_addon_large",
            "drywall_repair_standalone"
          ].includes(id);
        });

        let serviceId = "drywall_patch_addon_minor";
        let description = "Minor drywall patch add-on";
        let note =
          "Small drywall patch completed as part of the room painting project.";

        if (standaloneOnly || !paintingWholeRoom) {
          serviceId = "drywall_repair_standalone";
          description = "Standalone drywall repair visit";
          note =
            "Separate drywall repair visit with patching, mudding, sanding, and localized touch-up.";
        } else if (
          /невелик|маленьк|small|minor/.test(normalized)
        ) {
          serviceId = "drywall_patch_addon_minor";
          description = "Minor drywall patch add-on";
          note =
            "Small drywall patch completed as part of the room painting project.";
        } else if (
          /medium|середн|12 inch|12 inches|1 sq ft|2 sq ft/.test(normalized)
        ) {
          serviceId = "drywall_patch_addon_medium";
          description = "Medium drywall patch add-on";
          note =
            "Medium drywall patch completed as part of the room painting project.";
        } else if (
          /large|(?:^|\s)великий(?:\s|$)|вирізати|замінити гіпсокартон|cut out|replace drywall/.test(normalized)
        ) {
          serviceId = "drywall_patch_addon_large";
          description = "Large drywall repair add-on";
          note =
            "Cut out and replace damaged drywall as part of the room painting project.";
        }

        verified.items.push({
          serviceId,
          description,
          quantity: 1,
          unit: "each",
          note,
          confidence: 1
        });
      }
    }

    return NextResponse.json(verified);
  }catch(error){
    console.error(error);
    const message=error instanceof Error?error.message:"Unknown server error";
    return NextResponse.json({error:message},{status:500});
  }
}
