"use client";
import {useState} from "react";
import type {Statement} from "@/lib/statement";
import {getCompany,companyName,ownerFirst} from "@/lib/company";

// ⭐ Прохання про відгук у Google після завершення роботи (готовий SMS клієнту).
export function reviewText(s:Statement,link:string){
  const first=String(s.client||"").trim().split(/\s+/)[0]||"there";
  const me=ownerFirst();
  return `Hi ${first}, thank you for choosing ${companyName()}! It was a pleasure working on your ${s.project||"project"}. If you're happy with the result, would you mind leaving us a quick Google review? It really helps a small business like ours:\n${link}\nThank you!${me?`\n— ${me}`:""}`;
}
export default function ReviewAsk({st,phone,done,onPatch}:{st:Statement;phone?:string;done:boolean;onPatch:(p:Partial<Statement>)=>void}){
  const link=getCompany().review;
  const [open,setOpen]=useState(false);const [msg,setMsg]=useState("");
  const [text,setText]=useState("");
  const mark=()=>onPatch({reviewAsked:new Date().toISOString().slice(0,10)});
  const start=()=>{setText(reviewText(st,link));setOpen(true);setMsg("")};
  const tel=(phone||"").replace(/[^\d+]/g,"");
  return <section className="panel" style={done&&!st.reviewAsked?{border:"2px solid #fdb022",background:"#fffcf5"}:undefined}>
    <div className="head"><h2>⭐ Відгук у Google</h2>{st.reviewAsked&&<small className="muted">попросив {new Date(st.reviewAsked+"T12:00:00").toLocaleDateString()}</small>}</div>
    {!link?<p className="muted" style={{fontSize:14}}>Додай посилання на свій відгук у Google: ⚙ Налаштування → 🏢 Профіль компанії → «⭐ Посилання на відгук у Google».</p>
    :!open?<>
      <p className="muted" style={{fontSize:14,margin:"4px 0 8px"}}>{done?"Роботу завершено — найкращий момент попросити відгук, поки клієнт задоволений.":"Коли закінчиш роботу — попроси клієнта про відгук. Відгуки приводять нових клієнтів."}</p>
      <button className={done&&!st.reviewAsked?"primary":"secondary"} onClick={start} style={{width:"100%"}}>{st.reviewAsked?"Надіслати ще раз":"⭐ Попросити відгук"}</button>
    </>:<>
      <textarea data-notr value={text} onChange={e=>setText(e.target.value)} style={{minHeight:140,fontSize:15}}/>
      <div style={{display:"grid",gridTemplateColumns:tel?"1fr 1fr 1fr":"1fr 1fr",gap:8,marginTop:8}}>
        {tel&&<a className="primary" href={`sms:${tel}&body=${encodeURIComponent(text)}`} onClick={mark} style={{textAlign:"center",padding:"12px 8px",borderRadius:13,textDecoration:"none"}}>💬 SMS</a>}
        <button className={tel?"secondary":"primary"} onClick={async()=>{try{if(navigator.share){await navigator.share({text});mark();setOpen(false)}else{await navigator.clipboard.writeText(text);mark();setMsg("Скопійовано ✓")}}catch{}}}>📤 Поділитися</button>
        <button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(text);mark();setMsg("Скопійовано ✓")}catch{setMsg("Не вдалося скопіювати")}}}>📋 Копіювати</button>
      </div>
      {msg&&<small className="muted">{msg}</small>}
    </>}
  </section>;
}
