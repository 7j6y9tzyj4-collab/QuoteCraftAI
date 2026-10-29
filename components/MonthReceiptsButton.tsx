"use client";
import {useMemo,useState} from "react";
import type {Statement} from "@/lib/statement";
import {buildMonthZip,receiptsInMonth,monthLabel} from "@/lib/monthExport";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const ymOf=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;

// Оплати → 📦 Чеки за місяць: один ZIP на Mac (фото по папках проєктів + таблиця + PDF).
export default function MonthReceiptsButton({list}:{list:Statement[]}){
  const months=useMemo(()=>{const out:string[]=[];const d=new Date();d.setDate(15);for(let i=0;i<12;i++){out.push(ymOf(d));d.setMonth(d.getMonth()-1)}return out},[]);
  const [ym,setYm]=useState(months[0]);
  const [busy,setBusy]=useState("");
  const rows=receiptsInMonth(list,ym);
  const total=rows.reduce((a,x)=>a+(Number(x.r.amount)||0),0);
  async function go(){
    setBusy("Готую…");
    try{
      const {blob,name,count}=await buildMonthZip(list,ym,setBusy);
      const file=new File([blob],name,{type:"application/zip"});
      const nav=navigator as Navigator&{canShare?:(d:ShareData)=>boolean};
      const mobile=typeof matchMedia!=="undefined"&&matchMedia("(pointer:coarse)").matches;
      if(mobile&&nav.share&&nav.canShare?.({files:[file]}))await nav.share({files:[file],title:name});
      else{const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000)}
      setBusy(`✓ ${count} чеків — файл «${name}»`);
    }catch(e){setBusy((e as any)?.name==="AbortError"?"":"Не вдалося: "+(e instanceof Error?e.message:String(e)))}
  }
  const working=!!busy&&!busy.startsWith("✓")&&!busy.startsWith("Не вдалося");
  return <div className="estimate" style={{background:"#fdf4ff",display:"block"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
      <span><b>📦 Чеки за місяць</b><small>Фото по папках проєктів + таблиця + PDF — одним файлом на Mac</small></span>
      <span style={{textAlign:"right"}}><strong>{money(total)}</strong><small className="muted">{rows.length} чеків</small></span>
    </div>
    <div style={{display:"flex",gap:8,marginTop:8}}>
      <select value={ym} onChange={e=>{setYm(e.target.value);setBusy("")}} style={{flex:1,padding:8}}>{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select>
      <button className="primary" disabled={working||!rows.length} onClick={go} style={{padding:"8px 14px"}}>{working?"…":"⬇ Завантажити"}</button>
    </div>
    {busy&&<small className="muted" style={{display:"block",marginTop:6}}>{busy}</small>}
  </div>;
}
