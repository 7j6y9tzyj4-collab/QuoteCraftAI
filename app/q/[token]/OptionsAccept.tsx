"use client";
import {useState} from "react";
import type {QuoteLine} from "@/lib/sharedQuote";
import PayDeposit from "./PayDeposit";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const r2=(n:number)=>Math.round(n*100)/100;

// Сторінка клієнта: опційні позиції — галочками, сума перераховується; потім ім'я → Accept → (за бажанням) завдаток карткою.
export default function OptionsAccept({token,optional,baseTotal,depositPct,accepted,acceptedName,acceptedAt,chosen,canPay,depositPaid}:{
  token:string;optional:QuoteLine[];baseTotal:number;depositPct:number;
  accepted:boolean;acceptedName:string;acceptedAt:string;chosen?:number[];canPay:boolean;depositPaid?:{amount:number;at:string}|null;
}){
  const [sel,setSel]=useState<number[]>(chosen||[]);
  const [name,setName]=useState("");
  const [done,setDone]=useState(accepted?{name:acceptedName,at:acceptedAt}:null as null|{name:string;at:string});
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const add=sel.reduce((a,i)=>a+(optional[i]?.total||0),0);
  const total=r2(baseTotal+add);
  const deposit=r2(total*depositPct/100);
  const toggle=(i:number)=>{if(done)return;setSel(s=>s.includes(i)?s.filter(x=>x!==i):[...s,i].sort((a,b)=>a-b))};
  async function accept(){
    if(!name.trim()){setErr("Please type your name.");return}
    setBusy(true);setErr("");
    try{
      const r=await fetch("/api/quote-accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,name:name.trim(),options:sel})});
      const d=await r.json();if(!r.ok)throw new Error(d?.error||"Error");
      setDone({name:name.trim(),at:d.accepted_at});
    }catch(e){setErr(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  return <>
    {optional.length>0&&<>
      <h3 style={{marginTop:24}}>Optional add-ons</h3>
      <p style={{fontSize:14,color:"#667085",margin:"0 0 8px"}}>{done?"Add-ons you selected:":"Check the items you'd like to add — the total updates automatically."}</p>
      <div style={{display:"grid",gap:8}}>
        {optional.map((l,i)=>{const on=sel.includes(i);return <label key={i} style={{display:"flex",gap:12,alignItems:"flex-start",padding:12,borderRadius:12,border:`2px solid ${on?"#2f6df6":"#e4e7ec"}`,background:on?"#eff4ff":"#fff",cursor:done?"default":"pointer",opacity:done&&!on?.55:1}}>
          <input type="checkbox" checked={on} disabled={!!done} onChange={()=>toggle(i)} style={{width:22,height:22,marginTop:2,flex:"none"}}/>
          <span style={{flex:1}}><strong>{l.name}</strong>{l.note&&<span className="sharedNote" style={{display:"block"}}>{l.note}</span>}<small style={{color:"#667085"}}>{l.qty} {l.unit}</small></span>
          <b style={{whiteSpace:"nowrap"}}>+{money(l.total)}</b>
        </label>})}
      </div>
    </>}
    {optional.length>0&&<div className="sharedTotals" style={{marginTop:16}}>
      {add>0&&<><div><span>Estimate</span><span>{money(baseTotal)}</span></div><div><span>Selected add-ons</span><span>+{money(add)}</span></div></>}
      <div className="grand"><span>{add>0?"Your total":"Total"}</span><span>{money(total)}</span></div>
      {deposit>0&&<div><span>Required deposit ({depositPct}%)</span><strong>{money(deposit)}</strong></div>}
    </div>}
    {done?<>
      <div className="noPrint" style={{marginTop:24,padding:16,borderRadius:14,background:"#ecfdf3",color:"#067647"}}>
        ✓ Estimate accepted{done.name?` by ${done.name}`:""}{done.at?` on ${new Date(done.at).toLocaleDateString("en-US")}`:""} — {money(total)}. Thank you — we will contact you to schedule the work.
      </div>
      {(canPay||depositPaid)&&<PayDeposit token={token} amount={deposit} paid={depositPaid}/>}
    </>:<div className="noPrint" style={{marginTop:24,padding:16,borderRadius:14,border:"1px solid #d0d5dd"}}>
      <h3 style={{marginTop:0}}>Accept this estimate — {money(total)}</h3>
      <p style={{fontSize:14,color:"#667085"}}>Type your name and press Accept. This does not charge anything{canPay&&deposit>0?" — after accepting you can pay the deposit by card, or we will contact you to arrange it.":" — we will contact you to confirm the schedule and deposit."}</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={{flex:"1 1 200px",padding:10,borderRadius:10,border:"1px solid #d0d5dd"}}/>
        <button className="primary" disabled={busy} onClick={accept}>{busy?"Sending…":"Accept estimate"}</button>
      </div>
      {err&&<p style={{color:"#b42318",fontSize:14}}>{err}</p>}
    </div>}
  </>;
}
