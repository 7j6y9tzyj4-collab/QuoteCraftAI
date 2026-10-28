"use client";
import {useRef,useState} from "react";
import type {Statement} from "@/lib/statement";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
export type VoiceAction={type:"hours"|"payment"|"receipt";project_id:string;date:string;hours:number;worker:string;amount:number;method:string;store:string;items:string;note:string;confidence:number;on?:boolean};

// Оплати → «🎤 Голосом»: години, оплати й чеки без фото — сказав (або написав) → перевірив → «Записати».
export default function VoiceLog({list,onApply}:{list:Statement[];onApply:(acts:VoiceAction[])=>string}){
  const [text,setText]=useState("");
  const [rec,setRec]=useState(false);
  const [busy,setBusy]=useState("");
  const [acts,setActs]=useState<VoiceAction[]|null>(null);
  const [msg,setMsg]=useState("");
  const mr=useRef<MediaRecorder|null>(null);const chunks=useRef<Blob[]>([]);
  const projects=list.filter(s=>!s.own).map(s=>({id:s.id,label:`${s.client||"Без імені"} — ${s.project||""}`,crew:(s.crew||[]).map(c=>c.name)}));
  async function start(){
    setMsg("");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/aac"].find(t=>typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported?.(t))||"";
      const r=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
      mr.current=r;chunks.current=[];
      r.ondataavailable=e=>{if(e.data?.size)chunks.current.push(e.data)};
      r.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());setRec(false);
        const blob=new Blob(chunks.current,{type:r.mimeType||"audio/mp4"});
        if(blob.size<800){setMsg("Запис надто короткий.");return}
        setBusy("Розпізнаю…");
        try{
          const f=new FormData();f.append("audio",blob,`voice.${(r.mimeType||"").includes("webm")?"webm":"mp4"}`);
          const res=await fetch("/api/transcribe",{method:"POST",body:f});const j=await res.json();
          if(!res.ok)throw new Error(j?.error||"Не вдалося розпізнати");
          const t=String(j.text||"").trim();setText(t);if(t)await parse(t);
        }catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("")}
      };
      r.start();setRec(true);
    }catch{setMsg("Немає доступу до мікрофона. Можна написати текстом.")}
  }
  async function parse(t=text){
    if(!t.trim())return;
    setBusy("Розбираю…");setMsg("");
    try{
      const d=new Date();const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const res=await fetch("/api/voice-log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:t,today,projects})});
      const j=await res.json();if(!res.ok)throw new Error(j?.error||"AI error");
      const a=(j.actions||[]).filter((x:VoiceAction)=>x.type==="hours"?x.hours>0:x.amount!==0).map((x:VoiceAction)=>({...x,on:true}));
      if(!a.length){setMsg("Не знайшов, що записати. Скажи, наприклад: «Uzma камін, 8 годин сьогодні».");setActs(null)}else setActs(a);
    }catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("")}
  }
  const patch=(i:number,p:Partial<VoiceAction>)=>setActs(a=>a&&a.map((x,k)=>k===i?{...x,...p}:x));
  const label=(id:string)=>projects.find(p=>p.id===id)?.label||"?";
  return <div style={{marginTop:12,padding:12,borderRadius:16,background:"#f5f8ff",border:"1px solid #c7d7fe"}}>
    <b>🎤 Записати голосом</b>
    <small className="muted" style={{display:"block",margin:"2px 0 8px"}}>«Uzma камін 8 годин сьогодні» · «чек Menards 63 долари на камін» · «Kalin заплатив 2200 зелле»</small>
    <div style={{display:"flex",gap:6}}>
      <button className={rec?"primary":"secondary"} style={{flex:"none",minWidth:96,background:rec?"#d92d20":undefined}} disabled={!!busy} onClick={()=>rec?mr.current?.stop():start()}>{rec?"⏹ Стоп":"🎤 Говорити"}</button>
      <input value={text} onChange={e=>setText(e.target.value)} placeholder="або напиши тут" onKeyDown={e=>{if(e.key==="Enter")void parse()}} style={{flex:1}}/>
      <button className="secondary" style={{flex:"none"}} disabled={!!busy||!text.trim()} onClick={()=>parse()}>→</button>
    </div>
    {busy&&<small className="muted">{busy}</small>}
    {msg&&<p className="muted" style={{fontSize:13,margin:"6px 0 0"}}>{msg}</p>}
    {acts&&<div style={{marginTop:8,display:"grid",gap:6}}>
      {acts.map((a,i)=><label key={i} style={{display:"grid",gridTemplateColumns:"24px 1fr",gap:8,padding:8,borderRadius:10,background:"#fff",border:`1px solid ${a.confidence<0.6?"#f79009":"#e4e7ec"}`,opacity:a.on?1:.5}}>
        <input type="checkbox" checked={!!a.on} onChange={e=>patch(i,{on:e.target.checked})} style={{width:"auto"}}/>
        <span style={{display:"grid",gap:4}}>
          <span style={{fontSize:14}}>{a.type==="hours"?`⏱ ${a.hours} год · ${a.worker||"Я"}`:a.type==="payment"?`💵 Оплата ${money(a.amount)} · ${a.method||"Zelle"}`:`🧾 Чек ${a.store||""} ${money(a.amount)}${a.items?` · ${a.items}`:""}`} · {a.date}{a.confidence<0.6?" · ⚠️ перевір проєкт":""}</span>
          <select value={a.project_id} onChange={e=>patch(i,{project_id:e.target.value,confidence:1})}>{projects.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </span>
      </label>)}
      <div className="actions"><button className="primary" disabled={!acts.some(a=>a.on)} onClick={()=>{const m=onApply(acts.filter(a=>a.on));setActs(null);setText("");setMsg(m)}}>✓ Записати ({acts.filter(a=>a.on).length})</button><button className="secondary" onClick={()=>setActs(null)}>Скасувати</button></div>
    </div>}
  </div>;
}
