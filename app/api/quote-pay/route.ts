import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {ownerSettings} from "@/lib/notify";
import {acceptedAmounts} from "@/lib/sharedQuote";
import {createDepositCheckout} from "@/lib/stripe";

export const runtime="nodejs";

// Клієнт натискає «Pay deposit» → Stripe Checkout. Сума рахується тут, на сервері, з прийнятого естімейту.
export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const token=String(body?.token||"");
    if(!/^[0-9a-f-]{36}$/i.test(token))return NextResponse.json({error:"Invalid request"},{status:400});
    const {data}=await supabaseAdmin.from("shared_quotes").select("status,data,user_id").eq("token",token).maybeSingle();
    if(!data)return NextResponse.json({error:"Estimate not found"},{status:404});
    if(data.status!=="accepted")return NextResponse.json({error:"Please accept the estimate first."},{status:400});
    const d:any=data.data;
    if(d?.depositPaid)return NextResponse.json({error:"The deposit is already paid."},{status:400});
    const s=await ownerSettings(data.user_id);
    if(!s?.stripe_secret_key)return NextResponse.json({error:"Card payment is not available — please contact us."},{status:400});
    const a=acceptedAmounts(d);
    const cents=Math.round(a.deposit*100);
    if(cents<50)return NextResponse.json({error:"No deposit is required."},{status:400});
    const origin=req.headers.get("origin")||new URL(req.url).origin;
    const ss=await createDepositCheckout(s.stripe_secret_key,{
      amountCents:cents,token,
      title:`Deposit — ${d?.project||"Estimate"}`,
      description:`${d?.company||""}${d?.client?` · ${d.client}`:""}${a.label&&!a.label.startsWith("+")?` · ${a.label}`:""}`,
      successUrl:`${origin}/q/${token}?paid={CHECKOUT_SESSION_ID}`,
      cancelUrl:`${origin}/q/${token}`,
    });
    return NextResponse.json({url:ss.url});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500});
  }
}
