"use client";
import {useEffect,useMemo,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {statementTotals,statementStatus,type Statement} from "@/lib/statement";
import {useScheduleJobs,upcomingStart,todayISO} from "@/lib/scheduleStarts";
import {ownerFirst,companyName} from "@/lib/company";

// 🍏 Головна в стилі Apple: привітання, одна велика кнопка, 4 цифри, найближчі роботи, активні проєкти.
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
type Job={client?:string;title?:string;start?:string;days?:number;sid?:string};
const Chevron=()=><svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden><path d="M1 1l6 6-6 6" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;

export default function AppleHome({user,statements,draftLabel,inbox,onNew,onContinue,onOpenProject,onGo}:{
  user:User|null;statements:Statement[];draftLabel:string;inbox:{total:number;text:string};
  onNew:()=>void;onContinue:()=>void;onOpenProject:(id:string)=>void;onGo:(s:"pay"|"saved"|"clients")=>void}){
  const jobs=useScheduleJobs(user) as Job[];
  const [awaiting,setAwaiting]=useState<{n:number;sum:number;viewed:number}>({n:0,sum:0,viewed:0});
  useEffect(()=>{if(!user)return;
    const since=new Date(Date.now()-60*864e5).toISOString();
    supabase.from("shared_quotes").select("status,viewed_at,data").eq("user_id",user.id).in("status",["sent","viewed"]).gte("created_at",since).limit(200)
      .then(({data}:{data:any[]|null})=>{const q=(data||[]).filter(r=>!r.data?.kind);setAwaiting({n:q.length,sum:q.reduce((a,r)=>a+(Number(r.data?.total??r.data?.totals?.total)||0),0),viewed:q.filter(r=>r.viewed_at).length})});
  },[user]);
  const v=useMemo(()=>{
    const list=statements.filter(s=>!s.own);
    const rows=list.map(s=>{const t=statementTotals(s);const st=statementStatus(s,upcomingStart(s,jobs as any,list));return {s,t,st}});
    const active=rows.filter(r=>r.st==="active"||r.st==="waiting").sort((a,b)=>b.t.balance-a.t.balance);
    const owed=rows.reduce((a,r)=>a+Math.max(0,r.t.balance),0);
    const ym=new Date().toISOString().slice(0,7);
    const received=list.reduce((a,s)=>a+s.payments.filter(p=>{const m=String(p.date).match(/^(\d{2})\/\d{2}\/(\d{4})/);return m?`${m[2]}-${m[1]}`===ym:String(p.date).slice(0,7)===ym}).reduce((x,p)=>x+(Number(p.amount)||0),0),0);
    const inMonth=(d:any)=>{const m=String(d).match(/^(\d{2})\/\d{2}\/(\d{4})/);return m?`${m[2]}-${m[1]}`===ym:String(d).slice(0,7)===ym};
    const recvList=list.flatMap(s=>s.payments.filter(p=>inMonth(p.date)).map(p=>({id:p.id,sid:s.id,client:s.client||"Без імені",project:s.project||"",date:String(p.date),method:(p as any).method||"",amount:Number(p.amount)||0}))).sort((a,b)=>b.date.localeCompare(a.date));
    const owedList=rows.filter(r=>r.t.balance>0.5).sort((a,b)=>b.t.balance-a.t.balance);
    return {active,owed,received,recvList,owedList};
  },[statements,jobs]);
  const [open,setOpen]=useState<""|"owed"|"recv">("");
  const t=todayISO();const week=new Date(Date.now()+7*864e5).toLocaleDateString("sv-SE",{timeZone:"America/Chicago"});
  const soon=(jobs||[]).filter(j=>j.start&&j.start>=t&&j.start<=week).sort((a,b)=>String(a.start).localeCompare(String(b.start))).slice(0,4);
  const now=new Date();const h=now.getHours();
  const hello=h<12?"Доброго ранку":h<18?"Добрий день":"Добрий вечір";
  const date=now.toLocaleDateString("uk-UA",{weekday:"long",day:"numeric",month:"long"});
  const name=ownerFirst();
  const month=now.toLocaleDateString("uk-UA",{month:"long"});
  const dayLabel=(iso:string)=>iso===t?"Сьогодні":new Date(iso+"T12:00:00").toLocaleDateString("uk-UA",{weekday:"short",day:"numeric",month:"short"});
  return <div className="apHome">
    <div className="apHello"><small>{date}</small><h1>{hello}{name?`, ${name}`:""}</h1></div>

    <button className="apNew" onClick={onNew}>
      <span className="apNewIcon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14"/></svg></span>
      <span><b>Новий естімейт</b><small>Голосом, фото або текстом</small></span>
    </button>
    {draftLabel&&<button className="apRow apCard" onClick={onContinue} style={{marginTop:10}}><span><b>Продовжити чернетку</b><small>{draftLabel}</small></span><Chevron/></button>}

    {inbox.total>0&&<button className="apRow apCard apNotice" onClick={()=>onGo("pay")}><span><b>Нове від помічника · {inbox.total}</b><small>{inbox.text}</small></span><Chevron/></button>}

    <div className="apStats">
      <button className="apStat" onClick={()=>onGo("pay")}><small>Активні проєкти</small><b>{v.active.length}</b></button>
      <button className="apStat" onClick={()=>setOpen(open==="owed"?"":"owed")}><small>Ще не оплачено по проєктах</small><b className={v.owed>0?"apWarn":""}>{money(v.owed)}</b><em>{v.owedList.length} проєкт(ів) · вся сума до кінця робіт · натисни</em></button>
      <button className="apStat" onClick={()=>onGo("saved")}><small>Чекають відповіді</small><b>{awaiting.n}</b>{awaiting.n>0&&<em>{awaiting.viewed} відкрили</em>}</button>
      <button className="apStat" onClick={()=>setOpen(open==="recv"?"":"recv")}><small>Клієнти заплатили за {month}</small><b className="apGood">{money(v.received)}</b><em>{v.recvList.length} оплат(и) · робота + матеріали · натисни</em></button>
    </div>
    {open==="owed"&&<div className="apCard" style={{marginTop:10}}>
      <div className="apRow" style={{display:"block"}}><b>Хто скільки ще не заплатив</b><small style={{display:"block"}}>Це залишок по кожному проєкту: вся сума (робота + матеріали) мінус те, що клієнт уже дав. Не обов'язково до сплати сьогодні — частина за ще не зроблену роботу.</small></div>
      {v.owedList.map(({s,t})=><button key={s.id} className="apRow" onClick={()=>onOpenProject(s.id)}><span style={{flex:1,minWidth:0}}><b>{s.client||"Без імені"}</b><small>{s.project||""}</small><small style={{display:"block"}}>всього {money(t.total)} · заплатили {money(t.paid)}</small></span><span className="apAmt"><b className="apWarn">{money(t.balance)}</b><small>залишок</small></span><Chevron/></button>)}
    </div>}
    {open==="recv"&&<div className="apCard" style={{marginTop:10}}>
      <div className="apRow" style={{display:"block"}}><b>Оплати від клієнтів за {month}</b><small style={{display:"block"}}>Усі гроші, що прийшли цього місяця (за роботу і за матеріали разом). Це не твій заробіток — чеки і помічник звідси не відняті.</small></div>
      {v.recvList.length===0&&<div className="apRow"><small>Цього місяця оплат ще не внесено.</small></div>}
      {v.recvList.map(p=><button key={p.id} className="apRow" onClick={()=>onOpenProject(p.sid)}><span style={{flex:1,minWidth:0}}><b>{p.client}</b><small>{p.project}</small><small style={{display:"block"}}>{p.date}{p.method?` · ${p.method}`:""}</small></span><span className="apAmt"><b className="apGood">{money(p.amount)}</b></span><Chevron/></button>)}
    </div>}

    {soon.length>0&&<section className="apGroup">
      <h2>Найближчі роботи</h2>
      <div className="apCard">{soon.map((j,i)=><div key={i} className="apRow"><span><b>{j.client||"Робота"}</b><small>{j.title||""}</small></span><span className="apTag">{dayLabel(String(j.start))}</span></div>)}</div>
    </section>}

    <section className="apGroup">
      <div className="apGroupHead"><h2>Активні проєкти</h2>{v.active.length>0&&<button onClick={()=>onGo("pay")}>Усі</button>}</div>
      {v.active.length===0?<div className="apCard apEmpty">Немає активних проєктів. Коли клієнт прийме естімейт — проєкт з'явиться тут.</div>
      :<div className="apCard">{v.active.slice(0,6).map(({s,t})=>{const pct=t.total>0?Math.min(100,Math.round(t.paid/t.total*100)):0;
        return <button key={s.id} className="apRow" onClick={()=>onOpenProject(s.id)}>
          <span style={{flex:1,minWidth:0}}><b>{s.client||"Без імені"}</b><small>{s.project||companyName()}</small>
            <i className="apBar"><i style={{width:pct+"%"}}/></i></span>
          <span className="apAmt">{t.balance>0.5?<><b className="apWarn">{money(t.balance)}</b><small>залишок</small><small>заплатили {money(t.paid)} з {money(t.total)}</small></>:<><b className="apGood">✓ Оплачено повністю</b><small>{money(t.total)}</small></>}</span>
          <Chevron/>
        </button>})}</div>}
    </section>
  </div>;
}
