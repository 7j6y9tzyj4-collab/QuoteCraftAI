"use client";
import {crewSummary,type Statement} from "@/lib/statement";

// 👷 Скільки я винен помічникам по всіх проєктах: окремо за роботу і за чеки з їхньої картки.
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n||0);
type Row={name:string;work:number;receipts:number;paid:number;owed:number;projects:{label:string;work:number;receipts:number;paid:number;owed:number}[]};
export function crewOwedAll(list:Statement[]):Row[]{
  const m=new Map<string,Row>();
  for(const s of list){if(s.own)continue;
    for(const r of crewSummary(s).rows){if(r.self)continue;
      if(!(r.accrued||r.reimb||r.paid))continue;
      const k=r.name.trim().toLowerCase();const row=m.get(k)||{name:r.name,work:0,receipts:0,paid:0,owed:0,projects:[]};
      row.work+=r.accrued;row.receipts+=r.reimb;row.paid+=r.paid;row.owed+=r.owed;
      row.projects.push({label:`${s.client||"Без імені"}${s.project?` — ${s.project}`:""}`,work:r.accrued,receipts:r.reimb,paid:r.paid,owed:r.owed});
      m.set(k,row);
    }}
  return [...m.values()].filter(r=>Math.abs(r.owed)>0.5||r.receipts>0);
}
export default function CrewOwed({list}:{list:Statement[]}){
  const rows=crewOwedAll(list);
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
      <details style={{marginTop:4}}><summary style={{fontSize:13,color:"#667085"}}>По проєктах ({r.projects.length})</summary>
        {r.projects.map(p=><div key={p.label} style={{fontSize:13,padding:"5px 0",borderTop:"1px solid #f2f4f7"}}>
          <div style={{fontWeight:600}}>{p.label}</div>
          <div style={{color:"#475467"}}>робота {money(p.work)}{p.receipts>0?` · чеки ${money(p.receipts)}`:""}{p.paid>0?` · виплачено ${money(p.paid)}`:""} → <b>{money(p.owed)}</b></div>
        </div>)}
      </details>
    </div>)}
  </section>;
}
