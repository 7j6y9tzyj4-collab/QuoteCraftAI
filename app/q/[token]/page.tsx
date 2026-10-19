import {supabaseAdmin} from "@/lib/supabaseAdmin";
import type {QuoteSnapshot} from "@/lib/sharedQuote";
import type {ChangeSnapshot} from "@/lib/changeOrder";
import PrintButton from "@/app/e/[token]/PrintButton";
import AcceptBox from "./AcceptBox";
import TierAccept from "./TierAccept";
import {PRELIMINARY_NOTE} from "@/lib/photoMeasurements";
import {headers} from "next/headers";
import OptionsAccept from "./OptionsAccept";
import {notifyOwner,ownerSettings,quoteLabel,usd} from "@/lib/notify";
import {getCheckout} from "@/lib/stripe";
import {acceptedAmounts} from "@/lib/sharedQuote";

export const dynamic="force-dynamic";
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);

export async function generateMetadata({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(token))return {title:"Estimate"};
  const {data}=await supabaseAdmin.from("shared_quotes").select("data").eq("token",token).maybeSingle();
  const d=(data?.data||{}) as any;
  const company=d.company||"K&V House Renovation";
  const what=d.kind==="change"?`Change Order #${d.no}${d.title?` — ${d.title}`:""}`:(d.project?`Estimate — ${d.project}`:"Estimate");
  const title=`${what} | ${company}`;
  const description=d.client?`Prepared for ${d.client}. Tap to review and accept.`:"Tap to review and accept.";
  return {title,description,openGraph:{title,description,siteName:company,type:"website"},twitter:{card:"summary",title,description}};
}

