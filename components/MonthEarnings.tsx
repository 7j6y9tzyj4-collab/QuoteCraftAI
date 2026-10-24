"use client";
import {useMemo,useState} from "react";
import type {Statement} from "@/lib/statement";
import {statementTotals} from "@/lib/statement";
import {normDate} from "@/lib/receiptBatch";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
const ym=(d:string)=>normDate(d).slice(0,7);
const isMe=(name:string,self?:boolean)=>!!self||/^(я|me|vasyl|василь)$/i.test(String(name||"").trim());

// Оплати → «💰 Мій заробіток за місяць»: отримано від клієнтів − чеки (матеріали й мої витрати) − виплати помічникам = на руках.
export default function MonthEarnings({list}:{list:Statement[]}){
  const now=new Date();
  const [month,setMonth]=useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
  const [open,setOpen]=useState(false);
  const shift=(k:number)=>{const [y,m]=month.split("-").map(Number);const d=new Date(y,m-1+k,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`)};
  const v=useMemo(()=>{
    let got=0,mat=0,own=0,paidOut=0,myHours=0,owed=0;
    const rows:{name:string;got:number;mat:number;out:number;hours:number}[]=[];
    for(const s of list){
      const g=r2(s.payments.filter(p=>ym(p.date)===month).reduce((a,p)=>a+(Number(p.amount)||0),0));
      const m=r2(s.receipts.filter(r=>ym(r.date)===month).reduce((a,r)=>a+(Number(r.amount)||0),0));
      const crew=s.crew||[];
      const me=new Set(crew.filter(c=>isMe(c.name,c.self)).map(c=>c.id));
      const o=r2((s.payouts||[]).filter(p=>ym(p.date)===month&&!me.has(p.workerId)).reduce((a,p)=>a+(Number(p.amount)||0),0));
      const h=r2((s.workLog||[]).filter(w=>ym(w.date)===month&&(me.has(w.workerId)||!crew.length)).reduce((a,w)=>a+(Number(w.hours)||0),0));
      if(s.own){own=r2(own+m);continue}
      got=r2(got+g);mat=r2(mat+m);paidOut=r2(paidOut+o);myHours=r2(myHours+h);
      const bal=statementTotals(s).balance;if(bal>0.5)owed=r2(owed+bal);
      if(g||m||o||h)rows.push({name:`${s.client||"Без імені"}${s.project?` — ${s.project}`:""}`,got:g,mat:m,out:o,hours:h});
    }
    const net=r2(got-mat-own-paidOut);
    return {got,mat,own,paidOut,net,myHours,perHour:myHours>0?r2(net/myHours):0,owed,rows};
  },[list,month]);
  const label=new Date(month+"-15").toLocaleDateString("uk-UA",{month:"long",year:"numeric"});
  const line=(t:string,n:number,neg=false)=><div style={{display:"flex",justifyContent:"space-between",fontSize:14}}><span>{t}</span><span>{neg&&n>0?"−":""}{money(n)}</span></div>;
  return <div style={{marginTop:12,padding:14,borderRadius:16,background:"#ecfdf3",border:"1px solid #abefc6"}}>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <button className="secondary" style={{padding:"4px 10px"}} onClick={()=>shift(-1)}>‹</button>
      <b style={{flex:1,textAlign:"center"}}>💰 Мій заробіток · {label}</b>
      <button className="secondary" style={{padding:"4px 10px"}} onClick={()=>shift(1)}>›</button>
    </div>
    <div style={{textAlign:"center",fontSize:30,fontWeight:900,color:v.net<0?"#b42318":"#067647",margin:"6px 0"}}>{money(v.net)}</div>
    <div style={{textAlign:"center",fontSize:13,color:"#475467"}}>на руках{v.myHours>0?` · ${v.myHours} год · ${money(v.perHour)}/год`:""}</div>
    <div style={{display:"grid",gap:3,marginTop:10}}>
      {line("Отримано від клієнтів",v.got)}
      {line("Матеріали за чеками (клієнтські)",v.mat,true)}
      {v.own>0&&line("Мої витрати (інструменти)",v.own,true)}
      {v.paidOut>0&&line("Виплати помічникам",v.paidOut,true)}
      {v.owed>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginTop:4,paddingTop:4,borderTop:"1px solid #abefc6"}}><span>Ще винні клієнти (усі проєкти)</span><b style={{color:"#b54708"}}>{money(v.owed)}</b></div>}
    </div>
    {v.rows.length>0&&<button className="secondary" style={{marginTop:8,width:"100%",fontSize:13}} onClick={()=>setOpen(o=>!o)}>{open?"Сховати":"По проєктах"} ({v.rows.length})</button>}
    {open&&<div style={{marginTop:6,display:"grid",gap:6}}>
      {v.rows.map(r=><div key={r.name} style={{fontSize:13,padding:"6px 8px",background:"#fff",borderRadius:10}}>
        <b>{r.name}</b>
        <div style={{display:"flex",justifyContent:"space-between",color:"#475467"}}><span>{r.hours?`${r.hours} год · `:""}отримано {money(r.got)}{r.mat?` · чеки −${money(r.mat)}`:""}{r.out?` · помічникам −${money(r.out)}`:""}</span><b style={{color:r.got-r.mat-r.out<0?"#b42318":"#067647"}}>{money(r2(r.got-r.mat-r.out))}</b></div>
      </div>)}
      <small className="muted">Мінус по проєкту в роботі — це матеріали, куплені наперед; клієнт поверне їх у розрахунку.</small>
    </div>}
  </div>;
}
