import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {rateOk,ipOf} from "@/lib/rateLimit";
import {sendPush} from "@/lib/push";
export const runtime="nodejs";

// Додаток QuoteCraft Scan вводить 6-значний код з вебу → отримує токен для /api/scan-import.
export async function POST(req:NextRequest){
  try{
    const b=await req.json();
    const pin=String(b.pin||"").replace(/\D/g,"");
    if(pin.length!==6)return NextResponse.json({error:"Код має 6 цифр."},{status:400});
    // захист від перебору: 8 спроб / 15 хв з однієї адреси і 40 спроб / 15 хв загалом (код живе 20 хв, варіантів 1 000 000)
    if(!(await rateOk(`scan-claim:${ipOf(req)}`,8,900))||!(await rateOk("scan-claim:all",40,900)))
      return NextResponse.json({error:"Забагато спроб. Зачекайте 15 хвилин і створіть новий код."},{status:429});
    const since=new Date(Date.now()-20*60e3).toISOString();
    const {data,error}=await supabaseAdmin.from("scan_inbox").select("token,user_id,created_at").eq("pin",pin).is("used_at",null).gte("created_at",since).order("created_at",{ascending:false}).limit(1);
    if(error)return NextResponse.json({error:error.message},{status:500});
    const row=data?.[0];
    if(!row)return NextResponse.json({error:"Код не знайдено або прострочений. Натисни «Сканувати LiDAR» у QuoteCraft ще раз."},{status:404});
    // прив'язуємо iPhone: ключ пристрою, з яким додаток далі сам забирає заявки без коду
    const key=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
    const {error:e2}=await supabaseAdmin.from("scan_devices").insert({key,user_id:row.user_id,name:String(b.device||"iPhone").slice(0,80),last_seen:new Date().toISOString()});
    if(e2)return NextResponse.json({error:e2.message+(/scan_devices/.test(e2.message)?" (таблиця scan_devices ще не створена)":"")},{status:500});
    // код одноразовий: після прив'язки більше не діє
    await supabaseAdmin.from("scan_inbox").update({pin:null}).eq("token",row.token);
    await sendPush(row.user_id,{title:"📱 Новий пристрій прив'язано",body:`${String(b.device||"iPhone").slice(0,40)} отримав доступ до сканування LiDAR. Якщо це не ви — напишіть адміністратору.`,url:"/",tag:"scan-device"}).catch(()=>{});
    return NextResponse.json({token:row.token,deviceKey:key});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
