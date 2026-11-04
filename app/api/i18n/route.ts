import {NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";

export const runtime="nodejs";
export const revalidate=600;
// 🌐 Словник інтерфейсу UA → EN (таблиця i18n). Програма бере його, коли вибрано English.
export async function GET(){
  const dict:Record<string,string>={};let from=0;
  for(;;){const {data,error}=await supabaseAdmin.from("i18n").select("key,en").range(from,from+999);if(error||!data?.length)break;for(const r of data as any[])if(r.en)dict[r.key]=r.en;if(data.length<1000)break;from+=1000}
  return NextResponse.json({dict},{headers:{"Cache-Control":"public, s-maxage=600, stale-while-revalidate=86400"}});
}
