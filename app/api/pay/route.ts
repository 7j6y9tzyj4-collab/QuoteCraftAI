import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {statementTotals,dueNowOf,type Statement} from "@/lib/statement";
import {stripeReq,stripeOn,packAlloc} from "@/lib/stripe";
import {clientProjects} from "@/lib/clientPortal";

export const runtime="nodejs";

// 💳 Клієнт натиснув «Pay» на рахунку або в кабінеті → сторінка оплати Stripe (картка або банк/ACH).
// full=true — весь залишок; інакше — «сплатити зараз» (або весь залишок, якщо окремої суми нема).
export async function POST(req:NextRequest){
  try{
    if(!stripeOn())return NextResponse.json({error:"Online payment is not available"},{status:400});
    const {token,full}=await req.json();
    if(!/^[0-9a-f-]{36}$/i.test(String(token||"")))return NextResponse.json({error:"bad token"},{status:400});
    const {data:sq}=await supabaseAdmin.from("shared_quotes").select("user_id,data").eq("token",token).maybeSingle();
    const d:any=sq?.data||{};
    if(!sq||(d.kind!=="invoice"&&d.kind!=="client"))return NextResponse.json({error:"not found"},{status:404});
    let alloc:{sid:string;amount:number}[]=[];let name="";let client="";
    if(d.kind==="invoice"){
      const {data:row}=await supabaseAdmin.from("user_statements").select("statements").eq("user_id",sq.user_id).maybeSingle();
      const s=((row?.statements||[]) as Statement[]).find(x=>x.id===d.sid);
      if(!s)return NextResponse.json({error:"not found"},{status:404});
      const t=statementTotals(s);const amt=full?Math.max(0,t.balance):dueNowOf(s,t).now;
      alloc=[{sid:s.id,amount:amt}];name=`Payment — ${s.project||"Project"}`;client=s.client;
    }else{
      const list=await clientProjects(sq.user_id,d.client);
      alloc=list.map(x=>({sid:x.s.id,amount:full?Math.max(0,x.t.balance):x.due.now}));
      name=`Payment — ${list.filter(x=>alloc.find(a=>a.sid===x.s.id&&a.amount>0)).map(x=>x.s.project).join(", ")}`.slice(0,240);client=d.client;
    }
    alloc=alloc.map(a=>({sid:a.sid,amount:Math.round(a.amount*100)/100})).filter(a=>a.amount>=0.5);
    const total=alloc.reduce((s,a)=>s+a.amount,0);
    if(total<0.5)return NextResponse.json({error:"Nothing to pay"},{status:400});
    const origin=req.headers.get("origin")||`https://${req.headers.get("host")}`;
    const meta={token,uid:sq.user_id,client:String(client).slice(0,100),alloc:packAlloc(alloc)};
    if(meta.alloc.length>500)return NextResponse.json({error:"Too many projects in one payment"},{status:400});
    const ses=await stripeReq("POST","checkout/sessions",{
      mode:"payment",
      payment_method_types:{0:"card",1:"us_bank_account"},
      line_items:{0:{quantity:1,price_data:{currency:"usd",unit_amount:Math.round(total*100),product_data:{name}}}},
      metadata:meta,payment_intent_data:{metadata:meta,description:name},
      success_url:`${origin}/q/${token}?paid=1`,cancel_url:`${origin}/q/${token}`,
    });
    return NextResponse.json({url:ses.url});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"error"},{status:500})}
}
