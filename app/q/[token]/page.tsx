import {supabaseAdmin} from "@/lib/supabaseAdmin";
import type {QuoteSnapshot} from "@/lib/sharedQuote";
import type {ChangeSnapshot} from "@/lib/changeOrder";
import PrintButton from "@/app/e/[token]/PrintButton";
import AcceptBox from "./AcceptBox";
import TierAccept from "./TierAccept";
import {PRELIMINARY_NOTE} from "@/lib/photoMeasurements";
import ViewPing from "./ViewPing";
import OptionsAccept from "./OptionsAccept";
import InvoiceView,{type InvoiceData} from "./InvoiceView";
import SignoffView from "./SignoffView";
import {shopList} from "@/lib/shop";
import {statementTotals,dueNowOf,type Statement} from "@/lib/statement";
import {stripeOn} from "@/lib/stripe";
import {clientProjects,invoiceTokenFor} from "@/lib/clientPortal";
import PayButton from "./PayButton";
import {ownerSettings} from "@/lib/notify";
import {acceptedAmounts} from "@/lib/sharedQuote";

export const dynamic="force-dynamic";
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);

export async function generateMetadata({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(token))return {title:"Estimate"};
  const {data}=await supabaseAdmin.from("shared_quotes").select("data").eq("token",token).maybeSingle();
  const d=(data?.data||{}) as any;
  const company=d.company||"Estimate";
  const what=d.kind==="signoff"?`Work completion — ${d.project||"Project"}`:d.kind==="invoice"?`Invoice — ${d.project||"Project"}`:d.kind==="bundle"?"Your estimates":d.kind==="client"?`Your projects${d.client?` — ${d.client}`:""}`:d.kind==="change"?`Change Order #${d.no}${d.title?` — ${d.title}`:""}`:(d.project?`Estimate — ${d.project}`:"Estimate");
  const title=`${what} | ${company}`;
  const description=d.kind==="client"?"All your projects, invoices and balances in one place.":d.kind==="signoff"?"Please review and confirm the completed work.":d.kind==="invoice"?`Updated invoice${d.client?` for ${d.client}`:""}.`:d.client?`Prepared for ${d.client}. Tap to review and accept.`:"Tap to review and accept.";
  return {title,description,openGraph:{title,description,siteName:company,type:"website"},twitter:{card:"summary",title,description}};
}

