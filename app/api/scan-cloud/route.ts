import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
export const runtime="nodejs";
export const maxDuration=60;

// 3D-скан кімнати (хмара точок з LiDAR, формат QCPC) від QuoteCraft Scan → сховище. Тіло — сирі байти, токен у заголовку X-Token.
export async function POST(req:NextRequest){
  try{
    const token=String(req.headers.get("x-token")||"");
    if(!/^[a-f0-9]{32}$/.test(token))return NextResponse.json({error:"bad token"},{status:400});
    const buf=Buffer.from(await req.arrayBuffer());
    if(buf.length<8||buf.length>4_400_000||buf.toString("latin1",0,4)!=="QCPC")return NextResponse.json({error:"bad cloud"},{status:400});
    const n=buf.readUInt32LE(4);if(8+n*9!==buf.length)return NextResponse.json({error:"bad size"},{status:400});
    const {data:row,error}=await supabaseAdmin.from("scan_inbox").select("user_id,survey_id,room_id,created_at,used_at").eq("token",token).maybeSingle();
    if(error)return NextResponse.json({error:error.message},{status:500});
    if(!row||row.used_at||Date.now()-new Date(row.created_at).getTime()>2*3600e3)return NextResponse.json({error:"Токен не знайдено або прострочено."},{status:404});
    const path=`${row.user_id}/surveys/${row.survey_id}/${row.room_id}/scan-${token.slice(0,8)}.qcpc`;
    const {error:e2}=await supabaseAdmin.storage.from("receipts").upload(path,buf,{contentType:"application/octet-stream",upsert:true});
    if(e2)return NextResponse.json({error:e2.message},{status:500});
    return NextResponse.json({path,n});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
