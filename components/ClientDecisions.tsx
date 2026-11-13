"use client";
import {useState} from "react";
import type {Statement,Decision} from "@/lib/statement";

// 📝 Рішення клієнта: питання → остання відповідь → дата. Щоб не шукати в переписці, що клієнт вирішив востаннє.
const today=()=>new Date().toLocaleDateString("sv-SE");
const fmt=(s:string)=>s?new Date(s+"T12:00:00").toLocaleDateString("uk-UA",{day:"numeric",month:"short"}):"";
export default function ClientDecisions({st,onPatch}:{st:Statement;onPatch:(p:Partial<Statement>)=>void}){
  const list=st.decisions||[];
  const [edit,setEdit]=useState<Decision|null>(null);
  const [showOld,setShowOld]=useState("");
  const open=list.filter(d=>!d.answer.trim()).length;
  const save=(d:Decision)=>{
    const prev=list.find(x=>x.id===d.id);
    // стару відповідь не губимо — вона йде в історію
    const history=prev&&prev.answer.trim()&&prev.answer.trim()!==d.answer.trim()?[...(prev.history||[]),{answer:prev.answer,date:prev.date}]:(prev?.history||d.history);
    const next={...d,question:d.question.trim(),answer:d.answer.trim(),date:d.answer.trim()?(prev&&prev.answer.trim()===d.answer.trim()?prev.date:today()):"",history};
    onPatch({decisions:prev?list.map(x=>x.id===d.id?next:x):[...list,next]});setEdit(null);
  };
  return <section className="panel">
    <div className="head" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
      <h2 style={{margin:0}}>📝 Рішення клієнта{list.length?` · ${list.length}`:""}{open?<small style={{color:"#b54708",fontWeight:600}}> · чекаємо {open}</small>:null}</h2>
      <button className="add" onClick={()=>setEdit({id:crypto.randomUUID(),question:"",answer:"",date:""})}>＋ Питання</button>
    </div>
    {!list.length&&!edit&&<p className="muted" style={{marginTop:6}}>Записуй сюди, що клієнт вирішив: колір, плитка, де світильники. Якщо передумає — стара відповідь лишиться в історії.</p>}
    {edit&&<div style={{marginTop:10,padding:12,borderRadius:12,border:"2px solid #2563eb",display:"grid",gap:8}}>
      <label>Питання<input value={edit.question} onChange={e=>setEdit({...edit,question:e.target.value})} placeholder="Колір стіни з каміном"/></label>
      <label>Що вирішив клієнт (порожньо — ще чекаємо)<textarea rows={2} value={edit.answer} onChange={e=>setEdit({...edit,answer:e.target.value})} placeholder="Зелений, код дасть у четвер"/></label>
      <div className="actions">
        <button className="primary" disabled={!edit.question.trim()} onClick={()=>save(edit)}>Зберегти</button>
        {list.some(x=>x.id===edit.id)&&<button className="secondary" style={{color:"#b42318"}} onClick={()=>{if(confirm("Видалити це питання?")){onPatch({decisions:list.filter(x=>x.id!==edit.id)});setEdit(null)}}}>Видалити</button>}
        <button className="secondary" onClick={()=>setEdit(null)}>Скасувати</button>
      </div>
    </div>}
    {list.map(d=><div key={d.id} style={{padding:"10px 0",borderTop:"1px solid #f2f4f7"}}>
      <button onClick={()=>setEdit(d)} style={{all:"unset",display:"block",width:"100%",cursor:"pointer"}}>
        <b style={{display:"block"}}>{d.question}</b>
        {d.answer?<span style={{display:"block",color:"#101828"}}>{d.answer} <small className="muted">· {fmt(d.date)}</small></span>
          :<span style={{display:"block",color:"#b54708",fontWeight:600}}>⏳ чекаємо відповідь</span>}
      </button>
      {(d.history||[]).length>0&&<button onClick={()=>setShowOld(showOld===d.id?"":d.id)} style={{border:"none",background:"none",padding:0,color:"#667085",fontSize:13}}>змінювала {d.history!.length} раз(и) {showOld===d.id?"▾":"▸"}</button>}
      {showOld===d.id&&(d.history||[]).slice().reverse().map((h,i)=><div key={i} style={{fontSize:13,color:"#667085",textDecoration:"line-through"}}>{h.answer} · {fmt(h.date)}</div>)}
    </div>)}
  </section>;
}
