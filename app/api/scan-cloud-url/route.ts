import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
export const runtime="nodejs";

// Великий 3D-скан (до ~25 МБ) іде напряму в сховище Supabase, минаючи ліміт Vercel 4.5 МБ: тут видаємо одноразове посилання на завантаження.
export async function POST(req:NextRequest){
  try{
    const b=await req.json();const token=String(b.token||"");
    if(!/^[a-f0-9]{32}$/.test(token))return NextResponse.json({error:"bad token"},{status:400});
    const {data:row,error}=await supabaseAdmin.from("scan_inbox").select("user_id,survey_id,room_id,created_at,used_at").eq("token",token).maybeSingle();
    if(error)return NextResponse.json({error:error.message},{status:500});
    if(!row||row.used_at||Date.now()-new Date(row.created_at).getTime()>2*3600e3)return NextResponse.json({error:"Токен не знайдено або прострочено."},{status:404});
    // name: cloud → .qcpc (точки), mesh → .qcms (сітка), kf-N → ключовий кадр 3D-фото
    const name=String(b.name||"cloud");const kf=name.match(/^kf-(\d{1,2})$/);
    if(!(name==="cloud"||name==="mesh"||kf))return NextResponse.json({error:"bad name"},{status:400});
    const base=`${row.user_id}/surveys/${row.survey_id}/${row.room_id}/scan-${token.slice(0,8)}`;
    const path=name==="cloud"?`${base}.qcpc`:name==="mesh"?`${base}.qcms`:`${base}-kf${kf![1]}.jpg`;
    const {data,error:e2}=await supabaseAdmin.storage.from("receipts").createSignedUploadUrl(path,{upsert:true});
    if(e2||!data)return NextResponse.json({error:e2?.message||"no url"},{status:500});
    return NextResponse.json({path,uploadUrl:data.signedUrl,apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||""});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
