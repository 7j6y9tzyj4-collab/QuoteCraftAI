"use client";
import {useEffect,useRef,useState} from "react";
import {smsHref,type Client} from "@/lib/clients";
import {fmtDur,linesToPrompt,type Meeting,type ScopeLine} from "@/lib/meeting";
import {ownerFirst} from "@/lib/company";

// 🎙 Запис зустрічі з клієнтом на об'єкті.
// Запис іде шматками по ~2.5 хв: кожен шматок одразу розпізнається, тож довга розмова не впирається в ліміт розміру файлу.
// Після «Стоп» з усього тексту AI робить підсумок, обсяг робіт, питання, завдання і повідомлення клієнту.
const SEG=150; // секунд на шматок
const pickMime=()=>{const c=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg;codecs=opus"];
  try{return c.find(t=>(window as any).MediaRecorder?.isTypeSupported?.(t))||""}catch{return ""}};
const extOf=(m:string)=>/wav/.test(m)?"wav":/mp4|aac|m4a/.test(m)?"m4a":/ogg/.test(m)?"ogg":"webm";
const uiLang=()=>{try{return JSON.parse(localStorage.getItem("qc_ui")||"{}").lang==="en"?"en":"uk"}catch{return "uk"}};
// відповідь AI → поля зустрічі (рядки обсягу з галочками; старий формат — просто список)
function fromAi(d:any):Partial<Meeting>{
  const raw=Array.isArray(d?.scope)?d.scope:[];
  const lines:ScopeLine[]=raw.filter((x:any)=>x&&typeof x==="object"&&x.item).map((x:any)=>({id:crypto.randomUUID(),room:String(x.room||""),item:String(x.item||""),qty:String(x.qty||""),category:String(x.category||""),note:String(x.note||""),verify:!!x.verify,on:true}));
  return {title:String(d?.title||"Зустріч"),summary:String(d?.summary||""),lines,scope:lines.length?lines.map(l=>`${l.item}${l.qty?` — ${l.qty}`:""}`):raw.map(String),checks:Array.isArray(d?.checks)?d.checks.map(String):[],questions:Array.isArray(d?.questions)?d.questions.map(String):[],tasks:Array.isArray(d?.tasks)?d.tasks.map(String):[],followup:String(d?.followup||""),when:String(d?.when||""),estimatePrompt:String(d?.estimate_prompt||"")};
}
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
    await finish(dur);
  }
  // з розпізнаних шматків → підсумок AI → запис у картку клієнта (спільне для запису і для файлу)
  async function finish(dur:number){
    const transcript=texts.current.filter(Boolean).join(" ").replace(/\s+/g," ").trim();
    if(transcript.length<40){setPhase("idle");setErr("У записі майже немає мови — нема з чого робити підсумок. Нічого не збережено.");setStatus("");return}
    setStatus("AI робить підсумок розмови…");
    const c=clientRef.current;
    const base:Meeting={id:crypto.randomUUID(),date:new Date().toISOString(),durationSec:dur,title:"Зустріч",summary:"",scope:[],questions:[],tasks:[],followup:"",when:"",estimatePrompt:"",transcript};
    let m=base;
    try{
      const res=await fetch("/api/meeting",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript,client:c.name,contractor:ownerFirst(),lang:uiLang(),today:new Date().toLocaleDateString("sv-SE")})});
      const d=await res.json();if(!res.ok)throw new Error(d?.error||"AI error");
      m={...base,...fromAi(d)};
      setStatus("");
    }catch(e){setErr(`Підсумок зробити не вдалося (${e instanceof Error?e.message:e}). Текст розмови збережено — підсумок можна зробити ще раз.`);setStatus("")}
    // текст розмови зберігаємо в будь-якому разі — щоб запис не пропав
    onSave({...clientRef.current,meetings:[m,...(clientRef.current.meetings||[])],updatedAt:new Date().toISOString()});
    setOpenId(m.id);setPhase("idle");
  }
  // 📁 Готовий аудіофайл (Диктофон iPhone, PLAUD тощо): розкодовуємо в браузері, ріжемо на шматки по ~2 хв (WAV 16 кГц моно) і розпізнаємо по черзі.
  async function importFile(file:File){
    setErr("");setPhase("work");setStatus("Читаю файл…");
    texts.current=[];pending.current=[];setDone(0);
    try{
      if(file.size>300*1024*1024)throw new Error("Файл завеликий (понад 300 МБ).");
      const data=await file.arrayBuffer();
      const W=window as any;const OAC=W.OfflineAudioContext||W.webkitOfflineAudioContext;const AC=W.AudioContext||W.webkitAudioContext;
      let ctx:any=null;try{ctx=new OAC(1,1,16000)}catch{ctx=null}
      if(!ctx){if(!AC)throw new Error("Цей браузер не вміє читати аудіофайли.");ctx=new AC()}
      const buf:AudioBuffer=await new Promise((res,rej)=>{try{const p=ctx.decodeAudioData(data,res,rej);if(p&&p.catch)p.catch(rej)}catch(e){rej(e)}});
      try{ctx.close?.()}catch{}
      const dur=Math.round(buf.duration);
      if(dur>3*3600)throw new Error("Запис довший за 3 години — розділи його на частини.");
      const RATE=16000,CH=120,ratio=buf.sampleRate/RATE,chans=Array.from({length:buf.numberOfChannels},(_,c)=>buf.getChannelData(c));
      const total=Math.floor(buf.length/ratio),n=Math.max(1,Math.ceil(total/(CH*RATE)));
      for(let i=0;i<n;i++){
        setStatus(`Розпізнаю запис: частина ${i+1} з ${n}…`);
        const from=i*CH*RATE,len=Math.min(CH*RATE,total-from);
        const ab=new ArrayBuffer(44+len*2),v=new DataView(ab);
        const wr=(o:number,t:string)=>{for(let k=0;k<t.length;k++)v.setUint8(o+k,t.charCodeAt(k))};
        wr(0,"RIFF");v.setUint32(4,36+len*2,true);wr(8,"WAVEfmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,RATE,true);v.setUint32(28,RATE*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);wr(36,"data");v.setUint32(40,len*2,true);
        for(let j=0;j<len;j++){
          const a=Math.floor((from+j)*ratio),b=Math.min(buf.length,Math.max(a+1,Math.floor((from+j+1)*ratio)));
          let sum=0;for(const ch of chans)for(let k=a;k<b;k++)sum+=ch[k];
          const x=Math.max(-1,Math.min(1,sum/((b-a)*chans.length||1)));
          v.setInt16(44+j*2,x<0?x*0x8000:x*0x7fff,true);
        }
        await upload(new Blob([ab],{type:"audio/wav"}),i);
      }
      await finish(dur);
    }catch(e){
      const msg=e instanceof Error?e.message:String(e||"");
      setPhase("idle");setStatus("");setErr(/decod|EncodingError|Unable/i.test(msg)||!msg?"Не вдалося прочитати цей аудіофайл. Підходять m4a, mp3, wav.":`Не вдалося обробити файл: ${msg}`);
    }
  }
  async function redo(m:Meeting){
    setErr("");setStatus("AI робить підсумок розмови…");
    try{
      const res=await fetch("/api/meeting",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript:m.transcript,client:client.name,contractor:ownerFirst(),lang:uiLang(),today:String(m.date).slice(0,10)})});
      const d=await res.json();if(!res.ok)throw new Error(d?.error||"AI error");
      const n:Meeting={...m,...fromAi(d)};
      onSave({...client,meetings:list.map(x=>x.id===m.id?n:x),updatedAt:new Date().toISOString()});setStatus("");
    }catch(e){setErr(`Не вдалося: ${e instanceof Error?e.message:e}`);setStatus("")}
  }
  const patchMeeting=(m:Meeting,p:Partial<Meeting>)=>onSave({...client,meetings:list.map(x=>x.id===m.id?{...x,...p}:x),updatedAt:new Date().toISOString()});
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
      <div style={{borderTop:"1px solid #eaecf0",paddingTop:8,display:"grid",gap:6}}>
        <small><b>Або завантаж готовий запис.</b> Запиши розмову в «Диктофон» на iPhone (він працює і з заблокованим екраном), потім у Диктофоні: «…» → «Зберегти у Файли» і вибери цей файл тут.</small>
        <label className="secondary" style={{textAlign:"center",padding:12,borderRadius:13,fontWeight:800,cursor:"pointer"}}>📁 Вибрати аудіофайл
          <input type="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.mp4,.caf" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void importFile(f)}}/></label>
      </div>
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
        {(m.checks||[]).length>0&&<div style={{marginTop:10,padding:10,borderRadius:10,background:"#fffaeb",border:"1px solid #fedf89",fontSize:14}}><b>Перевір:</b> {(m.checks||[]).join(" · ")}</div>}
        {(m.lines||[]).length>0?<div style={{marginTop:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}><b>Обсяг робіт · {m.lines!.filter(l=>l.on).length} з {m.lines!.length}</b>
            <button style={{border:"none",background:"none",color:"#2563eb",padding:0,fontSize:13}} onClick={()=>{const all=m.lines!.every(l=>l.on);patchMeeting(m,{lines:m.lines!.map(l=>({...l,on:!all}))})}}>{m.lines!.every(l=>l.on)?"зняти всі":"позначити всі"}</button></div>
          {Array.from(new Set(m.lines!.map(l=>l.room))).map(room=><div key={room} style={{marginTop:8}}>
            {room&&<div style={{fontSize:12,fontWeight:700,letterSpacing:".04em",textTransform:"uppercase",color:"#667085"}}>{room}</div>}
            {m.lines!.filter(l=>l.room===room).map(l=><label key={l.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 0",borderTop:"1px solid #f2f4f7",cursor:"pointer"}}>
              <input type="checkbox" style={{width:20,height:20,flex:"none",marginTop:2}} checked={l.on} onChange={e=>patchMeeting(m,{lines:m.lines!.map(x=>x.id===l.id?{...x,on:e.target.checked}:x)})}/>
              <span style={{minWidth:0}}><span style={{display:"block",fontWeight:600,color:l.on?"#101828":"#98a2b3"}}>{l.item}</span>
                <small style={{display:"block",color:"#667085"}}>{l.qty||"кількість не названа"}{l.verify&&<span style={{marginLeft:6,padding:"1px 6px",borderRadius:6,background:"#fef0c7",color:"#b54708",fontWeight:700}}>перевірити</span>}{l.category?` · ${l.category}`:""}</small>
                {l.note&&<small style={{display:"block",color:"#475467"}}>{l.note}</small>}</span>
            </label>)}
          </div>)}
        </div>:<Block title="Обсяг робіт" items={m.scope}/>}
        <Block title="Питання до клієнта" items={m.questions}/>
        <Block title="Що зробити мені" items={m.tasks}/>
        {m.followup&&<div style={{marginTop:10}}><b>Повідомлення клієнту</b>
          <div style={{marginTop:4,padding:10,borderRadius:10,background:"#f9fafb",border:"1px solid #eaecf0",whiteSpace:"pre-wrap"}}>{m.followup}</div>
          <div className="actions" style={{marginTop:6}}><button className="secondary" onClick={()=>void copy("f"+m.id,m.followup)}>{copied==="f"+m.id?"✓ Скопійовано":"Скопіювати"}</button>
            {client.phone&&<a className="secondary" style={{textAlign:"center",textDecoration:"none",padding:12,borderRadius:13,fontWeight:800}} href={smsHref(client.phone,m.followup)}>💬 Відкрити в SMS</a>}</div>
          <small className="muted">Програма нічого не відправляє сама — перечитай текст і відправ сам.</small></div>}
        <div className="actions" style={{marginTop:10,flexWrap:"wrap"}}>
          {(m.estimatePrompt||m.scope.length>0)&&<button className="primary" disabled={(m.lines||[]).length>0&&!m.lines!.some(l=>l.on)} onClick={()=>onEstimate({...m,estimatePrompt:linesToPrompt(m)})}>{(m.lines||[]).length?`＋ Естімейт з ${m.lines!.filter(l=>l.on).length} позначених рядків`:"＋ Естімейт з цієї розмови"}</button>}
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
