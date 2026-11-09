import {NextRequest,NextResponse} from "next/server";
export const runtime="nodejs";
// Окремий manifest для сторінки помічника/клієнта: «На екран Додому» відкриває саме це посилання, а не вхід у програму.
export async function GET(req:NextRequest){
  const start=String(req.nextUrl.searchParams.get("start")||"");
  if(!/^\/(w|q)\/[0-9a-f-]{36}$/i.test(start))return NextResponse.json({error:"bad"},{status:400});
  const worker=start.startsWith("/w/");
  return NextResponse.json({
    name:worker?"Робочий кабінет":"Estimate",short_name:worker?"Робота":"Estimate",
    id:start,start_url:start,scope:start,display:"standalone",background_color:"#f4f6f8",theme_color:"#111827",
    icons:[{src:"/icon-192.png",sizes:"192x192",type:"image/png"},{src:"/icon-512.png",sizes:"512x512",type:"image/png"}],
  },{headers:{"Content-Type":"application/manifest+json","Cache-Control":"public, max-age=3600"}});
}