export default async function SharedQuotePage({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const {token}=await params;const sp=await searchParams;
    const ok=/^[0-9a-f-]{36}$/i.test(token);
  const {data,error}=ok
    ?await supabaseAdmin.from("shared_quotes").select("data,status,accepted_at,accepted_name,user_id").eq("token",token).maybeSingle()
    :{data:null,error:null};
  if(error||!data){
    return <main className="shared"><div className="sharedCard" style={{textAlign:"center"}}><h1>Estimate not found</h1><p>This link is no longer valid.</p></div></main>;
  }
  const settings=await ownerSettings(data.user_id);
  const zelle=settings?.zelle||"";
  const logo=String(settings?.company?.logo||"");
  if((data.data as any)?.kind==="signoff"){
    const so=data.data as any;const accepted=data.status==="accepted";
    const items=accepted&&Array.isArray(so.items)?so.items:(await shopList(data.user_id,String(so.sid),"punch")).map(i=>({text:i.text,done:i.done}));
    return <main className="shared"><ViewPing token={token}/><div className="sharedCard"><SignoffView token={token} d={{company:so.company||"",contact:so.contact||"",logo,client:so.client||"",project:so.project||"",items,
      signed:accepted?{name:data.accepted_name||"",at:String(so.signedAt||data.accepted_at||""),sig:String(so.sig||"")}:null}}/></div></main>;
  }
  if((data.data as any)?.kind==="invoice"){
    const inv=data.data as any;
    const {data:row}=await supabaseAdmin.from("user_statements").select("statements").eq("user_id",data.user_id).maybeSingle();
    const st=((row?.statements||[]) as Statement[]).find(x=>x.id===inv.sid);
    if(!st)return <main className="shared"><div className="sharedCard" style={{textAlign:"center"}}><h1>Invoice not found</h1><p>Please contact us for an updated invoice.</p></div></main>;
    const paths=st.receipts.map(r=>r.photoPath).filter(Boolean) as string[];
    const signed=new Map<string,string>();
    if(paths.length){const {data:su}=await supabaseAdmin.storage.from("receipts").createSignedUrls(paths,3600);for(const x of su||[])if(x.path&&x.signedUrl)signed.set(x.path,x.signedUrl)}
    const t=statementTotals(st);
    const d:InvoiceData={company:inv.company,contact:inv.contact,client:st.client,project:st.project,date:new Date().toLocaleDateString("en-US"),
      labor:st.labor.filter(l=>Number(l.amount)||String(l.description||"").trim()).map(l=>{const co=(st.changes||[]).find(c=>c.laborLineId===l.id&&c.status==="accepted");
        return {description:l.description,amount:Number(l.amount)||0,details:co?co.lines.filter(x=>Number(x.amount)||String(x.description||"").trim()).map(x=>({description:x.description,amount:Number(x.amount)||0})):undefined}}),
      pending:(st.changes||[]).filter(c=>c.status==="sent"||c.status==="viewed").map(c=>({no:c.no,title:c.title,total:c.lines.reduce((a,x)=>a+(Number(x.amount)||0),0),lines:c.lines.filter(x=>Number(x.amount)).map(x=>({description:x.description,amount:Number(x.amount)||0}))})),
      receipts:[...st.receipts].filter(r=>Number(r.amount)&&r.kind!=="deposit").map(r=>({date:r.date,store:r.store,items:r.items,amount:Number(r.amount)||0,photo:r.photoPath?signed.get(r.photoPath):undefined})),
      payments:st.payments.map(p=>({date:p.date,amount:Number(p.amount)||0,method:p.method})),totals:t,zelle:settings?.zelle||"",notes:st.notes||"",logo,
      due:dueNowOf(st,t),payToken:stripeOn()?token:undefined,paid:sp?.paid==="1"};
    return <main className="shared"><ViewPing token={token}/><div className="sharedCard"><InvoiceView d={d}/></div></main>;
  }
  if((data.data as any)?.kind==="client"){
    const c=data.data as any;
    const list=(await clientProjects(data.user_id,c.client)).filter(x=>x.t.total>0.005||x.t.paid>0.005);
    const toks=await Promise.all(list.map(x=>invoiceTokenFor(data.user_id,x.s,c.company||"",c.contact||"")));
    const {data:open}=await supabaseAdmin.from("shared_quotes").select("token,data,status").eq("user_id",data.user_id).in("status",["sent","viewed"]);
    const waiting=((open||[]) as any[]).filter(r=>{const k=r.data?.kind;return k!=="invoice"&&k!=="client"&&k!=="bundle"&&String(r.data?.client||"").trim().toLowerCase()===String(c.client||"").trim().toLowerCase()});
    const bal=list.reduce((a,x)=>a+Math.max(0,x.t.balance),0);const now=list.reduce((a,x)=>a+x.due.now,0);
    const active=list.filter(x=>x.t.balance>0.005);const done=list.filter(x=>x.t.balance<=0.005);
    const row=(x:typeof list[number],i:number,tok:string)=><a key={i} href={`/q/${tok}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:16,borderRadius:14,border:"1px solid #d0d5dd",textDecoration:"none",color:"#101828"}}>
      <span><b style={{display:"block",fontSize:17}}>{x.s.project||"Project"}</b>
        <small style={{color:"#667085"}}>Total {money(x.t.total)} · Paid {money(x.t.paid)}</small></span>
      <span style={{textAlign:"right",whiteSpace:"nowrap"}}>{x.t.balance>0.005?<><b style={{fontSize:18}}>{money(x.due.now)}</b><br/><small style={{color:"#667085"}}>{x.due.partial?`due now · balance ${money(x.t.balance)}`:"balance due"}</small></>:<b style={{color:"#067647"}}>✓ Paid</b>}<br/><span style={{color:"#2f6df6"}}>Open invoice ›</span></span>
    </a>;
    return (
      <main className="shared"><ViewPing token={token}/>
        <div className="sharedCard">
          <div className="sharedHead"><div>
            {logo&&<img src={logo} alt="" style={{height:52,maxWidth:200,objectFit:"contain",display:"block",marginBottom:8}}/>}<span className="sharedEyebrow">{c.company}</span>
            <h1>Your projects</h1>
            {c.client&&<p>Client: <strong>{c.client}</strong></p>}
            <p>Updated: {new Date().toLocaleDateString("en-US",{timeZone:"America/Chicago"})}</p>
            {c.contact&&<p>{c.contact}</p>}
          </div></div>
          {sp?.paid==="1"&&<div style={{margin:"0 0 16px",padding:16,borderRadius:14,background:"#ecfdf3",color:"#067647"}}>✓ Thank you! Your payment was received. It may take a minute to show here (bank transfers take a few business days).</div>}
          {waiting.length>0&&<><h3>Waiting for your approval</h3><div style={{display:"grid",gap:10,marginBottom:20}}>
            {waiting.map((r:any)=><a key={r.token} href={`/q/${r.token}`} style={{display:"flex",justifyContent:"space-between",gap:12,padding:16,borderRadius:14,border:"1px dashed #fdb022",textDecoration:"none",color:"#101828"}}>
              <b>{r.data?.kind==="change"?`Change order #${r.data.no}${r.data.title?` — ${r.data.title}`:""}`:r.data?.kind==="signoff"?`Work completion — ${r.data.project||""}`:`Estimate — ${r.data?.project||""}`}</b><span style={{color:"#2f6df6",whiteSpace:"nowrap"}}>Review ›</span></a>)}
          </div></>}
          {active.length>0&&<><h3>Open invoices</h3><div style={{display:"grid",gap:10}}>{active.map((x,i)=>row(x,i,toks[list.indexOf(x)]))}</div></>}
          {list.length>0&&<div className="sharedTotals" style={{marginTop:16}}>
            <div><span>Total balance</span><span>{money(bal)}</span></div>
            <div className="grand"><span>Due now</span><span>{money(now)}</span></div>
            {now<bal-0.005&&<div><span style={{color:"#667085"}}>The rest is due when the work is finished</span><span/></div>}
          </div>}
          {now>0.005&&stripeOn()&&<PayButton token={token} now={now} full={bal}/>}
          {now>0.005&&zelle&&<div style={{marginTop:16,padding:16,borderRadius:14,border:"1px solid #d0d5dd"}}>
            <p style={{margin:0,fontSize:15}}>{stripeOn()?"Or send ":"Please send "}<b>{money(now)}</b> via <b>Zelle</b> to <b style={{userSelect:"all"}}>{zelle}</b>.</p>
            <p style={{margin:"6px 0 0",fontSize:13,color:"#667085"}}>Check or cash is also accepted. Thank you!</p></div>}
          {done.length>0&&<><h3 style={{marginTop:24}}>Paid in full</h3><div style={{display:"grid",gap:10}}>{done.map((x,i)=>row(x,i,toks[list.indexOf(x)]))}</div></>}
          {!list.length&&<p>No invoices yet.</p>}
        </div>
      </main>
    );
  }
  if((data.data as any)?.kind==="bundle"){
    const b=data.data as any;
    const toks:string[]=(b.tokens||[]).filter((x:string)=>/^[0-9a-f-]{36}$/i.test(x));
    const {data:rows}=toks.length?await supabaseAdmin.from("shared_quotes").select("token,data,status").in("token",toks):{data:[] as any[]};
    const list=toks.map(t=>(rows||[]).find((r:any)=>r.token===t)).filter(Boolean) as any[];
    const sum=list.reduce((a,r)=>a+(r.status==="accepted"?acceptedAmounts(r.data).total:(r.data?.tiers?.length?r.data.tiers[1]?.totals.total||0:r.data?.totals?.total||0)),0);
    return (
      <main className="shared"><ViewPing token={token}/>
        <div className="sharedCard">
          <div className="sharedHead"><div>
            {logo&&<img src={logo} alt="" style={{height:52,maxWidth:200,objectFit:"contain",display:"block",marginBottom:8}}/>}<span className="sharedEyebrow">{b.company}</span>
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
      <main className="shared"><ViewPing token={token}/>
        <div className="sharedCard">
          <div className="sharedHead">
            <div>
              {logo&&<img src={logo} alt="" style={{height:52,maxWidth:200,objectFit:"contain",display:"block",marginBottom:8}}/>}<span className="sharedEyebrow">{c.company}</span>
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
    <main className="shared"><ViewPing token={token}/>
      <div className="sharedCard">
        <div className="sharedHead">
          <div>
            {logo&&<img src={logo} alt="" style={{height:52,maxWidth:200,objectFit:"contain",display:"block",marginBottom:8}}/>}<span className="sharedEyebrow">{q.company}</span>
            <h1>{q.project||"Estimate"}</h1>
            {q.client&&<p>Prepared for: <strong>{q.client}</strong></p>}
            <p>Date: {q.date}</p>
            {q.contact&&<p>{q.contact}</p>}
          </div>
          <PrintButton/>
        </div>
        {q.measurementNotes&&<div style={{margin:"0 0 16px",padding:12,borderRadius:12,background:"#fffaeb",fontSize:14}}><strong>{PRELIMINARY_NOTE}</strong><p style={{whiteSpace:"pre-wrap",margin:"8px 0 0",color:"#667085"}}>Approximate dimensions: {q.measurementNotes}</p></div>}

        {q.tiers?.length?<TierAccept token={token} tiers={q.tiers} chosen={q.chosenTier} zelle={zelle} accepted={data.status==="accepted"} acceptedName={data.accepted_name||""} acceptedAt={data.accepted_at||""}/>:<>
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
        </>):<OptionsAccept token={token} optional={q.optional} baseTotal={t.total} depositPct={t.depositPct||0} accepted={data.status==="accepted"} acceptedName={data.accepted_name||""} acceptedAt={data.accepted_at||""} chosen={q.chosenOptions} zelle={zelle}/>}

        {q.notes&&<><h3 style={{marginTop:24}}>Notes &amp; exclusions</h3><p style={{whiteSpace:"pre-wrap",fontSize:14,color:"#344054"}}>{q.notes}</p></>}

      </div>
    </main>
  );
}