export default async function SharedQuotePage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{paid?:string}>}){
  const {token}=await params;
  const {paid}=await searchParams;
  const ok=/^[0-9a-f-]{36}$/i.test(token);
  const {data,error}=ok
    ?await supabaseAdmin.from("shared_quotes").select("data,status,accepted_at,accepted_name,user_id").eq("token",token).maybeSingle()
    :{data:null,error:null};
  if(error||!data){
    return <main className="shared"><div className="sharedCard" style={{textAlign:"center"}}><h1>Estimate not found</h1><p>This link is no longer valid.</p></div></main>;
  }
  const ua=(await headers()).get("user-agent")||"";
  const bot=/facebookexternalhit|Twitterbot|Slackbot|WhatsApp|TelegramBot|Discordbot|LinkedInBot|Googlebot|bingbot|preview|crawler|spider|bot\b/i.test(ua);
  if(data.status==="sent"&&!bot){
    await supabaseAdmin.from("shared_quotes").update({status:"viewed",viewed_at:new Date().toISOString()}).eq("token",token);
    await notifyOwner(data.user_id,`👁 Клієнт відкрив: <b>${quoteLabel(data.data)}</b>`);
  }
  const settings=await ownerSettings(data.user_id);
  const canPay=!!settings?.stripe_secret_key;
  // повернулися зі Stripe: перевіряємо оплату й запам'ятовуємо
  if(paid&&settings?.stripe_secret_key&&!(data.data as any)?.depositPaid){
    try{
      const ss=await getCheckout(settings.stripe_secret_key,paid);
      if(ss.payment_status==="paid"&&ss.metadata?.quote_token===token){
        const dp={amount:Math.round(ss.amount_total)/100,at:new Date().toISOString(),session:ss.id};
        (data.data as any).depositPaid=dp;
        await supabaseAdmin.from("shared_quotes").update({data:data.data}).eq("token",token);
        await notifyOwner(data.user_id,`💳 Завдаток оплачено карткою: <b>${usd(dp.amount)}</b>\n${quoteLabel(data.data)}`);
      }
    }catch{/* покажемо як не оплачено */}
  }
  const depositPaid=(data.data as any)?.depositPaid||null;
  if((data.data as any)?.kind==="bundle"){
    const b=data.data as any;
    const toks:string[]=(b.tokens||[]).filter((x:string)=>/^[0-9a-f-]{36}$/i.test(x));
    const {data:rows}=toks.length?await supabaseAdmin.from("shared_quotes").select("token,data,status").in("token",toks):{data:[] as any[]};
    const list=toks.map(t=>(rows||[]).find((r:any)=>r.token===t)).filter(Boolean) as any[];
    const sum=list.reduce((a,r)=>a+(r.status==="accepted"?acceptedAmounts(r.data).total:(r.data?.tiers?.length?r.data.tiers[1]?.totals.total||0:r.data?.totals?.total||0)),0);
    return (
      <main className="shared">
        <div className="sharedCard">
          <div className="sharedHead"><div>
            <span className="sharedEyebrow">{b.company}</span>
            <h1>Your estimates</h1>
            {b.client&&<p>Prepared for: <strong>{b.client}</strong></p>}
            {b.contact&&<p>{b.contact}</p>}
          </div></div>
          <p style={{fontSize:14,color:"#667085"}}>Each part of the project has its own estimate. Open one to see the details, choose add-ons and accept it — you can accept them separately.</p>
          <div style={{display:"grid",gap:10}}>
            {list.map((r:any)=>{const q=r.data;const tot=r.status==="accepted"?acceptedAmounts(q).total:(q?.tiers?.length?q.tiers[1]?.totals.total:q?.totals?.total);
              return <a key={r.token} href={`/q/${r.token}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:16,borderRadius:14,border:"1px solid #d0d5dd",textDecoration:"none",color:"#101828"}}>
                <span><b style={{display:"block",fontSize:17}}>{q?.project||"Estimate"}</b>
                  <small style={{color:r.status==="accepted"?"#067647":"#667085"}}>{r.status==="accepted"?"✓ Accepted":q?.optional?.length?`${q.optional.length} optional add-on${q.optional.length>1?"s":""}`:"Tap to review"}</small></span>
                <span style={{textAlign:"right",whiteSpace:"nowrap"}}><b style={{fontSize:18}}>{q?.tiers?.length&&r.status!=="accepted"?"from ":""}{money(q?.tiers?.length&&r.status!=="accepted"?Math.min(...q.tiers.map((x:any)=>x.totals.total)):tot)}</b><br/><span style={{color:"#2f6df6"}}>Open ›</span></span>
              </a>})}
          </div>
          {list.length>1&&<div className="sharedTotals" style={{marginTop:16}}><div className="grand"><span>All estimates together</span><span>{money(sum)}</span></div></div>}
        </div>
      </main>
    );
  }
  if((data.data as any)?.kind==="change"){
    const c=data.data as ChangeSnapshot;
    return (
      <main className="shared">
        <div className="sharedCard">
          <div className="sharedHead">
            <div>
              <span className="sharedEyebrow">{c.company}</span>
              <h1>Change Order #{c.no}{c.title?` — ${c.title}`:""}</h1>
              {c.client&&<p>Client: <strong>{c.client}</strong></p>}
              {c.project&&<p>Project: {c.project}</p>}
              <p>Date: {c.date}</p>
              {c.contact&&<p>{c.contact}</p>}
            </div>
            <PrintButton/>
          </div>
          <table className="sharedTable">
            <thead><tr><th>Additional work</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
            <tbody>{c.lines.map((l,i)=><tr key={i}><td>{l.description}</td><td style={{textAlign:"right"}}>{money(l.amount)}</td></tr>)}</tbody>
          </table>
          <div className="sharedTotals"><div className="grand"><span>Change order total</span><span>{money(c.total)}</span></div></div>
          {c.notes&&<p style={{whiteSpace:"pre-wrap",fontSize:14,color:"#344054",marginTop:16}}>{c.notes}</p>}
          <AcceptBox token={token} change accepted={data.status==="accepted"} acceptedName={data.accepted_name||""} acceptedAt={data.accepted_at||""}/>
        </div>
      </main>
    );
  }
  const q=data.data as QuoteSnapshot;
  const t=q.totals;
  const showFinish=q.lines.some(l=>l.finish>0);
  const m0=(n:number)=>n>0?money(n):"—";
  return (
    <main className="shared">
      <div className="sharedCard">
        <div className="sharedHead">
          <div>
            <span className="sharedEyebrow">{q.company}</span>
            <h1>{q.project||"Estimate"}</h1>
            {q.client&&<p>Prepared for: <strong>{q.client}</strong></p>}
            <p>Date: {q.date}</p>
            {q.contact&&<p>{q.contact}</p>}
          </div>
          <PrintButton/>
        </div>
        {q.measurementNotes&&<div style={{margin:"0 0 16px",padding:12,borderRadius:12,background:"#fffaeb",fontSize:14}}><strong>{PRELIMINARY_NOTE}</strong><p style={{whiteSpace:"pre-wrap",margin:"8px 0 0",color:"#667085"}}>Approximate dimensions: {q.measurementNotes}</p></div>}

        {q.tiers?.length?<TierAccept token={token} tiers={q.tiers} chosen={q.chosenTier} canPay={canPay} depositPaid={depositPaid} accepted={data.status==="accepted"} acceptedName={data.accepted_name||""} acceptedAt={data.accepted_at||""}/>:<>
        <div style={{overflowX:"auto"}}>
        <table className="sharedTable">
          <thead><tr><th>Description</th><th>Qty</th><th style={{textAlign:"right"}}>Labor</th><th style={{textAlign:"right"}}>Materials</th>{showFinish&&<th style={{textAlign:"right"}}>Finish</th>}<th style={{textAlign:"right"}}>Total</th></tr></thead>
          <tbody>
            {q.lines.map((l,i)=><tr key={i}>
              <td><strong>{l.name}</strong>{l.note&&<div className="sharedNote">{l.note}</div>}</td>
              <td style={{whiteSpace:"nowrap"}}>{l.qty} {l.unit}</td>
              <td style={{textAlign:"right"}}>{m0(l.labor)}</td>
              <td style={{textAlign:"right"}}>{m0(l.materials)}</td>
              {showFinish&&<td style={{textAlign:"right"}}>{m0(l.finish)}</td>}
              <td style={{textAlign:"right"}}><strong>{money(l.total)}</strong></td>
            </tr>)}
          </tbody>
        </table>
        </div>

        <div className="sharedTotals">
          <div><span>Labor</span><span>{money(t.labor)}</span></div>
          <div><span>Materials</span><span>{money(t.materials)}</span></div>
          {t.finish>0&&<div><span>Finish allowance (basic grade)</span><span>{money(t.finish)}</span></div>}
          {t.discount>0&&<><div><span>Subtotal</span><span>{money(t.subtotal)}</span></div><div><span>{t.discountLabel}</span><span>−{money(t.discount)}</span></div></>}
          <div className="grand"><span>Total</span><span>{money(t.total)}</span></div>
          {(t.deposit||0)>0&&<div><span>Required deposit ({t.depositPct}%)</span><strong>{money(t.deposit||0)}</strong></div>}
        </div>
        </>}

        {q.tiers?.length?(q.optional.length>0&&<>
          <h3 style={{marginTop:24}}>Optional items (not included in the total)</h3>
          <table className="sharedTable"><tbody>
            {q.optional.map((l,i)=><tr key={i}><td><strong>{l.name}</strong>{l.note&&<div className="sharedNote">{l.note}</div>}</td><td style={{whiteSpace:"nowrap"}}>{l.qty} {l.unit}</td><td style={{textAlign:"right"}}>{money(l.total)}</td></tr>)}
          </tbody></table>
        </>):<OptionsAccept token={token} optional={q.optional} baseTotal={t.total} depositPct={t.depositPct||0} accepted={data.status==="accepted"} acceptedName={data.accepted_name||""} acceptedAt={data.accepted_at||""} chosen={q.chosenOptions} canPay={canPay} depositPaid={depositPaid}/>}

        {q.notes&&<><h3 style={{marginTop:24}}>Notes &amp; exclusions</h3><p style={{whiteSpace:"pre-wrap",fontSize:14,color:"#344054"}}>{q.notes}</p></>}

      </div>
    </main>
  );
}
