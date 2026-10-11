"use client";
import {useMemo,useState} from "react";
import type {SavedCalc} from "@/lib/calcTypes";
import type {Estimate,PriceRule} from "@/lib/types";
import {historyRecords,yearStats} from "@/lib/priceHistory";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const d=(iso:string)=>new Date(iso).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});

// Історія цін: по кожній роботі — за скільки брав у кожному естімейті, середня ставка по роках.
export default function PriceHistory({saved,old,prices}:{saved:SavedCalc[];old:Estimate[];prices:PriceRule[]}){
  const recs=useMemo(()=>historyRecords(saved,old),[saved,old]);
  const names=useMemo(()=>new Map(prices.map(p=>[p.id,p.name])),[prices]);
  const tasks=useMemo(()=>{
    const m=new Map<string,{id:string;name:string;n:number}>();
    for(const r of recs){const t=m.get(r.taskId)||{id:r.taskId,name:names.get(r.taskId)||r.name,n:0};t.n++;m.set(r.taskId,t)}
    return [...m.values()].sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name));
  },[recs,names]);
  const [q,setQ]=useState("");
  const [sel,setSel]=useState("");
  const shown=tasks.filter(t=>!q.trim()||t.name.toLowerCase().includes(q.trim().toLowerCase()));
  const cur=sel||shown[0]?.id||"";
  const rows=recs.filter(r=>r.taskId===cur);
  const years=yearStats(rows);
  const price=prices.find(p=>p.id===cur);
  const unit=rows[0]?.unit||price?.unit||"";
  if(!tasks.length)return <details style={{margin:"10px 0 16px"}}><summary><b>📈 Історія цін</b></summary><p className="muted">Ще немає збережених естімейтів — історія з'явиться, коли збережеш перші («💾 Зберегти» в калькуляторі).</p></details>;
  return <details style={{margin:"10px 0 16px"}}>
    <summary><b>📈 Історія цін</b> <small className="muted">— за скільки брав кожну роботу ({recs.length} рядків з {saved.length+old.length} естімейтів)</small></summary>
    <div className="grid" style={{marginTop:10}}>
      <label>Пошук роботи<input type="search" value={q} onChange={e=>{setQ(e.target.value);setSel("")}} placeholder="плитка, tile, vanity…"/></label>
      <label>Робота<select value={cur} onChange={e=>setSel(e.target.value)}>{shown.map(t=><option key={t.id} value={t.id}>{t.name} ({t.n})</option>)}</select></label>
    </div>
    {cur&&<>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>
        {price&&<span className="badge" style={{padding:"6px 10px",background:"#eef2f7",borderRadius:10}}>Зараз у прайсі: <b>{money(price.rate)}</b>/{unit}</span>}
        {years.map(y=><span key={y.year} style={{padding:"6px 10px",background:"#f8fafc",border:"1px solid #e4e7ec",borderRadius:10,fontSize:14}}>
          {y.year}: <b>{money(y.avg)}</b>/{unit} <small className="muted">({y.count})</small>
          {y.change!==null&&<b style={{color:y.change>=0?"#067647":"#b42318"}}> {y.change>=0?"+":""}{y.change}%</b>}
        </span>)}
      </div>
      <div style={{overflowX:"auto",marginTop:10}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
          <thead><tr style={{textAlign:"left",borderBottom:"1px solid #d0d5dd"}}><th style={{padding:6}}>Дата</th><th style={{padding:6}}>Клієнт / проєкт</th><th style={{padding:6,textAlign:"right"}}>К-сть</th><th style={{padding:6,textAlign:"right"}}>Праця/{unit}</th><th style={{padding:6,textAlign:"right"}}>Сума праці</th></tr></thead>
          <tbody>{rows.map((r,i)=><tr key={i} style={{borderBottom:"1px solid #f2f4f7"}}>
            <td style={{padding:6,whiteSpace:"nowrap"}}>{d(r.date)}</td>
            <td style={{padding:6}}>{r.client||"—"}{r.project?<small className="muted"> · {r.project}</small>:null}{r.source==="old"&&<small className="muted"> · архів</small>}</td>
            <td style={{padding:6,textAlign:"right"}}>{r.qty}</td>
            <td style={{padding:6,textAlign:"right"}}><b>{money(r.rate)}</b></td>
            <td style={{padding:6,textAlign:"right"}}>{money(r.labor)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <small className="muted">Ставка — реальна праця за одиницю в тому естімейті (зі складністю й множником локації). Ставки в збережених естімейтах не міняються, коли міняєш прайс.</small>
    </>}
  </details>;
}
