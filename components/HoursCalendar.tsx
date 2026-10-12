"use client";
import {useEffect,useState} from "react";
import type {Statement,WorkEntry,Payout} from "@/lib/statement";
import {crewSummary} from "@/lib/statement";
import {normDate} from "@/lib/receiptBatch";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
const uid=()=>crypto.randomUUID();
const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const usDate=(s:string)=>{const [y,m,d]=s.split("-");return `${m}/${d}/${y}`};
const addDays=(d:Date,n:number)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const monday=(d:Date)=>{const x=new Date(d);const wd=(x.getDay()+6)%7;x.setDate(x.getDate()-wd);x.setHours(0,0,0,0);return x};
const DAYS=["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
const fmt=(d:Date)=>d.toLocaleDateString("uk-UA",{day:"numeric",month:"short"});
const LS_URL="qc_ics_url",LS_FILTER="qc_ics_filter";
const lsGet=(k:string)=>{try{return localStorage.getItem(k)||""}catch{return ""}};
const lsSet=(k:string,v:string)=>{try{v?localStorage.setItem(k,v):localStorage.removeItem(k)}catch{}};

type Row={sid:string;eid:string;client:string;project:string;worker:string;self:boolean;rate:number;hours:number;note:string};
type CalEv={title:string;start:string;end:string;time:string;location:string};

// Календар годин: усі проєкти по днях, тижнях і місяцях — хто, де, скільки годин; виплати; планові роботи з Google Calendar.
export default function HoursCalendar({list,onPatch,onClose}:{list:Statement[];onPatch:(id:string,p:Partial<Statement>)=>void;onClose:()=>void}){
  const [mode,setMode]=useState<"week"|"month">("week");
  const [week,setWeek]=useState(()=>monday(new Date()));
  const [month,setMonth]=useState(()=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),1)});
  const [addDay,setAddDay]=useState<string|null>(null);
  const [fSid,setFSid]=useState("");
  const [fWid,setFWid]=useState("");
  const [fHours,setFHours]=useState("");
  // виплата помічнику
  const [payFor,setPayFor]=useState<string|null>(null);
  const [pSid,setPSid]=useState("");
  const [pAmt,setPAmt]=useState("");
  // Google Calendar (секретне iCal-посилання лишається в цьому браузері)
  const [icsUrl,setIcsUrl]=useState("");
  const [icsFilter,setIcsFilter]=useState("");
  const [icsDraft,setIcsDraft]=useState("");
  const [setup,setSetup]=useState(false);
  const [events,setEvents]=useState<CalEv[]>([]);
  const [calMsg,setCalMsg]=useState("");
  const projects=list.filter(s=>!s.own);

  useEffect(()=>{const u=lsGet(LS_URL);setIcsUrl(u);setIcsDraft(u);setIcsFilter(lsGet(LS_FILTER))},[]);
  useEffect(()=>{
    if(!icsUrl){setEvents([]);return}
    let on=true;setCalMsg("Завантажую календар…");
    fetch("/api/calendar-ics",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:icsUrl})})
      .then(r=>r.json()).then(j=>{if(!on)return;if(j.error){setCalMsg(j.error);setEvents([])}else{setEvents(j.events||[]);setCalMsg("")}})
      .catch(()=>{if(on)setCalMsg("Не вдалося завантажити календар")});
    return()=>{on=false};
  },[icsUrl]);
  const shown=events.filter(e=>!icsFilter.trim()||icsFilter.split(",").some(w=>w.trim()&&e.title.toLowerCase().includes(w.trim().toLowerCase())));
  const evOn=(k:string)=>shown.filter(e=>e.start<=k&&k<=e.end);

  // усі записи годин, розкладені по ISO-даті
  const byDate=new Map<string,Row[]>();
  for(const s of projects){
    const crew=s.crew||[];
    for(const w of s.workLog||[]){
      const d=normDate(w.date);if(!d)continue;
      const c=crew.find(x=>x.id===w.workerId);
      const row:Row={sid:s.id,eid:w.id,client:s.client||"Без імені",project:s.project||"",worker:c?.name||"?",self:!!c?.self,rate:Number(c?.rate)||0,hours:Number(w.hours)||0,note:w.note||""};
      byDate.set(d,[...(byDate.get(d)||[]),row]);
    }
  }
  const todayIso=iso(new Date());
  const rangeDays=mode==="week"?Array.from({length:7},(_,i)=>addDays(week,i)):(()=>{
    const last=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    return Array.from({length:last},(_,i)=>new Date(month.getFullYear(),month.getMonth(),i+1));
  })();

  // підсумок періоду по людях
  const wk=new Map<string,{hours:number;pay:number;self:boolean}>();
  let totHours=0,totCost=0;
  for(const d of rangeDays){for(const r of byDate.get(iso(d))||[]){
    const cur=wk.get(r.worker)||{hours:0,pay:0,self:r.self};
    cur.hours=r2(cur.hours+r.hours);cur.pay=r2(cur.pay+r.hours*r.rate);wk.set(r.worker,cur);
    totHours=r2(totHours+r.hours);if(!r.self)totCost=r2(totCost+r.hours*r.rate);
  }}
  const periodRows=Array.from(wk.entries());
  // скільки винен кожному помічнику по всіх проєктах (за іменем)
  const owedByName=new Map<string,number>();const projOf=new Map<string,{sid:string;owed:number}[]>();
  for(const s of projects){for(const r of crewSummary(s).rows){if(r.self)continue;const k=r.name.trim().toLowerCase();
    owedByName.set(k,r2((owedByName.get(k)||0)+r.owed));projOf.set(k,[...(projOf.get(k)||[]),{sid:s.id,owed:r.owed}])}}

  const sel=projects.find(s=>s.id===fSid);
  function openAdd(d:string,title?:string){
    setAddDay(d);
    let s=projects[0];
    if(title){const t=title.toLowerCase();const m=projects.find(p=>p.client&&t.includes(p.client.trim().toLowerCase()));if(m)s=m}
    setFSid(s?.id||"");setFWid((s?.crew||[])[0]?.id||"");setFHours("");
  }
  function pickProject(id:string){setFSid(id);const s=projects.find(x=>x.id===id);setFWid((s?.crew||[])[0]?.id||"")}
  function save(){
    const s=projects.find(x=>x.id===fSid);const h=Number(fHours)||0;
    if(!s||!addDay||h<=0)return;
    let crew=s.crew||[];let wid=fWid;
    if(!crew.length||!crew.some(c=>c.id===wid)){const me={id:uid(),name:"Я",rate:0,self:true};crew=[...crew,me];wid=me.id}
    const entry:WorkEntry={id:uid(),date:usDate(addDay),workerId:wid,hours:h};
    onPatch(s.id,{crew,workLog:[...(s.workLog||[]),entry]});
    setAddDay(null);setFHours("");
  }
  function remove(sid:string,eid:string){
    const s=projects.find(x=>x.id===sid);if(!s)return;
    onPatch(sid,{workLog:(s.workLog||[]).filter(w=>w.id!==eid)});
  }
  function openPay(name:string){
    const k=name.trim().toLowerCase();const opts=projOf.get(k)||[];
    const best=[...opts].sort((a,b)=>b.owed-a.owed)[0];
    setPayFor(k);setPSid(best?.sid||"");setPAmt(best&&best.owed>0?String(best.owed):"");
  }
  function savePay(){
    const s=projects.find(x=>x.id===pSid);const amt=Number(pAmt)||0;if(!s||!payFor||amt<=0)return;
    const c=(s.crew||[]).find(x=>x.name.trim().toLowerCase()===payFor);if(!c)return;
    const p:Payout={id:uid(),date:usDate(todayIso),workerId:c.id,amount:amt};
    onPatch(s.id,{payouts:[...(s.payouts||[]),p]});setPayFor(null);setPAmt("");
  }
  function connect(){
    const u=icsDraft.trim();lsSet(LS_URL,u);lsSet(LS_FILTER,icsFilter.trim());setIcsUrl(u);setSetup(false);
  }

  const goPrev=()=>mode==="week"?setWeek(addDays(week,-7)):setMonth(new Date(month.getFullYear(),month.getMonth()-1,1));
  const goNext=()=>mode==="week"?setWeek(addDays(week,7)):setMonth(new Date(month.getFullYear(),month.getMonth()+1,1));
  const goToday=()=>{setWeek(monday(new Date()));const n=new Date();setMonth(new Date(n.getFullYear(),n.getMonth(),1))};
  const title=mode==="week"?`${fmt(week)} – ${fmt(addDays(week,6))}`:month.toLocaleDateString("uk-UA",{month:"long",year:"numeric"});

  const dayCard=(d:Date,i:number)=>{const k=iso(d);const rows=byDate.get(k)||[];const tot=r2(rows.reduce((a,r)=>a+r.hours,0));const isToday=k===todayIso;const evs=evOn(k);return(
    <div key={k} style={{marginTop:10,border:`1px solid ${isToday?"#2563eb":"#e4e7ec"}`,borderRadius:14,padding:"10px 12px",background:isToday?"#eff6ff":(i>=5?"#fafafa":"#fff")}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <b>{DAYS[i]}, {fmt(d)}{isToday?" · сьогодні":""}</b>
        <span style={{display:"flex",gap:8,alignItems:"center"}}>{tot>0&&<b>{tot} год</b>}<button className="add" style={{padding:"6px 12px"}} onClick={()=>addDay===k?setAddDay(null):openAdd(k)}>{addDay===k?"✕":"＋"}</button></span>
      </div>
      {evs.map((e,j)=><div key={j} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:6,fontSize:13,padding:"5px 8px",marginTop:6,background:"#fffaeb",border:"1px solid #fedf89",borderRadius:10,alignItems:"center"}}>
        <span>📅 <b>{e.title.split("\n")[0]}</b>{e.time&&e.start===k?` · ${e.time}`:""}{e.start!==e.end?` · ${e.start.slice(5)}–${e.end.slice(5)}`:""}{e.location&&<small className="muted" style={{display:"block"}}>{e.location}</small>}</span>
        <button className="secondary" style={{padding:"5px 10px",fontSize:12}} onClick={()=>openAdd(k,e.title)}>＋ год</button>
      </div>)}
      {rows.map(r=><div key={r.eid} style={{display:"grid",gridTemplateColumns:"1fr auto 30px",gap:6,fontSize:14,padding:"5px 0",borderTop:"1px solid #eaecf0",marginTop:5,alignItems:"center"}}>
        <span><b>{r.client}</b>{r.project?` — ${r.project}`:""}<small className="muted" style={{display:"block"}}>{r.worker}{r.self?" (я)":""}{r.note?` · ${r.note}`:""}</small></span>
        <b>{r.hours} год</b>
        <button className="remove" style={{width:30,fontSize:16}} onClick={()=>remove(r.sid,r.eid)}>×</button>
      </div>)}
      {addDay===k&&<div style={{marginTop:8,display:"grid",gap:6}}>
        {projects.length===0?<small className="muted">Спершу створи проєкт в «Оплати».</small>:<>
          <select value={fSid} onChange={e=>pickProject(e.target.value)}>{projects.map(s=><option key={s.id} value={s.id}>{s.client||"Без імені"}{s.project?` — ${s.project}`:""}</option>)}</select>
          <div style={{display:"grid",gridTemplateColumns:"1fr 90px auto",gap:6}}>
            {(sel?.crew||[]).length>0?<select value={fWid} onChange={e=>setFWid(e.target.value)}>{(sel?.crew||[]).map(c=><option key={c.id} value={c.id}>{c.name||"Без імені"}{c.self?" (я)":""}</option>)}</select>:<input disabled value="Я (додам у проєкт)"/>}
            <input type="number" min="0" step="0.5" placeholder="год" value={fHours} onChange={e=>setFHours(e.target.value)}/>
            <button className="primary" style={{padding:"10px 14px"}} disabled={!(Number(fHours)>0)} onClick={save}>Зберегти</button>
          </div></>}
      </div>}
    </div>)};

  // місячна сітка
  const firstDow=(new Date(month.getFullYear(),month.getMonth(),1).getDay()+6)%7;
  const cells:(Date|null)[]=[...Array(firstDow).fill(null),...rangeDays];
  while(cells.length%7)cells.push(null);

  return <section className="panel">
    <div className="head noPrint"><button onClick={onClose} style={{background:"#fff"}}>← Список</button><h2>🗓 Години по днях</h2><span/></div>
    <div style={{display:"flex",gap:6,marginTop:10}}>
      {(["week","month"] as const).map(m=><button key={m} onClick={()=>setMode(m)} style={{flex:1,borderRadius:999,padding:"8px 12px",fontWeight:800,background:mode===m?"#101828":"#eef2f7",color:mode===m?"#fff":"#344054"}}>{m==="week"?"Тиждень":"Місяць"}</button>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:8,alignItems:"center",marginTop:10}}>
      <button className="secondary" onClick={goPrev}>‹</button>
      <button className="secondary" onClick={goToday} style={{fontWeight:800,textTransform:"capitalize"}}>{title}</button>
      <button className="secondary" onClick={goNext}>›</button>
    </div>

    <div style={{marginTop:12,background:"#f8fafc",border:"1px solid #e4e7ec",borderRadius:14,padding:"10px 12px"}}>
      <div style={{display:"flex",justifyContent:"space-between",fontWeight:800}}><span>{mode==="week"?"Тиждень":"Місяць"}</span><span>{totHours} год{totCost>0?` · помічникам ${money(totCost)}`:""}</span></div>
      {periodRows.length===0?<small className="muted">За цей період годин ще нема.</small>:periodRows.map(([n,v])=>{const k=n.trim().toLowerCase();const owed=owedByName.get(k)||0;return <div key={n} style={{borderTop:"1px solid #eaecf0",marginTop:4,paddingTop:4}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:14,alignItems:"center"}}>
          <span>{n}{v.self?" (я)":""}</span>
          <span style={{display:"flex",gap:8,alignItems:"center"}}><span><b>{v.hours} год</b>{!v.self&&v.pay>0?` · ${money(v.pay)}`:""}</span>
            {!v.self&&projOf.has(k)&&<button className="secondary" style={{padding:"5px 10px",fontSize:12}} onClick={()=>payFor===k?setPayFor(null):openPay(n)}>💵 Виплата</button>}</span>
        </div>
        {!v.self&&projOf.has(k)&&<small className="muted">всього винен по проєктах: <b style={{color:owed>0.005?"#b42318":"#067647"}}>{money(owed)}</b></small>}
        {payFor===k&&<div style={{display:"grid",gridTemplateColumns:"1fr 90px auto",gap:6,marginTop:6}}>
          <select value={pSid} onChange={e=>{setPSid(e.target.value);const o=(projOf.get(k)||[]).find(x=>x.sid===e.target.value);setPAmt(o&&o.owed>0?String(o.owed):"")}}>
            {(projOf.get(k)||[]).map(o=>{const s=projects.find(x=>x.id===o.sid);return <option key={o.sid} value={o.sid}>{s?.client||"Без імені"}{s?.project?` — ${s.project}`:""} · винен {money(o.owed)}</option>})}
          </select>
          <input type="number" min="0" step="0.01" placeholder="$" value={pAmt} onChange={e=>setPAmt(e.target.value)}/>
          <button className="primary" style={{padding:"10px 14px"}} disabled={!(Number(pAmt)>0)} onClick={savePay}>Виплатити</button>
        </div>}
      </div>})}
    </div>

    <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
      <small className="muted">{icsUrl?`📅 Google Calendar підключено · подій: ${shown.length}`:"📅 Google Calendar не підключено"}</small>
      <button className="secondary" style={{padding:"6px 12px",fontSize:13}} onClick={()=>setSetup(x=>!x)}>{icsUrl?"Налаштувати":"Підключити"}</button>
    </div>
    {calMsg&&<small className="muted" style={{display:"block",marginTop:4}}>{calMsg}</small>}
    {setup&&<div style={{marginTop:8,padding:10,background:"#f8fafc",borderRadius:12,display:"grid",gap:8}}>
      <small className="muted">Google Calendar (з комп'ютера) → ⚙ Налаштування → потрібний календар → «Secret address in iCal format» → скопіюй посилання й встав сюди. Воно лишається лише в цьому браузері. Повторювані події не показуються.</small>
      <input placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={icsDraft} onChange={e=>setIcsDraft(e.target.value)}/>
      <input placeholder="Показувати лише події зі словами (через кому), напр. ремонт, bathroom, Mubeena — або залиш порожнім" value={icsFilter} onChange={e=>setIcsFilter(e.target.value)}/>
      <div style={{display:"flex",gap:8}}><button className="primary" onClick={connect}>Зберегти</button>{icsUrl&&<button className="secondary" onClick={()=>{setIcsDraft("");lsSet(LS_URL,"");lsSet(LS_FILTER,"");setIcsUrl("");setIcsFilter("");setSetup(false)}}>Відключити</button>}</div>
    </div>}

    {mode==="week"?rangeDays.map((d,i)=>dayCard(d,i)):<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginTop:12,textAlign:"center",fontSize:11,color:"#667085"}}>{DAYS.map(d=><span key={d}>{d}</span>)}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginTop:4}}>
        {cells.map((d,i)=>{if(!d)return <div key={"e"+i}/>;const k=iso(d);const rows=byDate.get(k)||[];const tot=r2(rows.reduce((a,r)=>a+r.hours,0));const evs=evOn(k);const isToday=k===todayIso;
          return <button key={k} onClick={()=>{setWeek(monday(d));setMode("week")}} style={{minHeight:58,borderRadius:10,padding:"4px 2px",background:isToday?"#dbeafe":tot>0?"#ecfdf3":"#fff",border:`1px solid ${isToday?"#2563eb":"#e4e7ec"}`,display:"grid",alignContent:"start",justifyItems:"center",gap:2}}>
            <span style={{fontSize:12,fontWeight:isToday?900:600,color:"#344054"}}>{d.getDate()}</span>
            {tot>0&&<b style={{fontSize:12,color:"#067647"}}>{tot}г</b>}
            {evs.length>0&&<span style={{fontSize:10,color:"#b54708"}}>📅{evs.length>1?evs.length:""}</span>}
          </button>})}
      </div>
      <small className="muted" style={{display:"block",marginTop:8}}>Натисни день — відкриється його тиждень, де можна додати години.</small>
    </>}
  </section>;
}
