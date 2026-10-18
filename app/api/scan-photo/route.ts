import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
export const runtime="nodejs";

// Кадр зі сканера QuoteCraft Scan → сховище (той самий бакет, що й фото огляду). По одному кадру на запит.
export async function POST(req:NextRequest){
  try{
    const b=await req.json();
    const token=String(b.token||"");
    if(!/^[a-f0-9]{32}$/.test(token))return NextResponse.json({error:"bad token"},{status:400});
    const jpg=String(b.jpg||"");
    if(!/^[A-Za-z0-9+/]+=*$/.test(jpg)||jpg.length>3_000_000)return NextResponse.json({error:"bad image"},{status:400});
    const idx=Math.max(0,Math.min(30,Math.floor(Number(b.idx)||0)));
    const {data:row,error}=await supabaseAdmin.from("scan_inbox").select("user_id,survey_id,room_id,created_at,used_at").eq("token",token).maybeSingle();
    if(error)return NextResponse.json({error:error.message},{status:500});
    if(!row||row.used_at||Date.now()-new Date(row.created_at).getTime()>2*3600e3)return NextResponse.json({error:"Токен не знайдено або прострочено."},{status:404});
    const path=`${row.user_id}/surveys/${row.survey_id}/${row.room_id}/scan-${token.slice(0,8)}-${idx}.jpg`;
    const {error:e2}=await supabaseAdmin.storage.from("receipts").upload(path,Buffer.from(jpg,"base64"),{contentType:"image/jpeg",upsert:true});
    if(e2)return NextResponse.json({error:e2.message},{status:500});
    return NextResponse.json({path});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
