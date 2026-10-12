"use client";
import {useMemo,useState} from "react";
import type {Statement} from "@/lib/statement";
import {statementTotals,OWN_CATS,guessOwnCategory} from "@/lib/statement";
import type {SavedCalc} from "@/lib/calcTypes";
import {normDate} from "@/lib/receiptBatch";
import {findCalcFor} from "@/lib/priceHistory";
import {computeCalcLine} from "@/lib/calcEngine";
import {tierItems} from "@/lib/tiers";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
const sum=(xs:number[])=>r2(xs.reduce((a,b)=>a+(Number(b)||0),0));
const MONTHS=["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];
const th:React.CSSProperties={padding:6,textAlign:"right",whiteSpace:"nowrap"};

// Річний звіт: дохід по клієнтах, по місяцях, по типах робіт, мої витрати; CSV для бухгалтера / QuickBooks.
export default function YearReport({list,calcs,onClose}:{list:Statement[];calcs:SavedCalc[];onClose:()=>void}){
  const years=useMemo(()=>{
    const ys=new Set<string>([String(new Date().getFullYear())]);
    for(const s of list){for(const p of s.payments)ys.add(normDate(p.date).slice(0,4));for(const r of s.receipts)ys.add(normDate(r.date).slice(0,4))}
    return [...ys].filter(y=>/^\d{4}$/.test(y)).sort().reverse();
  },[list]);
  const [year,setYear]=useState(years[0]);
  const inY=(d:string)=>normDate(d).startsWith(year);

  const R=useMemo(()=>{
    const clients=list.filter(s=>!s.own);
    const own=list.find(s=>s.own);
    const rows=clients.map(s=>{
      const paid=sum(s.payments.filter(p=>inY(p.date)).map(p=>p.amount));
      const receipts=sum(s.receipts.filter(r=>inY(r.date)).map(r=>r.amount));
      const t=statementTotals(s);
      return {s,paid,receipts,labor:t.labor,balance:t.balance,earned:r2(paid-receipts)};
    }).filter(x=>x.paid||x.receipts).sort((a,b)=>b.paid-a.paid);
    const months=MONTHS.map((_,i)=>{
      const m=`${year}-${String(i+1).padStart(2,"0")}`;
      const at=(d:string)=>normDate(d).startsWith(m);
      return {
        paid:sum(clients.flatMap(s=>s.payments.filter(p=>at(p.date)).map(p=>p.amount))),
        receipts:sum(clients.flatMap(s=>s.receipts.filter(r=>at(r.date)).map(r=>r.amount))),
        own:sum((own?.receipts||[]).filter(r=>at(r.date)).map(r=>r.amount)),
      };
    });
    const ownCats=OWN_CATS.map(c=>({c,sum:sum((own?.receipts||[]).filter(r=>inY(r.date)&&(r.category||guessOwnCategory(r.items))===c).map(r=>r.amount))}));
    // типи робіт: праця з естімейтів, прив'язаних до клієнтів цього року
    const types:Record<string,number>={};
    for(const x of rows){
      const c=findCalcFor(x.s,calcs);if(!c)continue;
      const items=c.tiers?.enabled&&typeof c.tiers.chosen==="number"?tierItems(c.items||[],c.tiers,c.tiers.chosen):(c.items||[]);
      for(const li of items){if(li.optional)continue;const k=li.category||"Інше";types[k]=r2((types[k]||0)+computeCalcLine(li,c.locationMultiplier??1,c.includeFinish!==false).labor)}
    }
    const typeRows=Object.entries(types).sort((a,b)=>b[1]-a[1]);
    const income=sum(rows.map(x=>x.paid)),reimb=sum(rows.map(x=>x.receipts)),ownT=sum(ownCats.map(x=>x.sum));
    return {rows,months,ownCats,typeRows,income,reimb,ownT,earned:r2(income-reimb),net:r2(income-reimb-ownT)};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[list,calcs,year]);

  function csv(){
    const q=(v:unknown)=>`"${String(v??"").replace(/"/g,'""')}"`;
    const f=(n:number)=>r2(n).toFixed(2);
    const L:string[]=[];
    L.push(q(`K&V House Renovation — річний звіт ${year}`),"");
    L.push(["Клієнт","Проєкт","Отримано","Чеки (матеріали клієнта)","Заробіток","Залишок зараз"].map(q).join(","));
    for(const x of R.rows)L.push([q(x.s.client),q(x.s.project),f(x.paid),f(x.receipts),f(x.earned),f(x.balance)].join(","));
    L.push([q("Разом"),q(""),f(R.income),f(R.reimb),f(R.earned),q("")].join(","),"");
    L.push(["Місяць","Отримано","Чеки клієнтів","Мої витрати"].map(q).join(","));
    R.months.forEach((m,i)=>L.push([q(`${year}-${String(i+1).padStart(2,"0")}`),f(m.paid),f(m.receipts),f(m.own)].join(",")));
    L.push("",["Мої витрати (категорія)","Сума"].map(q).join(","));
    for(const c of R.ownCats)L.push([q(c.c),f(c.sum)].join(","));
    L.push("",["Тип робіт (праця за естімейтами)","Сума"].map(q).join(","));
    for(const [k,v] of R.typeRows)L.push([q(k),f(v)].join(","));
    L.push("",[q("Дохід (отримано)"),f(R.income)].join(","),[q("− чеки клієнтів"),f(R.reimb)].join(","),[q("− мої витрати"),f(R.ownT)].join(","),[q("Чистий заробіток"),f(R.net)].join(","));
    const blob=new Blob(["﻿"+L.join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`Річний звіт ${year}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }

  const maxM=Math.max(1,...R.months.map(m=>m.paid));
  return <>
    <div className="screenbar noPrint"><button onClick={onClose}>← Список</button><b>📊 Річний звіт</b><span/></div>
    <section className="panel">
      <label>Рік<select value={year} onChange={e=>setYear(e.target.value)}>{years.map(y=><option key={y}>{y}</option>)}</select></label>
      <p className="muted" style={{fontSize:13}}>Рахується з Оплат: оплати клієнтів і чеки — за датою; «Мої витрати» — окремо. Податок не рахується (уточнити в бухгалтера).</p>
    </section>
    <section className="total">
      <div><span>Отримано від клієнтів</span><span>{money(R.income)}</span></div>
      <div><span>− чеки на матеріали клієнтів</span><span>−{money(R.reimb)}</span></div>
      <div><span>= Заробіток з робіт</span><b>{money(R.earned)}</b></div>
      <div><span>− мої витрати (інструменти, матеріали)</span><span>−{money(R.ownT)}</span></div>
      <div className="grand"><span>Чистий заробіток {year}</span><b>{money(R.net)}</b></div>
    </section>
    <section className="panel"><h2 style={{marginTop:0}}>По місяцях</h2>
      {R.months.map((m,i)=>(m.paid||m.receipts||m.own)?<div key={i} style={{display:"grid",gridTemplateColumns:"40px 1fr 90px",gap:8,alignItems:"center",marginTop:6,fontSize:14}}>
        <span>{MONTHS[i]}</span>
        <div style={{background:"#eef2f7",borderRadius:6,height:14}}><div style={{width:`${m.paid/maxM*100}%`,background:"#2f6df6",height:14,borderRadius:6}}/></div>
        <b style={{textAlign:"right"}}>{money(m.paid)}</b>
        <span/><small className="muted" style={{gridColumn:"2/4"}}>чеки клієнтів {money(m.receipts)} · мої витрати {money(m.own)}</small>
      </div>:null)}
      {!R.months.some(m=>m.paid||m.receipts||m.own)&&<p className="empty">За {year} ще нічого.</p>}
    </section>
    <section className="panel"><h2 style={{marginTop:0}}>По клієнтах</h2>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
        <thead><tr style={{borderBottom:"1px solid #d0d5dd"}}><th style={{...th,textAlign:"left"}}>Клієнт</th><th style={th}>Отримано</th><th style={th}>Чеки</th><th style={th}>Заробіток</th><th style={th}>Залишок</th></tr></thead>
        <tbody>{R.rows.map(x=><tr key={x.s.id} style={{borderBottom:"1px solid #f2f4f7"}}>
          <td style={{padding:6}}><b>{x.s.client||"Без імені"}</b>{x.s.project&&<small className="muted" style={{display:"block"}}>{x.s.project}</small>}</td>
          <td style={th}>{money(x.paid)}</td><td style={th}>{money(x.receipts)}</td><td style={{...th,fontWeight:700}}>{money(x.earned)}</td><td style={{...th,color:x.balance>0.01?"#b42318":"#667085"}}>{money(x.balance)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    {R.typeRows.length>0&&<section className="panel"><h2 style={{marginTop:0}}>По типах робіт</h2><small className="muted">праця за естімейтами клієнтів цього року</small>
      {R.typeRows.map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f2f4f7",fontSize:14}}><span>{k}</span><b>{money(v)}</b></div>)}
    </section>}
    <section className="panel"><h2 style={{marginTop:0}}>🧰 Мої витрати</h2>
      {R.ownCats.map(c=><div key={c.c} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f2f4f7",fontSize:14}}><span>{c.c}</span><b>{money(c.sum)}</b></div>)}
    </section>
    <div className="actions noPrint"><button className="primary" onClick={csv}>⬇ CSV для бухгалтера / QuickBooks</button></div>
  </>;
}
