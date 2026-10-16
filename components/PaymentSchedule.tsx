"use client";
import type {Statement,ScheduleStep} from "@/lib/statement";
import {statementTotals} from "@/lib/statement";
import {normDate} from "@/lib/receiptBatch";
import DateInput from "@/components/DateInput";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
const TEMPLATES:{name:string;steps:[string,number][]}[]=[
  {name:"Депозит / середина / фінал",steps:[["Deposit",0],["Progress payment",0],["Final payment",0]]},
  {name:"50 / 50",steps:[["Deposit",50],["Final payment",50]]},
  {name:"30 / 40 / 30",steps:[["Deposit",30],["Progress payment",40],["Final payment",30]]},
];

// стан кожного етапу: оплати клієнта «закривають» етапи по черзі
export function scheduleStatus(st:Statement){
  const paid=statementTotals(st).paid;
  let left=paid;
  const today=new Date().toLocaleDateString("sv-SE");
  return (st.schedule||[]).map(s=>{
    const got=Math.max(0,Math.min(left,Number(s.amount)||0));left=r2(left-got);
    const done=got>=(Number(s.amount)||0)-0.009;
    const due=normDate(s.due||"");
    return {...s,got:r2(got),done,overdue:!done&&!!due&&due<today};
  });
}

export default function PaymentSchedule({st,contractTotal,depositPct,onPatch}:{st:Statement;contractTotal:number;depositPct?:number;onPatch:(p:Partial<Statement>)=>void}){
  const steps=st.schedule||[];
  const rows=scheduleStatus(st);
  const sum=r2(steps.reduce((a,s)=>a+(Number(s.amount)||0),0));
  const next=rows.find(r=>!r.done);
  const set=(id:string,patch:Partial<ScheduleStep>)=>onPatch({schedule:steps.map(s=>s.id===id?{...s,...patch}:s)});
  function fromTemplate(i:number){
    const tpl=TEMPLATES[i];
    if(steps.length&&!confirm("Замінити поточний графік?"))return;
    const base=r2(contractTotal);
    let pcts=tpl.steps.map(s=>s[1]);
    if(i===0){const d=depositPct||25;pcts=[d,Math.round((100-d)/2),100-d-Math.round((100-d)/2)]}
    const out:ScheduleStep[]=tpl.steps.map((s,k)=>({id:crypto.randomUUID(),label:s[0],amount:r2(base*pcts[k]/100)}));
    const diff=r2(base-out.reduce((a,s)=>a+s.amount,0));if(out.length)out[out.length-1].amount=r2(out[out.length-1].amount+diff);
    onPatch({schedule:out});
  }
  return <section className="panel">
    <div className="head"><h2>📅 Графік оплат</h2><button className="add" onClick={()=>onPatch({schedule:[...steps,{id:crypto.randomUUID(),label:"",amount:0}]})}>＋ Етап</button></div>
    {!steps.length&&<>
      <p className="muted" style={{fontSize:14}}>Розбий суму договору ({money(contractTotal)}) на депозит, етапи й фінал — оплати клієнта самі закриватимуть етапи по черзі.</p>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{TEMPLATES.map((t,i)=><button key={i} className="secondary" onClick={()=>fromTemplate(i)}>{i===0?`Депозит ${depositPct||25}% / середина / фінал`:t.name}</button>)}</div>
    </>}
    {next&&<p style={{margin:"10px 0",padding:"8px 10px",borderRadius:10,background:next.overdue?"#fef3f2":"#eff4ff",color:next.overdue?"#b42318":"#1d4ed8",fontSize:14}}>
      Наступна оплата: <b>{next.label||"етап"} — {money(r2((Number(next.amount)||0)-next.got))}</b>{next.due?` до ${next.due}`:""}{next.overdue?" — прострочено":""}
    </p>}
    {steps.length>0&&!next&&<p style={{margin:"10px 0",color:"#067647",fontSize:14}}>✓ Усі етапи оплачено.</p>}
    {rows.map(r=><div key={r.id} style={{display:"grid",gridTemplateColumns:"24px minmax(0,1fr) 130px 100px 36px",gap:6,marginTop:8,alignItems:"center"}}>
      <span title={r.done?"оплачено":r.got>0?"частково":""}>{r.done?"✅":r.got>0?"◐":r.overdue?"⚠️":"○"}</span>
      <input placeholder="Deposit / Progress / Final" value={r.label} onChange={e=>set(r.id,{label:e.target.value})}/>
      <DateInput value={r.due||""} onChange={v=>set(r.id,{due:v||undefined})}/>
      <input type="number" step="0.01" value={r.amount} onChange={e=>set(r.id,{amount:Number(e.target.value)||0})}/>
      <button className="remove" onClick={()=>onPatch({schedule:steps.filter(s=>s.id!==r.id)})}>×</button>
    </div>)}
    {steps.length>0&&<small className="muted" style={{display:"block",marginTop:8}}>Разом за графіком {money(sum)}{Math.abs(sum-contractTotal)>0.01?` · договір ${money(contractTotal)} (різниця ${money(r2(contractTotal-sum))})`:""}. Графік іде в PDF для клієнта.</small>}
  </section>;
}
