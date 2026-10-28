"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {WorkerView,WorkerProject} from "@/lib/workerView";
import {prepareJobPhoto} from "@/lib/jobPhotos";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const today=()=>new Date().toLocaleDateString("sv-SE");
const fmtL=(d:string,loc:string)=>{const x=new Date(d+"T12:00:00");return isNaN(+x)?d:x.toLocaleDateString(loc,{weekday:"short",day:"numeric",month:"short"})};
type Lang="uk"|"en";
const T={
  uk:{call:"📞 Клієнт",hoursH:"⏱ Скільки працював",other:"інше число годин",note:"що робив (необов'язково)",save:(h:string)=>`✓ Записати ${h} год`,saving:"Записую…",saved:(h:number,d:string)=>`✓ Записано ${h} год за ${d}`,
    h:"год",total:"Разом на цьому об'єкті",pending:"⏳ — ще не переглянуто",media:"📷 Чеки й фото",rec:"🧾 Фото чека",reading:"Читаю чек…",photo:"🏗 Фото роботи",sending:"Надсилаю…",
    counts:(r:number,p:number)=>`Чеків по об'єкту: ${r} · фото: ${p}. Чек фотографуй рівно, щоб було видно суму.`,sent:"✓ Надіслано: ",recNo:"чек (сума не прочиталась — Василь перевірить)",ph:"фото",
    scope:"📋 Що робимо",opts:"Опції (тільки якщо клієнт погодив): ",buy:"🛒 Що купити",buyHint:"Купив — одразу сфотографуй чек тут.",
    hours:"Годин",earned:(r:number)=>`Заробив · $${r}/год`,owed:"Ще винні",paid:"Вже виплачено: ",none:"Поки немає проєктів.",tr:"Перекладаю…",units:{each:"шт",sqft:"sq ft",linear_ft:"lin ft",hour:"год",room:"кімн."} as Record<string,string>,loc:"uk-UA"},
  en:{call:"📞 Client",hoursH:"⏱ Hours worked",other:"other number of hours",note:"what you did (optional)",save:(h:string)=>`✓ Save ${h} h`,saving:"Saving…",saved:(h:number,d:string)=>`✓ Saved ${h} h for ${d}`,
    h:"h",total:"Total on this job",pending:"⏳ — not reviewed yet",media:"📷 Receipts & photos",rec:"🧾 Receipt photo",reading:"Reading receipt…",photo:"🏗 Work photo",sending:"Sending…",
    counts:(r:number,p:number)=>`Receipts on this job: ${r} · photos: ${p}. Shoot the receipt straight so the total is readable.`,sent:"✓ Sent: ",recNo:"receipt (total not read — will be checked)",ph:"photo",
    scope:"📋 Scope of work",opts:"Options (only if the client approved): ",buy:"🛒 Shopping list",buyHint:"Bought something — take a photo of the receipt here.",
    hours:"Hours",earned:(r:number)=>`Earned · $${r}/h`,owed:"Owed to you",paid:"Already paid: ",none:"No projects yet.",tr:"Translating…",units:{each:"pcs",sqft:"sq ft",linear_ft:"lin ft",hour:"h",room:"room"} as Record<string,string>,loc:"en-US"},
};
// переклад обсягу робіт / матеріалів на українську (кеш у браузері)
const TRK="qc_w_tr_uk";
function useUk(texts:string[],on:boolean){
  const [map,setMap]=useState<Record<string,string>|null>(null);
  useEffect(()=>{let m={};try{m=JSON.parse(localStorage.getItem(TRK)||"{}")}catch{};setMap(m)},[]);
  const [busy,setBusy]=useState(false);
  const key=texts.join("\u0001");
  useEffect(()=>{
    if(!on||!map)return;
    const need=Array.from(new Set(texts.filter(t=>t&&!map[t])));
    if(!need.length)return;
    let alive=true;setBusy(true);
    (async()=>{
      const out:Record<string,string>={};
      for(let i=0;i<need.length;i+=30){
        const chunk=need.slice(i,i+30);
        try{const r=await fetch("/api/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({texts:chunk,to:"uk"})});const j=await r.json();if(r.ok&&Array.isArray(j.texts))chunk.forEach((t,k)=>out[t]=j.texts[k])}catch{}
      }
      if(!alive)return;
      setMap(m=>{const next={...(m||{}),...out};try{localStorage.setItem(TRK,JSON.stringify(next))}catch{};return next});setBusy(false);
    })();
    return()=>{alive=false};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,on,!!map]);
  return {tr:(t:string)=>on&&t&&map?(map[t]||t):t,busy:on&&busy};
}
const card:React.CSSProperties={background:"#fff",borderRadius:16,padding:16,marginTop:12,boxShadow:"0 1px 3px #0001"};

async function post(body:object){
  const r=await fetch("/api/worker",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||"Помилка");return d;
}

function Project({token,p,lang}:{token:string;p:WorkerProject;lang:Lang}){
  const L=T[lang];const fmt=(d:string)=>fmtL(d,L.loc);const unitL=(u:string)=>L.units[u]||u;
  const {tr,busy:trBusy}=useUk([...p.scope.flatMap(x=>[x.name,x.note]),...p.materials.flatMap(x=>[x.name,x.note])],lang==="uk");
  const router=useRouter();
  const [date,setDate]=useState(today());
  const [hours,setHours]=useState<number|"">("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState("");
  const [msg,setMsg]=useState("");
  const rec=useRef<HTMLInputElement>(null),ph=useRef<HTMLInputElement>(null);
  async function addHours(){
    if(!hours)return;setBusy("h");setMsg("");
    try{await post({token,sid:p.sid,action:"hours",date,hours,note});setMsg(L.saved(Number(hours),fmt(date)));setHours("");setNote("");router.refresh()}
    catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("")}
  }
  async function upload(files:FileList|null,kind:"receipt"|"photo"){
    if(!files?.length)return;setBusy(kind);setMsg("");
    const out:string[]=[];
    try{
      for(const f of Array.from(files)){
        const j=await prepareJobPhoto(f);
        const d=await post({token,sid:p.sid,action:kind,photo:j.dataUrl});
        if(kind==="receipt")out.push(d.receipt?.amount?`${d.receipt.store||"receipt"} ${money(d.receipt.amount)}`:L.recNo);
        else out.push(L.ph);
      }
      setMsg(L.sent+out.join(", "));router.refresh();
    }catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("");if(rec.current)rec.current.value="";if(ph.current)ph.current.value=""}
  }
  const big:React.CSSProperties={padding:"14px 10px",borderRadius:14,fontWeight:800,fontSize:16,border:"none"};
  return <>
    <div style={card}>
      <h2 style={{margin:0}}>{p.client}</h2>
      <p style={{margin:"4px 0 0",color:"#475467"}}>{p.project}</p>
      <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
        {p.address&&<a href={`https://maps.apple.com/?q=${encodeURIComponent(p.address)}`} target="_blank" rel="noreferrer" style={{...big,background:"#eef2f7",color:"#101828",textDecoration:"none",flex:1,textAlign:"center"}}>📍 {p.address}</a>}
        {p.phone&&<a href={`tel:${p.phone.replace(/[^\d+]/g,"")}`} style={{...big,background:"#eef2f7",color:"#101828",textDecoration:"none",flex:"none"}}>{L.call}</a>}
      </div>
    </div>

    <div style={card}>
      <h3 style={{marginTop:0}}>{L.hoursH}</h3>
      <input type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)} style={{width:"100%",padding:10,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16}}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginTop:8}}>
        {[4,6,8,9,10].map(h=><button key={h} onClick={()=>setHours(h)} style={{...big,background:hours===h?"#2563eb":"#eef2f7",color:hours===h?"#fff":"#101828"}}>{h}</button>)}
      </div>
      <input type="number" step="0.5" min="0.5" max="16" placeholder={L.other} value={hours} onChange={e=>setHours(e.target.value?Number(e.target.value):"")} style={{width:"100%",padding:10,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16,marginTop:8}}/>
      <input placeholder={L.note} value={note} onChange={e=>setNote(e.target.value)} style={{width:"100%",padding:10,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16,marginTop:8}}/>
      <button disabled={!hours||busy==="h"} onClick={addHours} style={{...big,width:"100%",marginTop:8,background:"#079455",color:"#fff",opacity:!hours?.5:1}}>{busy==="h"?L.saving:L.save(String(hours||""))}</button>
      {p.days.length>0&&<div style={{marginTop:12}}>
        {p.days.slice(0,10).map((d,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderTop:"1px solid #eaecf0",fontSize:14}}>
          <span>{fmt(d.date)}{d.note?<small style={{color:"#667085"}}> · {d.note}</small>:null}</span><b>{d.hours} {L.h}{d.pending?" ⏳":""}</b></div>)}
        <small style={{color:"#667085"}}>{L.total}: <b>{p.hours} {L.h}</b>{p.days.some(d=>d.pending)?" · "+L.pending:""}</small>
      </div>}
    </div>

    <div style={card}>
      <h3 style={{marginTop:0}}>{L.media}</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <button disabled={!!busy} onClick={()=>rec.current?.click()} style={{...big,background:"#2563eb",color:"#fff"}}>{busy==="receipt"?L.reading:L.rec}</button>
        <button disabled={!!busy} onClick={()=>ph.current?.click()} style={{...big,background:"#7a5af8",color:"#fff"}}>{busy==="photo"?L.sending:L.photo}</button>
      </div>
      <input ref={rec} type="file" accept="image/*" capture="environment" hidden onChange={e=>upload(e.target.files,"receipt")}/>
      <input ref={ph} type="file" accept="image/*" multiple hidden onChange={e=>upload(e.target.files,"photo")}/>
      <small style={{color:"#667085",display:"block",marginTop:6}}>{L.counts(p.receipts,p.photos)}</small>
    </div>
    {msg&&<div style={{...card,background:msg.startsWith("✓")?"#ecfdf3":"#fef3f2",color:msg.startsWith("✓")?"#067647":"#b42318"}}>{msg}</div>}

    {p.scope.length>0&&<details style={card}><summary style={{fontWeight:800,fontSize:16}}>{L.scope}{trBusy?` · ${L.tr}`:""}</summary>
      <ol style={{paddingLeft:20}}>{p.scope.filter(s=>!s.optional).map((s,i)=><li key={i} style={{marginTop:6}}><b>{tr(s.name)}</b>{s.qty>1||s.unit!=="each"?` — ${s.qty} ${unitL(s.unit)}`:""}{s.note&&<div style={{fontSize:13,color:"#667085"}}>{tr(s.note)}</div>}</li>)}</ol>
      {p.scope.some(s=>s.optional)&&<p style={{fontSize:13,color:"#667085"}}>{L.opts}{p.scope.filter(s=>s.optional).map(s=>tr(s.name)).join("; ")}</p>}
    </details>}
    {p.materials.length>0&&<details style={card}><summary style={{fontWeight:800,fontSize:16}}>{L.buy}{trBusy?` · ${L.tr}`:""}</summary>
      <ul style={{paddingLeft:20}}>{p.materials.map((m,i)=><li key={i} style={{marginTop:6}}>{tr(m.name)}{m.note&&<div style={{fontSize:13,color:"#667085"}}>{tr(m.note)}</div>}</li>)}</ul>
      <p style={{fontSize:13,color:"#667085"}}>{L.buyHint}</p>
    </details>}
  </>;
}

