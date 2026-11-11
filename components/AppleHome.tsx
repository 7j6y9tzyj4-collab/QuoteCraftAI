"use client";
import {useEffect,useMemo,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {statementTotals,statementStatus,type Statement} from "@/lib/statement";
import MonthEarnings,{workEarnings} from "@/components/MonthEarnings";
import {useScheduleJobs,upcomingStart,todayISO} from "@/lib/scheduleStarts";
import {ownerFirst,companyName,cardList} from "@/lib/company";
import {findClient,type Client} from "@/lib/clients";
import CrewOwed,{crewOwedAll} from "@/components/CrewOwed";

// 🍏 Головна в стилі Apple: привітання, одна велика кнопка, 4 цифри, найближчі роботи, активні проєкти.
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
type Job={client?:string;title?:string;start?:string;days?:number;sid?:string;address?:string;sat?:boolean;auto?:boolean};
type PTab="over"|"rec"|"pay"|"crew"|"photo";
const Chevron=()=><svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden><path d="M1 1l6 6-6 6" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;

export default function AppleHome({user,statements,clients=[],draftLabel,inbox,onNew,onContinue,onOpenProject,onGo}:{
  user:User|null;statements:Statement[];clients?:Client[];draftLabel:string;inbox:{total:number;text:string};
  onNew:()=>void;onContinue:()=>void;onOpenProject:(id:string,tab?:PTab)=>void;onGo:(s:"pay"|"saved"|"clients")=>void}){
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
    const helpers=crewOwedAll(list);const helpOwed=helpers.reduce((a,r)=>a+Math.max(0,r.owed),0);
    const biz=cardList();
    const warns:{id:string;sid:string;tab:PTab;text:string;sub:string}[]=[];
    for(const {s,t} of rows){const nm=`${s.client||"Без імені"}${s.project?` — ${s.project}`:""}`;
      const unk=s.receipts.filter(r=>r.paidBy===""||(r.paidBy===undefined&&!!r.card&&!biz.includes(r.card)));
      if(unk.length)warns.push({id:"u"+s.id,sid:s.id,tab:"rec",text:`Чек без платника · ${unk.length}`,sub:`${nm} — познач, хто платив (${money(unk.reduce((a,r)=>a+(Number(r.amount)||0),0))})`});
      if(t.matOver>0.5)warns.push({id:"m"+s.id,sid:s.id,tab:"rec",text:`Матеріали понад естімейт на ${money(t.matOver)}`,sub:`${nm} — чеки ${money(t.receipts)} при плані ${money(t.matPlan)}`});
    }
    return {active,owed,received,recvList,owedList,helpers,helpOwed,warns};
  },[statements,jobs]);
  const [open,setOpen]=useState<""|"owed"|"recv"|"earn"|"help">("");
  const [quick,setQuick]=useState<""|PTab>("");
  const earn=useMemo(()=>{const d=new Date();return workEarnings(statements,`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`)},[statements]);
  const t=todayISO();const week=new Date(Date.now()+7*864e5).toLocaleDateString("sv-SE",{timeZone:"America/Chicago"});
  const soon=(jobs||[]).filter(j=>j.start&&j.start>t&&j.start<=week).sort((a,b)=>String(a.start).localeCompare(String(b.start))).slice(0,4);
  const addDays=(iso:string,n:number)=>{const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+n);return d.toLocaleDateString("sv-SE")};
  // кінець роботи за робочими днями (неділя — вихідний, субота — якщо позначено)
  const endOf=(j:Job)=>{let d=new Date(String(j.start)+"T12:00:00");let left=Math.max(1,Math.ceil(Number(j.days)||1));for(let g=0;g<400;g++){const wd=d.getDay();if(wd!==0&&(wd!==6||j.sat)){left--;if(left<=0)break}d.setDate(d.getDate()+1)}return d.toLocaleDateString("sv-SE")};
  const planned:Job[]=(jobs||[]).filter(j=>j.start&&j.start<=t&&endOf(j)>=t);
  // проєкти в роботі, яких нема в графіку: години записані за останні 3 дні
  const iso=(d:string)=>{const m=String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})/);return m?`${m[3]}-${m[1]}-${m[2]}`:String(d).slice(0,10)};
  const from3=addDays(t,-3);
  const live:Job[]=v.active.filter(({s})=>(s.workLog||[]).some(w=>{const d=iso(w.date);return d>=from3&&d<=t})&&!planned.some(j=>j.sid?j.sid===s.id:String(j.client||"").trim().toLowerCase()===String(s.client||"").trim().toLowerCase())).map(({s})=>({client:s.client,title:s.project,sid:s.id,auto:true}));
  const todayJobs=[...planned,...live];
  const stFor=(j:Job)=>statements.find(s=>!s.own&&(j.sid?s.id===j.sid:String(s.client||"").trim().toLowerCase()===String(j.client||"").trim().toLowerCase()));
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

    <div className="apHomeQuick">
      {([["rec","📷","Чек"],["crew","⏱","Години"],["pay","💵","Оплата"]] as [PTab,string,string][]).map(([k,ic,l])=><button key={k} className={quick===k?"on":""} onClick={()=>{if(v.active.length===1){onOpenProject(v.active[0].s.id,k);return}setQuick(quick===k?"":k)}}><span>{ic}</span>{l}</button>)}
    </div>
    {quick&&<div className="apCard" style={{marginTop:10}}>
      <div className="apRow" style={{display:"block"}}><small>{quick==="rec"?"До якого проєкту чек?":quick==="crew"?"На якому проєкті години?":"Від кого оплата?"}</small></div>
      {v.active.length===0&&<div className="apRow"><small>Немає активних проєктів.</small></div>}
      {v.active.map(({s})=><button key={s.id} className="apRow" onClick={()=>onOpenProject(s.id,quick as PTab)}><span style={{flex:1,minWidth:0}}><b>{s.client||"Без імені"}</b><small>{s.project||""}</small></span><Chevron/></button>)}
    </div>}

    {todayJobs.length>0&&<section className="apGroup">
      <h2>Сьогодні</h2>
      <div className="apCard">{todayJobs.map((j,i)=>{const c=findClient(clients,String(j.client||""));const addr=j.address||c?.address||"";const st=stFor(j);
        return <div key={i} className="apRow" style={{display:"block"}}>
          <b style={{display:"block"}}>{j.client||"Робота"}</b>
          {j.title&&<small style={{display:"block"}}>{j.title}</small>}
          {j.auto&&<small style={{display:"block",color:"#34a853"}}>в роботі · години записані за останні дні</small>}
          {addr&&<small style={{display:"block",marginTop:2}}>📍 {addr}</small>}
          <div className="apActs">
            {addr&&<a href={`https://maps.apple.com/?daddr=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer">🧭 Маршрут</a>}
            {c?.phone&&<a href={`tel:${c.phone}`}>📞 Дзвінок</a>}
            {c?.phone&&<a href={`sms:${c.phone}`}>💬 SMS</a>}
            {st&&<button onClick={()=>onOpenProject(st.id,"crew")}>⏱ Години</button>}
            {st&&<button onClick={()=>onOpenProject(st.id,"rec")}>📷 Чек</button>}
            {st&&<button onClick={()=>onOpenProject(st.id)}>Проєкт</button>}
          </div>
        </div>})}</div>
    </section>}

    {v.warns.length>0&&<div className="apCard apNotice" style={{marginTop:10}}>{v.warns.map(w=><button key={w.id} className="apRow" onClick={()=>onOpenProject(w.sid,w.tab)}><span style={{flex:1,minWidth:0}}><b>⚠ {w.text}</b><small>{w.sub}</small></span><Chevron/></button>)}</div>}

    <div className="apStats">
      <button className="apStat" onClick={()=>setOpen(open==="help"?"":"help")}><small>Винен помічникам</small><b className={v.helpOwed>0.5?"apWarn":"apGood"}>{money(v.helpOwed)}</b><em>{v.helpers.length?v.helpers.map(r=>`${r.name}: робота ${money(r.work)}${r.receipts>0?` + чеки ${money(r.receipts)}`:""}`).join(" · "):"нічого не винен"} · натисни</em></button>
      <button className="apStat" onClick={()=>setOpen(open==="owed"?"":"owed")}><small>Ще не оплачено по проєктах</small><b className={v.owed>0?"apWarn":""}>{money(v.owed)}</b><em>{v.owedList.length} проєкт(ів) · вся сума до кінця робіт · натисни</em></button>
      <button className="apStat" onClick={()=>onGo("saved")}><small>Чекають відповіді</small><b>{awaiting.n}</b>{awaiting.n>0&&<em>{awaiting.viewed} відкрили</em>}</button>
      <button className="apStat" onClick={()=>setOpen(open==="recv"?"":"recv")}><small>Клієнти заплатили за {month}</small><b className="apGood">{money(v.received)}</b><em>{v.recvList.length} оплат(и) · робота + матеріали · натисни</em></button>
    </div>
    <button className="apStat" style={{width:"100%",marginTop:10}} onClick={()=>setOpen(open==="earn"?"":"earn")}><small>Мій заробіток за {month} (робота, без матеріалів)</small><b style={{color:earn.net<0?"#b42318":undefined}} className={earn.net<0?"":"apGood"}>{money(earn.net)}</b><em>{earn.myHours>0?`${earn.myHours} год · ${money(earn.perHour)}/год · `:""}після помічників і моїх витрат · натисни</em></button>
    {open==="help"&&(v.helpers.length?<CrewOwed list={statements}/>:<div className="apCard apEmpty" style={{marginTop:10}}>Помічникам нічого не винен.</div>)}
    {open==="earn"&&<MonthEarnings list={statements}/>}
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
