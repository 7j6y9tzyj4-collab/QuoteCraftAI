import {supabaseAdmin} from "@/lib/supabaseAdmin";
import type {QuoteSnapshot} from "@/lib/sharedQuote";
import PrintButton from "@/app/e/[token]/PrintButton";
import AcceptBox from "./AcceptBox";
import {PRELIMINARY_NOTE} from "@/lib/photoMeasurements";

export const dynamic="force-dynamic";
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);

export default async function SharedQuotePage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const ok=/^[0-9a-f-]{36}$/i.test(token);
  const {data,error}=ok
    ?await supabaseAdmin.from("shared_quotes").select("data,status,accepted_at,accepted_name").eq("token",token).maybeSingle()
    :{data:null,error:null};
  if(error||!data){
    return <main className="shared"><div className="sharedCard" style={{textAlign:"center"}}><h1>Estimate not found</h1><p>This link is no longer valid.</p></div></main>;
  }
  if(data.status==="sent"){
    await supabaseAdmin.from("shared_quotes").update({status:"viewed",viewed_at:new Date().toISOString()}).eq("token",token);
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

        {q.optional.length>0&&<>
          <h3 style={{marginTop:24}}>Optional items (not included in the total)</h3>
          <table className="sharedTable"><tbody>
            {q.optional.map((l,i)=><tr key={i}><td><strong>{l.name}</strong>{l.note&&<div className="sharedNote">{l.note}</div>}</td><td style={{whiteSpace:"nowrap"}}>{l.qty} {l.unit}</td><td style={{textAlign:"right"}}>{money(l.total)}</td></tr>)}
          </tbody></table>
          <div className="sharedTotals"><div><span>Total if all optional items are added</span><span>{money(t.total+q.optional.reduce((a,l)=>a+l.total,0))}</span></div></div>
        </>}

        {q.notes&&<><h3 style={{marginTop:24}}>Notes &amp; exclusions</h3><p style={{whiteSpace:"pre-wrap",fontSize:14,color:"#344054"}}>{q.notes}</p></>}

        <AcceptBox token={token} accepted={data.status==="accepted"} acceptedName={data.accepted_name||""} acceptedAt={data.accepted_at||""}/>
      </div>
    </main>
  );
}
