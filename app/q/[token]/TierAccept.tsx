"use client";
import {useState} from "react";
import type {QuoteSnapshot} from "@/lib/sharedQuote";
import PayDeposit from "./PayDeposit";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const MEDAL=["🥉","🥈","🥇"];

// Сторінка клієнта: три варіанти — обрав один → вписав ім'я → Accept.
export default function TierAccept({token,tiers,accepted,acceptedName,acceptedAt,chosen,canPay=false,depositPaid}:{token:string;tiers:NonNullable<QuoteSnapshot["tiers"]>;accepted:boolean;acceptedName:string;acceptedAt:string;chosen?:number;canPay?:boolean;depositPaid?:{amount:number;at:string}|null}){
  const [sel,setSel]=useState<number>(typeof chosen==="number"?chosen:1);
  const [name,setName]=useState("");
  const [done,setDone]=useState(accepted?{name:acceptedName,at:acceptedAt,tier:chosen}:null as null|{name:string;at:string;tier?:number});
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const t=tiers[sel];
  const showFinish=t.lines.some(l=>l.finish>0);
  async function accept(){
    if(!name.trim()){setErr("Please type your name.");return}
    setBusy(true);setErr("");
    try{
      const r=await fetch("/api/quote-accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,name:name.trim(),tier:sel})});
      const d=await r.json();if(!r.ok)throw new Error(d?.error||"Error");
      setDone({name:name.trim(),at:d.accepted_at,tier:sel});
    }catch(e){setErr(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  return <>
    <h3 style={{marginTop:8}}>Choose your option</h3>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
      {tiers.map((x,i)=>{const active=sel===i;const locked=!!done;return <button key={i} type="button" disabled={locked&&done?.tier!==i} onClick={()=>!locked&&setSel(i)}
        style={{textAlign:"left",padding:14,borderRadius:16,cursor:locked?"default":"pointer",border:`2px solid ${active?"#2f6df6":"#e4e7ec"}`,background:active?"#eff4ff":"#fff",color:"#101828",opacity:locked&&done?.tier!==i?.5:1,position:"relative"}}>
        {i===1&&<span style={{position:"absolute",top:-10,right:10,background:"#2f6df6",color:"#fff",fontSize:11,fontWeight:800,padding:"2px 8px",borderRadius:8}}>MOST POPULAR</span>}
        <div style={{fontSize:22}}>{MEDAL[i]}</div>
        <b style={{display:"block",fontSize:16}}>{x.name}</b>
        <b style={{display:"block",fontSize:22,marginTop:4}}>{money(x.totals.total)}</b>
        {x.totals.deposit>0&&<small style={{color:"#667085"}}>Deposit {money(x.totals.deposit)}</small>}
      </button>})}
    </div>

    <h3 style={{marginTop:20}}>{MEDAL[sel]} {t.name} — what's included</h3>
    <div style={{overflowX:"auto"}}>
      <table className="sharedTable">
        <thead><tr><th>Description</th><th>Qty</th><th style={{textAlign:"right"}}>Labor</th><th style={{textAlign:"right"}}>Materials</th>{showFinish&&<th style={{textAlign:"right"}}>Finish</th>}<th style={{textAlign:"right"}}>Total</th></tr></thead>
        <tbody>{t.lines.map((l,i)=><tr key={i}>
          <td><strong>{l.name}</strong>{l.note&&<div className="sharedNote">{l.note}</div>}</td>
          <td style={{whiteSpace:"nowrap"}}>{l.qty} {l.unit}</td>
          <td style={{textAlign:"right"}}>{l.labor>0?money(l.labor):"—"}</td>
          <td style={{textAlign:"right"}}>{l.materials>0?money(l.materials):"—"}</td>
          {showFinish&&<td style={{textAlign:"right"}}>{l.finish>0?money(l.finish):"—"}</td>}
          <td style={{textAlign:"right"}}><strong>{money(l.total)}</strong></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="sharedTotals">
      <div><span>Labor</span><span>{money(t.totals.labor)}</span></div>
      <div><span>Materials</span><span>{money(t.totals.materials)}</span></div>
      {t.totals.finish>0&&<div><span>Finish allowance</span><span>{money(t.totals.finish)}</span></div>}
      {t.totals.discount>0&&<div><span>Discount</span><span>−{money(t.totals.discount)}</span></div>}
      <div className="grand"><span>Total — {t.name}</span><span>{money(t.totals.total)}</span></div>
      {t.totals.deposit>0&&<div><span>Required deposit</span><strong>{money(t.totals.deposit)}</strong></div>}
    </div>

    {done?<><div className="noPrint" style={{marginTop:24,padding:16,borderRadius:14,background:"#ecfdf3",color:"#067647"}}>
      ✓ Option «{tiers[done.tier??sel]?.name}» accepted{done.name?` by ${done.name}`:""}{done.at?` on ${new Date(done.at).toLocaleDateString("en-US")}`:""}. Thank you — we will contact you to schedule the work.
    </div>{(canPay||depositPaid)&&<PayDeposit token={token} amount={tiers[done.tier??sel]?.totals.deposit||0} paid={depositPaid}/>}</>:<div className="noPrint" style={{marginTop:24,padding:16,borderRadius:14,border:"1px solid #d0d5dd"}}>
      <h3 style={{marginTop:0}}>Accept option «{t.name}» — {money(t.totals.total)}</h3>
      <p style={{fontSize:14,color:"#667085"}}>Type your name and press Accept. This does not charge anything — we will contact you to confirm the schedule and deposit.</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={{flex:"1 1 200px",padding:10,borderRadius:10,border:"1px solid #d0d5dd"}}/>
        <button className="primary" disabled={busy} onClick={accept}>{busy?"Sending…":`Accept ${t.name}`}</button>
      </div>
      {err&&<p style={{color:"#b42318",fontSize:14}}>{err}</p>}
    </div>}
  </>;
}
