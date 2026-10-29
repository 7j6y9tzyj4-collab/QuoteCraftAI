"use client";
import {useMemo,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {statementTotals,statementStatus,type Statement} from "@/lib/statement";
import {findClient,smsHref,type Client} from "@/lib/clients";
import {normDate} from "@/lib/receiptBatch";
import {invoiceLink,reminderText} from "@/lib/invoiceLink";
import {useScheduleJobs,upcomingStart} from "@/lib/scheduleStarts";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const DAY=86400000;
const HIDE="qc_due_hidden";

// Головна → «💵 Чекають оплати»: розрахунки з залишком, де роботу закінчено або давно не працювали; SMS з посиланням на рахунок.
export default function PaymentsDue({user,statements,clients,zelle,onOpen}:{user:User|null;statements:Statement[];clients:Client[];zelle:string;onOpen:(id:string)=>void}){
  const [busy,setBusy]=useState("");
  const [msg,setMsg]=useState("");
  const [hidden,setHidden]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem(HIDE)||"[]")}catch{return []}});
  const jobs=useScheduleJobs(user);
  const rows=useMemo(()=>statements.filter(s=>!s.own).map(s=>{
    const t=statementTotals(s);
    const dates=[...(s.workLog||[]).map(w=>normDate(w.date)),...s.payments.map(p=>normDate(p.date))].filter(Boolean).sort();
    const last=dates[dates.length-1]||String(s.updatedAt||"").slice(0,10);
    const days=last?Math.floor((Date.now()-new Date(last+"T12:00:00").getTime())/DAY):0;
    const st=statementStatus(s,upcomingStart(s,jobs,statements));
    return {s,t,days,st};
  }).filter(r=>r.st!=="planned"&&r.t.balance>0.5&&(r.st==="waiting"||r.st==="done"||r.days>=3)&&!hidden.includes(r.s.id+":"+r.t.balance))
    .sort((a,b)=>b.t.balance-a.t.balance),[statements,hidden,jobs]);
  if(!user||!rows.length)return null;
  const total=rows.reduce((a,r)=>a+r.t.balance,0);
  async function remind(s:Statement,balance:number,copy:boolean){
    if(!user)return;
    setBusy(s.id);setMsg("");
    try{
      const link=await invoiceLink(user,s);
      const text=reminderText(s,balance,link,zelle);
      const phone=findClient(clients,s.client)?.phone;
      if(!copy&&phone){window.location.href=smsHref(phone,text);return}
      const nav=navigator as Navigator&{share?:(d:ShareData)=>Promise<void>};
      if(!copy&&nav.share&&/iPhone|iPad|Android/i.test(navigator.userAgent)){try{await nav.share({text});return}catch{}}
      await navigator.clipboard.writeText(text);setMsg("Текст з посиланням скопійовано — встав у повідомлення клієнту.");
    }catch(e){setMsg("Не вдалося: "+(e instanceof Error?e.message:String(e)))}finally{setBusy("")}
  }
  const hide=(id:string)=>{const next=[...hidden,id].slice(-200);setHidden(next);try{localStorage.setItem(HIDE,JSON.stringify(next))}catch{}};
  return <section className="panel">
    <div className="head"><h2>💵 Чекають оплати · {money(total)}</h2></div>
    <p className="muted" style={{fontSize:13,margin:"0 0 6px"}}>Залишок до оплати, де роботу закінчено або 3+ дні без руху. Нагадування йде з посиланням на свіжий рахунок{zelle?" і твоїм Zelle":""}.</p>
    {rows.map(({s,t,days,st})=><div key={s.id} style={{padding:"10px 0",borderTop:"1px solid #eaecf0"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
        <button onClick={()=>onOpen(s.id)} style={{all:"unset",cursor:"pointer"}}><b>{s.client||"Без імені"}</b><small className="muted" style={{display:"block"}}>{s.project||"Project"} · {st==="active"?`${days} дн. без руху`:st==="done"?"завершено":"чекаю оплату"}</small></button>
        <span style={{textAlign:"right",whiteSpace:"nowrap"}}><b style={{color:"#b42318"}}>{money(t.balance)}</b><small className="muted" style={{display:"block"}}>з {money(t.total)}</small></span>
      </div>
      <div className="actions" style={{marginTop:6,flexWrap:"wrap"}}>
        <button className="secondary" disabled={busy===s.id} onClick={()=>remind(s,t.balance,false)}>{busy===s.id?"…":"💬 Нагадати"}</button>
        <button className="secondary" disabled={busy===s.id} onClick={()=>remind(s,t.balance,true)}>📋 Текст</button>
        <button className="secondary" onClick={()=>hide(s.id+":"+t.balance)} title="Сховати, поки сума не зміниться">✕</button>
      </div>
    </div>)}
    {msg&&<p className="muted" style={{fontSize:13}}>{msg}</p>}
  </section>;
}
