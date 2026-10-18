import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
export const runtime="nodejs";

// Приймає LiDAR-скан від додатка QuoteCraft Scan (iPhone). Токен — одноразовий, створений вебом у scan_inbox; живе 2 години.
export async function POST(req:NextRequest){
  try{
    const b=await req.json();
    const token=String(b.token||"");
    if(!/^[a-f0-9]{32}$/.test(token))return NextResponse.json({error:"bad token"},{status:400});
    const scan=b.scan;
    if(!scan||typeof scan!=="object"||!Array.isArray(scan.walls))return NextResponse.json({error:"bad scan"},{status:400});
    if(JSON.stringify(scan).length>600000)return NextResponse.json({error:"scan too large"},{status:413});
    const {data:row,error}=await supabaseAdmin.from("scan_inbox").select("token,created_at,used_at").eq("token",token).maybeSingle();
    if(error)return NextResponse.json({error:error.message},{status:500});
    if(!row)return NextResponse.json({error:"Токен не знайдено. Натисни «Сканувати LiDAR» у QuoteCraft ще раз."},{status:404});
    if(row.used_at||Date.now()-new Date(row.created_at).getTime()>2*3600e3)return NextResponse.json({error:"Токен уже використано або прострочено."},{status:410});
    const {error:e2}=await supabaseAdmin.from("scan_inbox").update({payload:{...scan,at:new Date().toISOString()},used_at:new Date().toISOString()}).eq("token",token);
    if(e2)return NextResponse.json({error:e2.message},{status:500});
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
export async function OPTIONS(){return new NextResponse(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST","Access-Control-Allow-Headers":"Content-Type"}})}