export default function WorkerPortal({token,v}:{token:string;v:WorkerView}){
  const [i,setI]=useState(0);
  const [lang,setLang]=useState<Lang>("uk");
  useEffect(()=>{try{const l=localStorage.getItem("qc_w_lang");if(l==="en"||l==="uk")setLang(l)}catch{}},[]);
  const pick=(l:Lang)=>{setLang(l);try{localStorage.setItem("qc_w_lang",l)}catch{}};
  const L=T[lang];
  const p=v.projects[i];
  return <div style={{maxWidth:560,margin:"0 auto",padding:"8px 4px 40px"}}>
    <div style={{...card,background:"#101828",color:"#fff"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><small style={{opacity:.7}}>K&V House Renovation</small><span style={{display:"flex",gap:4}}>{(["uk","en"] as Lang[]).map(l=><button key={l} onClick={()=>pick(l)} style={{padding:"4px 10px",borderRadius:999,border:"none",fontWeight:800,background:lang===l?"#fff":"#344054",color:lang===l?"#101828":"#fff"}}>{l==="uk"?"UA":"EN"}</button>)}</span></div>
      <h1 style={{margin:"2px 0 8px"}}>👷 {v.worker}</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,fontSize:13}}>
        <div><div style={{opacity:.7}}>{L.hours}</div><b style={{fontSize:20}}>{v.hours}</b></div>
        <div><div style={{opacity:.7}}>{L.earned(v.rate)}</div><b style={{fontSize:20}}>{money(v.earned)}</b></div>
        <div><div style={{opacity:.7}}>{L.owed}</div><b style={{fontSize:20,color:v.owed>0?"#fdb022":"#75e0a7"}}>{money(v.owed)}</b></div>
      </div>
      {v.paid>0&&<small style={{opacity:.7}}>{L.paid}{money(v.paid)}</small>}
    </div>
    {v.projects.length>1&&<div style={{display:"flex",gap:6,marginTop:12,flexWrap:"wrap"}}>{v.projects.map((x,k)=><button key={x.sid} onClick={()=>setI(k)} style={{padding:"8px 12px",borderRadius:999,border:"none",fontWeight:700,background:k===i?"#2563eb":"#eef2f7",color:k===i?"#fff":"#101828"}}>{x.client}</button>)}</div>}
    {p?<Project key={p.sid+lang} token={token} p={p} lang={lang}/>:<div style={card}>{L.none}</div>}
  </div>;
}
