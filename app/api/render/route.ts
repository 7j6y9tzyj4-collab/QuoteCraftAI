import OpenAI,{toFile} from "openai";
import {NextRequest,NextResponse} from "next/server";
export const runtime="nodejs";
export const maxDuration=60;

// Фотореалістичний рендер кімнати: 3D-ескіз (ракурс + розстановка) + фото кімнати + побажання → картинка «як буде після ремонту».
const IMG=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
function toBuf(d:string){const i=d.indexOf(",");return {buf:Buffer.from(d.slice(i+1),"base64"),mime:d.slice(5,d.indexOf(";"))}}
export async function POST(req:NextRequest){
  try{
    if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"OPENAI_API_KEY is not configured."},{status:503});
    const b=await req.json();
    const sketch=String(b.sketch||"");
    if(!IMG.test(sketch)||sketch.length>2_000_000)return NextResponse.json({error:"Нема 3D-ескізу (PNG до 2 МБ)."},{status:400});
    const photos:string[]=(Array.isArray(b.photos)?b.photos:[]).filter((p:unknown)=>typeof p==="string"&&IMG.test(p)&&p.length<=750000).slice(0,3);
    const roomName=String(b.room||"").slice(0,120),kind=String(b.kind||"").slice(0,40);
    const room=kind||"room";void roomName;
    const wish=String(b.wish||"").slice(0,1500),fixtures=String(b.fixtures||"").slice(0,600),tile=String(b.tile||"").slice(0,60),openings=String(b.openings||"").slice(0,300),look=String(b.look||"").slice(0,120);
    const prompt=[
      `Photorealistic interior photograph of a freshly renovated ${room}, shot with a wide-angle lens.`,
      `The FIRST image is a simple 3D sketch: reproduce its camera angle and layout exactly — same walls, same door and window positions.`,
      fixtures?`The ONLY fixtures and furniture in the room are: ${fixtures}. Keep each in the same place as in the sketch.`:`The room is EMPTY: only walls, floor, ceiling, the door(s) and window(s). Do not add any furniture, plumbing fixtures, toilets, sinks, vanities or bathtubs.`,
      `Do not add anything that is not listed. This is NOT a bathroom unless a toilet, tub or shower is listed.`,
      photos.length?`The other images are photos of the room before renovation — keep the same architecture, ceiling height and window light, but show it finished and clean.`:"",
      openings?`Openings: ${openings}. The light-colored rectangular gap in a wall of the sketch is a DOOR opening (draw a door or doorway), not a window, unless listed as window.`:"",
      tile?`Floor: ${tile} tile.`:"",
      look&&!wish?`Current colors to keep unless the wishes say otherwise: ${look}.`:"",
      wish?`Client wishes / finishes: ${wish}`:"Finishes: modern, light, neutral; clean painted walls, warm lighting.",
      "Realistic materials, soft natural light, high detail. No people, no text, no labels, no dimension tags, no watermark.",
    ].filter(Boolean).join(" ");
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:56000,maxRetries:0});
    const files=[];
    const s=toBuf(sketch);files.push(await toFile(s.buf,"sketch.png",{type:s.mime}));
    for(let i=0;i<photos.length;i++){const p=toBuf(photos[i]);files.push(await toFile(p.buf,`photo${i}.jpg`,{type:p.mime}))}
    let model=process.env.OPENAI_IMAGE_MODEL||"gpt-image-1";
    let r;
    try{r=await client.images.edit({model,image:files,prompt,size:"1024x1024",quality:"medium",n:1} as any)}
    catch(e:any){
      // без верифікації організації gpt-image-1 може бути недоступна → пробуємо mini
      if(model==="gpt-image-1"&&(e?.status===403||/verif|not allowed|does not have access/i.test(String(e?.message||"")))){model="gpt-image-1-mini";r=await client.images.edit({model,image:files,prompt,size:"1024x1024",quality:"medium",n:1} as any)}
      else throw e;
    }
    const b64=r.data?.[0]?.b64_json;
    if(!b64)return NextResponse.json({error:"Порожня відповідь від моделі."},{status:502});
    return NextResponse.json({image:"data:image/png;base64,"+b64,model});
  }catch(e:any){
    const msg=e?.error?.message||e?.message||String(e);
    return NextResponse.json({error:msg},{status:e?.status&&e.status>=400&&e.status<600?e.status:500});
  }
}
