"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "@/lib/supabase";

// Живий перекладач UA ⇄ EN (OpenAI Realtime через WebRTC): говориш — за мить чуєш переклад в AirPods.
// Українською/російською → англійська, англійською → українська. Без кнопок під час розмови.
type Entry={id:string;src:string;out:string;en:boolean;done:boolean;item?:string;resp?:string;at:number};
const isLatin=(s:string)=>{const l=(s.match(/[A-Za-z]/g)||[]).length,c=(s.match(/[А-Яа-яІіЇїЄєҐґ]/g)||[]).length;return l>c};

export default function Translator(){
  const [state,setState]=useState<"idle"|"starting"|"live"|"error">("idle");
  const [err,setErr]=useState("");
  const [entries,setEntries]=useState<Entry[]>([]);
  const [speakEn,setSpeakEn]=useState(true);
  const [hearing,setHearing]=useState(false);
  const [big,setBig]=useState<string|null>(null);
  const [mins,setMins]=useState(0);
  const pc=useRef<RTCPeerConnection|null>(null);const dc=useRef<RTCDataChannel|null>(null);
  const audio=useRef<HTMLAudioElement|null>(null);const stream=useRef<MediaStream|null>(null);
  const lock=useRef<any>(null);const t0=useRef(0);
  const speakEnRef=useRef(true);speakEnRef.current=speakEn;
  useEffect(()=>{try{const v=localStorage.getItem("qc_tr_speak_en");if(v)setSpeakEn(v==="1")}catch{}},[]);
  useEffect(()=>{if(state!=="live")return;const i=setInterval(()=>setMins(Math.floor((Date.now()-t0.current)/60000)),15000);return()=>clearInterval(i)},[state]);
  useEffect(()=>()=>stop(),[]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd=(f:(e:Entry[])=>Entry[])=>setEntries(x=>f(x).slice(-60));
  function onEvent(ev:any){
    switch(ev.type){
      case "input_audio_buffer.speech_started":setHearing(true);upd(x=>[...x,{id:crypto.randomUUID(),src:"",out:"",en:false,done:false,item:ev.item_id,at:Date.now()}]);break;
      case "input_audio_buffer.speech_stopped":setHearing(false);break;
      case "conversation.item.input_audio_transcription.completed":upd(x=>x.map(e=>e.item===ev.item_id?{...e,src:String(ev.transcript||"").trim()}:e));break;
      case "response.created":upd(x=>{const i=[...x].reverse().find(e=>!e.resp);if(!i)return [...x,{id:crypto.randomUUID(),src:"",out:"",en:false,done:false,resp:ev.response?.id,at:Date.now()}];return x.map(e=>e.id===i.id?{...e,resp:ev.response?.id}:e)});break;
      case "response.output_audio_transcript.delta":upd(x=>x.map(e=>{
        if(e.resp!==ev.response_id)return e;
        const out=e.out+String(ev.delta||"");const en=isLatin(out);
        if(audio.current&&out.length>=2)audio.current.muted=en&&!speakEnRef.current;
        return {...e,out,en};
      }));break;
      case "response.done":if(audio.current)setTimeout(()=>{if(audio.current)audio.current.muted=false},400);upd(x=>x.map(e=>e.resp===ev.response?.id?{...e,done:true}:e));break;
      case "error":setErr(ev.error?.message||"Помилка");break;
    }
  }

  async function start(){
    setErr("");setState("starting");
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session){setState("error");setErr("Спершу увійди в QuoteCraft на цьому телефоні (головна сторінка), потім повернись сюди.");return}
      const ms=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      stream.current=ms;
      const r=await fetch("/api/realtime-session",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({})});
      const j=await r.json();if(!r.ok)throw new Error(j?.error||"Не вдалося запустити");
      const p=new RTCPeerConnection();pc.current=p;
      const a=audio.current!;
      p.ontrack=e=>{a.srcObject=e.streams[0];a.play().catch(()=>{})};
      p.addTrack(ms.getAudioTracks()[0],ms);
      const ch=p.createDataChannel("oai-events");dc.current=ch;
      ch.onmessage=m=>{try{onEvent(JSON.parse(m.data))}catch{}};
      p.onconnectionstatechange=()=>{if(p.connectionState==="failed"||p.connectionState==="disconnected"){setErr("З'єднання обірвалось. Натисни «Почати» ще раз.");stop(true)}};
      const offer=await p.createOffer();await p.setLocalDescription(offer);
      const sdp=await fetch("https://api.openai.com/v1/realtime/calls",{method:"POST",body:offer.sdp,headers:{Authorization:`Bearer ${j.key}`,"Content-Type":"application/sdp"}});
      if(!sdp.ok)throw new Error("OpenAI: "+(await sdp.text()).slice(0,200));
      await p.setRemoteDescription({type:"answer",sdp:await sdp.text()});
      try{lock.current=await (navigator as any).wakeLock?.request("screen")}catch{}
      t0.current=Date.now();setMins(0);setState("live");
    }catch(e){setErr(e instanceof Error?e.message:String(e));stop(true);setState("error")}
  }
  function stop(keepErr=false){
    try{dc.current?.close()}catch{};try{pc.current?.close()}catch{};
    stream.current?.getTracks().forEach(t=>t.stop());
    try{lock.current?.release?.()}catch{};
    pc.current=null;dc.current=null;stream.current=null;setHearing(false);
    if(!keepErr)setState("idle");
  }
  const toggleEn=()=>{const v=!speakEn;setSpeakEn(v);try{localStorage.setItem("qc_tr_speak_en",v?"1":"0")}catch{}};
  const live=state==="live";
  const shown=[...entries].reverse().filter(e=>e.out||e.src||!e.done);
  const lastEn=[...entries].reverse().find(e=>e.en&&e.out)?.out||"";

  return <main style={{minHeight:"100dvh",background:"#0b1220",color:"#fff",padding:"max(14px,env(safe-area-inset-top)) 14px 120px",fontFamily:"-apple-system,system-ui,sans-serif"}}>
    <audio ref={audio} autoPlay playsInline/>
    {big!==null&&<div onClick={()=>setBig(null)} style={{position:"fixed",inset:0,zIndex:50,background:"#fff",color:"#101828",display:"grid",placeItems:"center",padding:24,fontSize:"min(9vw,56px)",fontWeight:800,lineHeight:1.2,textAlign:"center"}}>{big||"…"}<small style={{position:"absolute",bottom:24,fontSize:14,color:"#667085"}}>натисни, щоб закрити</small></div>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><b style={{fontSize:20}}>🎧 Перекладач</b><div style={{fontSize:13,opacity:.7}}>UA ⇄ EN · говори як звичайно</div></div>
      <a href="/" style={{color:"#93c5fd",fontSize:14}}>QuoteCraft</a>
    </div>

    <div style={{marginTop:14,padding:14,borderRadius:16,background:"#111a2e"}}>
      {!live?<button onClick={start} disabled={state==="starting"} style={{width:"100%",padding:"20px 10px",borderRadius:16,border:"none",fontSize:22,fontWeight:800,background:"#16a34a",color:"#fff"}}>{state==="starting"?"Підключаю…":"▶ Почати"}</button>
        :<button onClick={()=>stop()} style={{width:"100%",padding:"20px 10px",borderRadius:16,border:"none",fontSize:22,fontWeight:800,background:"#dc2626",color:"#fff"}}>■ Зупинити</button>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,fontSize:14}}>
        <span>{live?(hearing?"🟢 Чую…":"🎙 Слухаю"):"Вимкнено"}{live?` · ${mins} хв`:""}</span>
        <button onClick={toggleEn} style={{padding:"6px 10px",borderRadius:999,border:"none",fontWeight:700,background:speakEn?"#1d4ed8":"#374151",color:"#fff"}}>{speakEn?"🔊 Мою англійську озвучувати":"🔇 Мою англійську — тільки текст"}</button>
      </div>
      {err&&<p style={{color:"#fca5a5",fontSize:14,margin:"10px 0 0"}}>{err}</p>}
    </div>

    {lastEn&&<button onClick={()=>setBig(lastEn)} style={{marginTop:10,width:"100%",padding:12,borderRadius:14,border:"none",background:"#1e293b",color:"#fff",fontWeight:700}}>📱 Показати клієнту англійською (великими)</button>}

    <div style={{marginTop:12,display:"grid",gap:10}}>
      {shown.map(e=><div key={e.id} style={{padding:12,borderRadius:14,background:e.en?"#0f2a4a":"#1f2937"}}>
        {e.src&&<div style={{fontSize:13,opacity:.65}}>{e.src}</div>}
        <div style={{fontSize:20,fontWeight:700,marginTop:e.src?4:0}}>{e.out||(e.done?"":"…")}</div>
        <div style={{fontSize:11,opacity:.5,marginTop:4}}>{e.en?"→ EN для клієнта":"→ UA для тебе"}</div>
      </div>)}
      {!shown.length&&<div style={{opacity:.7,fontSize:14,lineHeight:1.5}}>
        1. Встав AirPods. 2. «▶ Почати». 3. Говоріть по черзі звичайними фразами — після паузи ~0.5 с іде переклад.<br/>
        Клієнт говорить англійською → ти чуєш українською в AirPods. Ти говориш українською → англійський переклад (і текстом тут — можна показати клієнту).<br/>
        Порада: тримай телефон між вами — мікрофон телефона чує обох краще, ніж AirPods. Щоб клієнт чув твою англійську з динаміка, вибери вихід звуку «iPhone» у Пункті керування.
      </div>}
    </div>
  </main>;
}
