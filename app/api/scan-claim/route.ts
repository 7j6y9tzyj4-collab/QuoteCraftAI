import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
export const runtime="nodejs";

// Додаток QuoteCraft Scan вводить 6-значний код з вебу → отримує токен для /api/scan-import.
export async function POST(req:NextRequest){
  try{
    const b=await req.json();
    const pin=String(b.pin||"").replace(/\D/g,"");
    if(pin.length!==6)return NextResponse.json({error:"Код має 6 цифр."},{status:400});
    const since=new Date(Date.now()-20*60e3).toISOString();
    const {data,error}=await supabaseAdmin.from("scan_inbox").select("token,user_id,created_at").eq("pin",pin).is("used_at",null).gte("created_at",since).order("created_at",{ascending:false}).limit(1);
    if(error)return NextResponse.json({error:error.message},{status:500});
    const row=data?.[0];
    if(!row)return NextResponse.json({error:"Код не знайдено або прострочений. Натисни «Сканувати LiDAR» у QuoteCraft ще раз."},{status:404});
    // прив'язуємо iPhone: ключ пристрою, з яким додаток далі сам забирає заявки без коду
    const key=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
    const {error:e2}=await supabaseAdmin.from("scan_devices").insert({key,user_id:row.user_id,name:String(b.device||"iPhone").slice(0,80),last_seen:new Date().toISOString()});
    if(e2)return NextResponse.json({error:e2.message+(/scan_devices/.test(e2.message)?" (таблиця scan_devices ще не створена)":"")},{status:500});
    return NextResponse.json({token:row.token,deviceKey:key});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
