import {parseReceiptAI} from "@/lib/parseReceiptAI";
import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";

// Фото чека (Home Depot, Menards, Floor & Decor…) → дата, магазин, короткий перелік, сума з податком.
export async function POST(request:NextRequest){
  try{
    if(!process.env.OPENAI_API_KEY){
      return NextResponse.json({error:"OPENAI_API_KEY is not configured in Vercel."},{status:503});
    }
    const body=await request.json();
    const photo=String(body?.photo||"");
    if(photo.length>750000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo)){
      return NextResponse.json({error:"Додай фото чека JPEG, PNG або WebP."},{status:400});
    }
    return NextResponse.json(await parseReceiptAI(photo));
  }catch(error){
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Unknown server error"},{status:500});
  }
}
