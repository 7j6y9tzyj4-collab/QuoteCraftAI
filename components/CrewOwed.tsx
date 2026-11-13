"use client";
import {useState} from "react";
import {crewSummary,type Statement} from "@/lib/statement";

// 👷 Скільки я винен помічникам по всіх проєктах: окремо за роботу і за чеки з їхньої картки.
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n||0);
type Row={name:string;work:number;receipts:number;paid:number;owed:number;projects:{sid:string;workerId:string;label:string;work:number;receipts:number;paid:number;owed:number}[]};
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
/** розкидати одну виплату по проєктах: спершу туди, де винен (за списком), залишок — у останній */
export function splitPayout(row:Row,amount:number){
  let left=r2(amount);const out:{sid:string;workerId:string;amount:number}[]=[];
  for(const p of row.projects){if(left<=0)break;const a=r2(Math.min(left,Math.max(0,p.owed)));if(a>0){out.push({sid:p.sid,workerId:p.workerId,amount:a});left=r2(left-a)}}
  if(left>0&&row.projects.length){const last=row.projects[row.projects.length-1];const x=out.find(o=>o.sid===last.sid);if(x)x.amount=r2(x.amount+left);else out.push({sid:last.sid,workerId:last.workerId,amount:left})}
  return out;
}
export function crewOwedAll(list:Statement[]):Row[]{
  const m=new Map<string,Row>();
  for(const s of list){if(s.own)continue;
    for(const r of crewSummary(s).rows){if(r.self)continue;
      if(!(r.accrued||r.reimb||r.paid))continue;
      const k=r.name.trim().toLowerCase();const row=m.get(k)||{name:r.name,work:0,receipts:0,paid:0,owed:0,projects:[]};
      row.work+=r.accrued;row.receipts+=r.reimb;row.paid+=r.paid;row.owed+=r.owed;
      row.projects.push({sid:s.id,workerId:r.id,label:`${s.client||"Без імені"}${s.project?` — ${s.project}`:""}`,work:r.accrued,receipts:r.reimb,paid:r.paid,owed:r.owed});
      m.set(k,row);
    }}
  return [...m.values()].filter(r=>Math.abs(r.owed)>0.5||r.receipts>0);
}
export default function CrewOwed({list,onPay}:{list:Statement[];onPay?:(parts:{sid:string;workerId:string;amount:number}[],name:string,amount:number)=>Promise<string|void>|string|void}){
  const rows=crewOwedAll(list);
  const [payFor,setPayFor]=useState("");const [amt,setAmt]=useState("");const [busy,setBusy]=useState(false);const [note,setNote]=useState("");
  if(!rows.length)return null;
  const line=(l:string,v:string,b=false,c?:string)=><div style={{display:"flex",justifyContent:"space-between",fontSize:b?16:14,fontWeight:b?800:400,color:c,padding:"2px 0"}}><span>{l}</span><span>{v}</span></div>;
  return <section className="panel" style={{border:"1px solid #d9d6fe",background:"#fcfcff"}}>
    <h2 style={{marginTop:0}}>👷 Винен помічникам</h2>
    {rows.map(r=><div key={r.name} style={{marginTop:6}}>
      <b style={{fontSize:16}}>{r.name}</b>
      {line("За роботу (години × ставка)",money(r.work))}
      {line("💳 За чеки з його картки",money(r.receipts),false,r.receipts>0?"#7a5af8":undefined)}
      {r.paid>0&&line("− Вже виплачено",`−${money(r.paid)}`)}
      {line("= Винен разом",money(r.owed),true,r.owed>0.5?"#b42318":"#067647")}
      {onPay&&(payFor===r.name?<div style={{marginTop:8,padding:10,borderRadius:10,background:"#f4f3ff",display:"grid",gap:8}}>
        <label style={{fontSize:14}}>Скільки виплатив, $<input type="number" inputMode="decimal" autoFocus value={amt} onChange={e=>setAmt(e.target.value)} placeholder={String(Math.max(0,r.owed))}/></label>
        {Number(amt)>0&&<small className="muted">Піде в: {splitPayout(r,Number(amt)).map(p=>`${r.projects.find(x=>x.sid===p.sid)?.label||""} ${money(p.amount)}`).join(" · ")}{Number(amt)>r.owed+0.5?` · це на ${money(Number(amt)-r.owed)} більше, ніж винен`:""}</small>}
        <div className="actions"><button className="primary" disabled={busy||!(Number(amt)>0)} onClick={async()=>{setBusy(true);const a=Number(amt);const e=await onPay(splitPayout(r,a),r.name,a);setBusy(false);if(e){setNote(String(e))}else{setNote(`Записано виплату ${money(a)} — ${r.name}.`);setPayFor("");setAmt("")}}}>{busy?"…":"Записати виплату"}</button>
          <button className="secondary" onClick={()=>{setPayFor("");setAmt("")}}>Скасувати</button></div>
      </div>:<button className="secondary" style={{marginTop:8}} onClick={()=>{setPayFor(r.name);setAmt(r.owed>0?String(r.owed):"");setNote("")}}>💵 Виплатив {r.name}</button>)}
      <details style={{marginTop:4}}><summary style={{fontSize:13,color:"#667085"}}>По проєктах ({r.projects.length})</summary>
        {r.projects.map(p=><div key={p.label} style={{fontSize:13,padding:"5px 0",borderTop:"1px solid #f2f4f7"}}>
          <div style={{fontWeight:600}}>{p.label}</div>
          <div style={{color:"#475467"}}>робота {money(p.work)}{p.receipts>0?` · чеки ${money(p.receipts)}`:""}{p.paid>0?` · виплачено ${money(p.paid)}`:""} → <b>{money(p.owed)}</b></div>
        </div>)}
      </details>
    </div>)}
    {note&&<div style={{marginTop:8,fontWeight:600,color:"#067647"}}>{note}</div>}
  </section>;
}
