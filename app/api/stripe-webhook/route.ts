import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {verifyStripe,stripeReq,unpackAlloc} from "@/lib/stripe";
import {sendPush} from "@/lib/push";

export const runtime="nodejs";
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const usDate=()=>new Date().toLocaleDateString("en-US",{timeZone:"America/Chicago",month:"2-digit",day:"2-digit",year:"numeric"});

// 💳 Stripe повідомляє про оплату → записуємо її в проєкт(и) клієнта + сповіщення власнику.
// Картка: checkout.session.completed (paid). Банк (ACH): спершу completed (unpaid — гроші в дорозі), потім async_payment_succeeded.
export async function POST(req:NextRequest){
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  const raw=await req.text();
  if(!secret||!verifyStripe(raw,req.headers.get("stripe-signature"),secret))return NextResponse.json({error:"bad signature"},{status:400});
  const ev=JSON.parse(raw);
  const ses=ev?.data?.object||{};const m=ses.metadata||{};
  if(!m.uid||!m.alloc)return NextResponse.json({ok:true,skipped:true});
  const alloc=unpackAlloc(m.alloc);const total=alloc.reduce((a,x)=>a+x.amount,0);const who=String(m.client||"Клієнт");
  try{
    if(ev.type==="checkout.session.completed"&&ses.payment_status!=="paid"){
      await sendPush(m.uid,{title:`🏦 ${who}: оплата з банку в дорозі`,body:`${money(total)} — зарахується за кілька днів, тоді запишу в проєкт.`,url:"/?screen=pay",tag:`stripe-${ses.id}`});
      return NextResponse.json({ok:true,pending:true});
    }
    if(ev.type==="checkout.session.async_payment_failed"){
      await sendPush(m.uid,{title:`⚠️ ${who}: оплата з банку не пройшла`,body:money(total),url:"/?screen=pay",tag:`stripe-${ses.id}`});
      return NextResponse.json({ok:true});
    }
    if(ev.type!=="checkout.session.completed"&&ev.type!=="checkout.session.async_payment_succeeded")return NextResponse.json({ok:true,ignored:ev.type});
    let method="Card (online)";
    try{if(ses.payment_intent){const pi=await stripeReq("GET",`payment_intents/${ses.payment_intent}`,{expand:{0:"payment_method"}});if(pi?.payment_method?.type==="us_bank_account")method="Bank transfer (online)"}}catch{}
    const date=usDate();
    for(let i=0;i<alloc.length;i++){
      const a=alloc[i];const id=`stripe_${ses.id}_${i}`;
      const payment={id,date,amount:a.amount,method};
      const {error}=await supabaseAdmin.from("stripe_payments").insert({id,user_id:m.uid,sid:a.sid,payment,session:ses.id});
      if(error&&!/duplicate/i.test(error.message))throw error;
      await supabaseAdmin.rpc("add_statement_payment",{p_user:m.uid,p_sid:a.sid,p_payment:payment});
    }
    await sendPush(m.uid,{title:`💳 ${who} оплатив(ла) ${money(total)}`,body:`${method==="Card (online)"?"Карткою":"З банку"} — уже записано в проєкт.`,url:alloc.length===1?`/?screen=pay&sid=${encodeURIComponent(alloc[0].sid)}`:"/?screen=pay",tag:`stripe-${ses.id}`});
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"error"},{status:500})}
}
