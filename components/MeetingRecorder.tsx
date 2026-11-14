"use client";
import {useEffect,useRef,useState} from "react";
import {smsHref,type Client} from "@/lib/clients";
import {fmtDur,type Meeting} from "@/lib/meeting";
import {ownerFirst} from "@/lib/company";

// 🎙 Запис зустрічі з клієнтом на об'єкті.
// Запис іде шматками по ~2.5 хв: кожен шматок одразу розпізнається, тож довга розмова не впирається в ліміт розміру файлу.
// Після «Стоп» з усього тексту AI робить підсумок, обсяг робіт, питання, завдання і повідомлення клієнту.
const SEG=150; // секунд на шматок
const pickMime=()=>{const c=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg;codecs=opus"];
  try{return c.find(t=>(window as any).MediaRecorder?.isTypeSupported?.(t))||""}catch{return ""}};
const extOf=(m:string)=>/mp4|aac|m4a/.test(m)?"m4a":/ogg/.test(m)?"ogg":"webm";
const uiLang=()=>{try{return JSON.parse(localStorage.getItem("qc_ui")||"{}").lang==="en"?"en":"uk"}catch{return "uk"}};
const fmtDate=(s:string)=>new Date(s).toLocaleDateString("uk-UA",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});

export default function MeetingRecorder({client,onSave,onEstimate}:{client:Client;onSave:(c:Client)=>void;onEstimate:(m:Meeting)=>void}){
  const list=client.meetings||[];
  const [phase,setPhase]=useState<"idle"|"consent"|"rec"|"work">("idle");
  const [sec,setSec]=useState(0);
  const [done,setDone]=useState(0);        // скільки шматків уже розпізнано
  const [status,setStatus]=useState("");
  const [err,setErr]=useState("");
  const [openId,setOpenId]=useState("");
  const [copied,setCopied]=useState("");
  const streamRef=useRef<MediaStream|null>(null);
  const recRef=useRef<MediaRecorder|null>(null);
  const segTimer=useRef<ReturnType<typeof setInterval>|null>(null);
  const tick=useRef<ReturnType<typeof setInterval>|null>(null);
  const texts=useRef<string[]>([]);
  const pending=useRef<Promise<void>[]>([]);
  const idx=useRef(0);
  const started=useRef(0);
  const wake=useRef<any>(null);
  const clientRef=useRef(client);clientRef.current=client;
  const mime=useRef("");

  const cleanup=()=>{
    if(segTimer.current)clearInterval(segTimer.current);if(tick.current)clearInterval(tick.current);segTimer.current=tick.current=null;
    try{streamRef.current?.getTracks().forEach(t=>t.stop())}catch{}
    streamRef.current=null;recRef.current=null;
    try{wake.current?.release?.()}catch{}wake.current=null;
  };
  useEffect(()=>()=>cleanup(),[]); // закрили картку під час запису — мікрофон вимикаємо

  async function upload(blob:Blob,i:number){
    if(blob.size<1500){texts.current[i]="";setDone(d=>d+1);return}
    for(let attempt=0;attempt<2;attempt++){
      try{
        const f=new FormData();f.append("audio",new File([blob],`meeting-${i}.${extOf(blob.type||mime.current)}`,{type:blob.type||mime.current||"audio/webm"}));
        const r=await fetch("/api/transcribe?mode=meeting",{method:"POST",body:f});const d=await r.json();
        if(!r.ok)throw new Error(d?.error||"transcribe error");
        texts.current[i]=String(d.text||"").trim();setDone(x=>x+1);return;
      }catch(e){if(attempt===1){texts.current[i]="";setErr(`Один фрагмент не розпізнався: ${e instanceof Error?e.message:e}`);setDone(x=>x+1)}}
    }
  }
  function startSegment(){
    const stream=streamRef.current;if(!stream)return;
    const i=idx.current++;const chunks:Blob[]=[];
    const rec=new MediaRecorder(stream,{...(mime.current?{mimeType:mime.current}:{}),audioBitsPerSecond:32000});
    rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
    rec.onstop=()=>{pending.current.push(upload(new Blob(chunks,{type:rec.mimeType||mime.current}),i))};
    rec.start();recRef.current=rec;
  }
  async function start(){
    setErr("");setStatus("");
    if(!navigator.mediaDevices?.getUserMedia||!(window as any).MediaRecorder){setErr("Цей браузер не вміє записувати звук. Відкрий програму в Safari або Chrome.");setPhase("idle");return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:true,autoGainControl:true} as MediaTrackConstraints});
      streamRef.current=stream;mime.current=pickMime();texts.current=[];pending.current=[];idx.current=0;setDone(0);setSec(0);started.current=Date.now();
      startSegment();
      segTimer.current=setInterval(()=>{const old=recRef.current;startSegment();try{old?.stop()}catch{}},SEG*1000);
      tick.current=setInterval(()=>setSec(Math.round((Date.now()-started.current)/1000)),1000);
      try{wake.current=await (navigator as any).wakeLock?.request?.("screen")}catch{}
      setPhase("rec");
    }catch(e){cleanup();setPhase("idle");setErr("Немає доступу до мікрофона. Дозволь його для цього сайту в налаштуваннях браузера.")}
  }
  function cancel(){
    const r=recRef.current;if(r){r.onstop=null;try{r.stop()}catch{}}
    cleanup();setPhase("idle");setSec(0);setStatus("Запис скасовано, нічого не збережено.");
  }
  async function stop(){
    const dur=Math.round((Date.now()-started.current)/1000);
    setPhase("work");setStatus("Дорозпізнаю останній фрагмент…");
    const r=recRef.current;
    await new Promise<void>(res=>{if(!r||r.state==="inactive")return res();const prev=r.onstop;r.onstop=ev=>{try{(prev as any)?.call(r,ev)}catch{}res()};try{r.stop()}catch{res()}});
    cleanup();
    await Promise.all(pending.current);
    const transcript=texts.current.filter(Boolean).join(" ").replace(/\s+/g," ").trim();
    if(transcript.length<40){setPhase("idle");setErr("У записі майже немає мови — нема з чого робити підсумок. Нічого не збережено.");setStatus("");return}
    setStatus("AI робить підсумок розмови…");
    const c=clientRef.current;
    const base:Meeting={id:crypto.randomUUID(),date:new Date().toISOString(),durationSec:dur,title:"Зустріч",summary:"",scope:[],questions:[],tasks:[],followup:"",when:"",estimatePrompt:"",transcript};
    let m=base;
    try{
      const res=await fetch("/api/meeting",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript,client:c.name,contractor:ownerFirst(),lang:uiLang(),today:new Date().toLocaleDateString("sv-SE")})});
      const d=await res.json();if(!res.ok)throw new Error(d?.error||"AI error");
      m={...base,title:String(d.title||"Зустріч"),summary:String(d.summary||""),scope:Array.isArray(d.scope)?d.scope.map(String):[],questions:Array.isArray(d.questions)?d.questions.map(String):[],tasks:Array.isArray(d.tasks)?d.tasks.map(String):[],followup:String(d.followup||""),when:String(d.when||""),estimatePrompt:String(d.estimate_prompt||"")};
      setStatus("");
    }catch(e){setErr(`Підсумок зробити не вдалося (${e instanceof Error?e.message:e}). Текст розмови збережено — підсумок можна зробити ще раз.`);setStatus("")}
    // текст розмови зберігаємо в будь-якому разі — щоб запис не пропав
    onSave({...clientRef.current,meetings:[m,...(clientRef.current.meetings||[])],updatedAt:new Date().toISOString()});
    setOpenId(m.id);setPhase("idle");
  }
  async function redo(m:Meeting){
    setErr("");setStatus("AI робить підсумок розмови…");
    try{
      const res=await fetch("/api/meeting",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:m.transcript,client:client.name,contractor:ownerFirst(),lang:uiLang(),today:String(m.date).slice(0,10)})});
      const d=await res.json();if(!res.ok)throw new Error(d?.error||"AI error");
      const n:Meeting={...m,title:String(d.title||m.title),summary:String(d.summary||""),scope:(d.scope||[]).map(String),questions:(d.questions||[]).map(String),tasks:(d.tasks||[]).map(String),followup:String(d.followup||""),when:String(d.when||""),estimatePrompt:String(d.estimate_prompt||"")};
      onSave({...client,meetings:list.map(x=>x.id===m.id?n:x),updatedAt:new Date().toISOString()});setStatus("");
    }catch(e){setErr(`Не вдалося: ${e instanceof Error?e.message:e}`);setStatus("")}
  }
  const copy=async(id:string,t:string)=>{try{await navigator.clipboard.writeText(t);setCopied(id);setTimeout(()=>setCopied(""),1800)}catch{}};
  const Block=({title,items}:{title:string;items:string[]})=>items.length?<div style={{marginTop:10}}><b>{title}</b><ul style={{margin:"4px 0 0",paddingLeft:20}}>{items.map((x,i)=><li key={i} style={{marginTop:2}}>{x}</li>)}</ul></div>:null;

  return <section className="panel">
    <div className="head"><h2>🎙 Зустрічі з клієнтом{list.length?` · ${list.length}`:""}</h2>
      {phase==="idle"&&<button className="add" onClick={()=>{setErr("");setStatus("");setPhase("consent")}}>＋ Записати зустріч</button>}</div>
    {phase==="idle"&&!list.length&&<p className="muted" style={{fontSize:14}}>Увімкни запис на початку огляду. Після зустрічі програма дасть підсумок, список робіт, питання до клієнта, завдання і готове повідомлення клієнту.</p>}

    {phase==="consent"&&<div style={{marginTop:8,padding:12,borderRadius:12,border:"2px solid #2563eb",display:"grid",gap:8}}>
      <b>Перед записом</b>
      <small>Попередь клієнта, що записуєш розмову, і отримай згоду — наприклад: «I'd like to record our conversation so I don't miss anything. Is that okay?» В Іллінойсі для запису потрібна згода всіх учасників розмови.</small>
      <small>Під час запису не блокуй екран і не згортай програму — інакше телефон зупинить мікрофон.</small>
      <div className="actions"><button className="primary" onClick={()=>void start()}>Клієнт згоден — почати запис</button><button className="secondary" onClick={()=>setPhase("idle")}>Скасувати</button></div>
    </div>}

    {phase==="rec"&&<div style={{marginTop:8,padding:14,borderRadius:12,background:"#fef3f2",border:"1px solid #fda29b",textAlign:"center"}}>
      <div style={{fontSize:13,color:"#b42318",fontWeight:700}}>● ЙДЕ ЗАПИС</div>
      <div style={{fontSize:40,fontWeight:800,letterSpacing:"-.02em",fontVariantNumeric:"tabular-nums"}}>{fmtDur(sec)}</div>
      <small className="muted">{done>0?`розпізнано фрагментів: ${done}`:"не блокуй екран і не згортай програму"}</small>
      <div className="actions" style={{marginTop:10}}><button className="primary" onClick={()=>void stop()}>■ Стоп — зробити підсумок</button><button className="secondary" onClick={()=>{if(confirm("Скасувати запис? Нічого не збережеться."))cancel()}}>Скасувати</button></div>
    </div>}

    {phase==="work"&&<div style={{marginTop:8,padding:14,borderRadius:12,background:"#eff8ff",border:"1px solid #b2ddff",fontWeight:600}}>{status||"Обробляю…"} Не закривай програму.</div>}
    {phase!=="work"&&status&&<p className="muted" style={{marginTop:8}}>{status}</p>}
    {err&&<div style={{marginTop:8,padding:"10px 12px",borderRadius:12,background:"#fffaeb",border:"1px solid #fec84b",color:"#93370d",fontWeight:600,fontSize:14}}>{err}</div>}

    {list.map(m=>{const on=openId===m.id;return <div key={m.id} style={{borderTop:"1px solid #f2f4f7",padding:"10px 0"}}>
      <button onClick={()=>setOpenId(on?"":m.id)} style={{all:"unset",display:"flex",justifyContent:"space-between",gap:10,width:"100%",cursor:"pointer"}}>
        <span style={{minWidth:0}}><b style={{display:"block"}}>{m.title||"Зустріч"}</b><small className="muted">{fmtDate(m.date)} · {fmtDur(m.durationSec)}{m.scope.length?` · робіт: ${m.scope.length}`:""}{m.questions.length?` · питань: ${m.questions.length}`:""}</small></span>
        <span style={{flex:"none",color:"#2563eb",fontWeight:600}}>{on?"сховати":"відкрити"}</span>
      </button>
      {on&&<div style={{marginTop:8}}>
        {m.summary?<p style={{margin:0}}>{m.summary}</p>:<p className="muted" style={{margin:0}}>Підсумку ще немає — є тільки текст розмови.</p>}
        {m.when&&<p style={{margin:"8px 0 0"}}><b>Дати:</b> {m.when}</p>}
        <Block title="Обсяг робіт" items={m.scope}/>
        <Block title="Питання до клієнта" items={m.questions}/>
        <Block title="Що зробити мені" items={m.tasks}/>
        {m.followup&&<div style={{marginTop:10}}><b>Повідомлення клієнту</b>
          <div style={{marginTop:4,padding:10,borderRadius:10,background:"#f9fafb",border:"1px solid #eaecf0",whiteSpace:"pre-wrap"}}>{m.followup}</div>
          <div className="actions" style={{marginTop:6}}><button className="secondary" onClick={()=>void copy("f"+m.id,m.followup)}>{copied==="f"+m.id?"✓ Скопійовано":"Скопіювати"}</button>
            {client.phone&&<a className="secondary" style={{textAlign:"center",textDecoration:"none",padding:12,borderRadius:13,fontWeight:800}} href={smsHref(client.phone,m.followup)}>💬 Відкрити в SMS</a>}</div>
          <small className="muted">Програма нічого не відправляє сама — перечитай текст і відправ сам.</small></div>}
        <div className="actions" style={{marginTop:10,flexWrap:"wrap"}}>
          {(m.estimatePrompt||m.scope.length>0)&&<button className="primary" onClick={()=>onEstimate(m)}>＋ Естімейт з цієї розмови</button>}
          <button className="secondary" disabled={!!status} onClick={()=>void redo(m)}>↻ Підсумок ще раз</button>
          <button className="secondary" style={{color:"#b42318"}} onClick={()=>{if(confirm("Видалити цю зустріч разом з текстом розмови?"))onSave({...client,meetings:list.filter(x=>x.id!==m.id),updatedAt:new Date().toISOString()})}}>Видалити</button>
        </div>
        <details style={{marginTop:10}}><summary style={{fontSize:13,color:"#667085"}}>Текст розмови ({Math.round(m.transcript.length/1000)} тис. знаків)</summary>
          <div style={{marginTop:6,fontSize:13,color:"#475467",whiteSpace:"pre-wrap",maxHeight:320,overflow:"auto"}}>{m.transcript}</div>
          <button className="secondary" style={{marginTop:6}} onClick={()=>void copy("t"+m.id,m.transcript)}>{copied==="t"+m.id?"✓ Скопійовано":"Скопіювати текст"}</button>
        </details>
      </div>}
    </div>})}
  </section>;
}
