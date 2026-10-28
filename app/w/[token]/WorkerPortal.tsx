"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {WorkerView,WorkerProject} from "@/lib/workerView";
import {prepareJobPhoto} from "@/lib/jobPhotos";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const today=()=>new Date().toLocaleDateString("sv-SE");
const fmt=(d:string)=>{const x=new Date(d+"T12:00:00");return isNaN(+x)?d:x.toLocaleDateString("uk-UA",{weekday:"short",day:"numeric",month:"short"})};
const unitL=(u:string)=>({each:"шт",sqft:"sq ft",linear_ft:"lin ft",hour:"год",room:"кімн."} as Record<string,string>)[u]||u;
const card:React.CSSProperties={background:"#fff",borderRadius:16,padding:16,marginTop:12,boxShadow:"0 1px 3px #0001"};

async function post(body:object){
  const r=await fetch("/api/worker",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||"Помилка");return d;
}

function Project({token,p}:{token:string;p:WorkerProject}){
  const router=useRouter();
  const [date,setDate]=useState(today());
  const [hours,setHours]=useState<number|"">("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState("");
  const [msg,setMsg]=useState("");
  const rec=useRef<HTMLInputElement>(null),ph=useRef<HTMLInputElement>(null);
  async function addHours(){
    if(!hours)return;setBusy("h");setMsg("");
    try{await post({token,sid:p.sid,action:"hours",date,hours,note});setMsg(`✓ Записано ${hours} год за ${fmt(date)}`);setHours("");setNote("");router.refresh()}
    catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("")}
  }
  async function upload(files:FileList|null,kind:"receipt"|"photo"){
    if(!files?.length)return;setBusy(kind);setMsg("");
    const out:string[]=[];
    try{
      for(const f of Array.from(files)){
        const j=await prepareJobPhoto(f);
        const d=await post({token,sid:p.sid,action:kind,photo:j.dataUrl});
        if(kind==="receipt")out.push(d.receipt?.amount?`${d.receipt.store||"чек"} ${money(d.receipt.amount)}`:"чек (сума не прочиталась — Василь перевірить)");
        else out.push("фото");
      }
      setMsg("✓ Надіслано: "+out.join(", "));router.refresh();
    }catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("");if(rec.current)rec.current.value="";if(ph.current)ph.current.value=""}
  }
  const big:React.CSSProperties={padding:"14px 10px",borderRadius:14,fontWeight:800,fontSize:16,border:"none"};
  return <>
    <div style={card}>
      <h2 style={{margin:0}}>{p.client}</h2>
      <p style={{margin:"4px 0 0",color:"#475467"}}>{p.project}</p>
      <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
        {p.address&&<a href={`https://maps.apple.com/?q=${encodeURIComponent(p.address)}`} target="_blank" rel="noreferrer" style={{...big,background:"#eef2f7",color:"#101828",textDecoration:"none",flex:1,textAlign:"center"}}>📍 {p.address}</a>}
        {p.phone&&<a href={`tel:${p.phone.replace(/[^\d+]/g,"")}`} style={{...big,background:"#eef2f7",color:"#101828",textDecoration:"none",flex:"none"}}>📞 Клієнт</a>}
      </div>
    </div>

    <div style={card}>
      <h3 style={{marginTop:0}}>⏱ Скільки працював</h3>
      <input type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)} style={{width:"100%",padding:10,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16}}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginTop:8}}>
        {[4,6,8,9,10].map(h=><button key={h} onClick={()=>setHours(h)} style={{...big,background:hours===h?"#2563eb":"#eef2f7",color:hours===h?"#fff":"#101828"}}>{h}</button>)}
      </div>
      <input type="number" step="0.5" min="0.5" max="16" placeholder="інше число годин" value={hours} onChange={e=>setHours(e.target.value?Number(e.target.value):"")} style={{width:"100%",padding:10,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16,marginTop:8}}/>
      <input placeholder="що робив (необов'язково)" value={note} onChange={e=>setNote(e.target.value)} style={{width:"100%",padding:10,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16,marginTop:8}}/>
      <button disabled={!hours||busy==="h"} onClick={addHours} style={{...big,width:"100%",marginTop:8,background:"#079455",color:"#fff",opacity:!hours?.5:1}}>{busy==="h"?"Записую…":`✓ Записати ${hours||""} год`}</button>
      {p.days.length>0&&<div style={{marginTop:12}}>
        {p.days.slice(0,10).map((d,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderTop:"1px solid #eaecf0",fontSize:14}}>
          <span>{fmt(d.date)}{d.note?<small style={{color:"#667085"}}> · {d.note}</small>:null}</span><b>{d.hours} год{d.pending?" ⏳":""}</b></div>)}
        <small style={{color:"#667085"}}>Разом на цьому об'єкті: <b>{p.hours} год</b>{p.days.some(d=>d.pending)?" · ⏳ — ще не переглянуто Василем":""}</small>
      </div>}
    </div>

    <div style={card}>
      <h3 style={{marginTop:0}}>📷 Чеки й фото</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <button disabled={!!busy} onClick={()=>rec.current?.click()} style={{...big,background:"#2563eb",color:"#fff"}}>{busy==="receipt"?"Читаю чек…":"🧾 Фото чека"}</button>
        <button disabled={!!busy} onClick={()=>ph.current?.click()} style={{...big,background:"#7a5af8",color:"#fff"}}>{busy==="photo"?"Надсилаю…":"🏗 Фото роботи"}</button>
      </div>
      <input ref={rec} type="file" accept="image/*" capture="environment" hidden onChange={e=>upload(e.target.files,"receipt")}/>
      <input ref={ph} type="file" accept="image/*" multiple hidden onChange={e=>upload(e.target.files,"photo")}/>
      <small style={{color:"#667085",display:"block",marginTop:6}}>Чеків по об'єкту: {p.receipts} · фото: {p.photos}. Чек фотографуй рівно, щоб було видно суму.</small>
    </div>
    {msg&&<div style={{...card,background:msg.startsWith("✓")?"#ecfdf3":"#fef3f2",color:msg.startsWith("✓")?"#067647":"#b42318"}}>{msg}</div>}

    {p.scope.length>0&&<details style={card}><summary style={{fontWeight:800,fontSize:16}}>📋 Що робимо</summary>
      <ol style={{paddingLeft:20}}>{p.scope.filter(s=>!s.optional).map((s,i)=><li key={i} style={{marginTop:6}}><b>{s.name}</b>{s.qty>1||s.unit!=="each"?` — ${s.qty} ${unitL(s.unit)}`:""}{s.note&&<div style={{fontSize:13,color:"#667085"}}>{s.note}</div>}</li>)}</ol>
      {p.scope.some(s=>s.optional)&&<p style={{fontSize:13,color:"#667085"}}>Опції (тільки якщо клієнт погодив): {p.scope.filter(s=>s.optional).map(s=>s.name).join("; ")}</p>}
      {p.notes&&<p style={{whiteSpace:"pre-wrap",fontSize:13,color:"#475467"}}>{p.notes}</p>}
    </details>}
    {p.materials.length>0&&<details style={card}><summary style={{fontWeight:800,fontSize:16}}>🛒 Що купити</summary>
      <ul style={{paddingLeft:20}}>{p.materials.map((m,i)=><li key={i} style={{marginTop:6}}>{m.name}{m.note&&<div style={{fontSize:13,color:"#667085"}}>{m.note}</div>}</li>)}</ul>
      <p style={{fontSize:13,color:"#667085"}}>Купив — одразу сфотографуй чек тут.</p>
    </details>}
  </>;
}

export default function WorkerPortal({token,v}:{token:string;v:WorkerView}){
  const [i,setI]=useState(0);
  const p=v.projects[i];
  return <div style={{maxWidth:560,margin:"0 auto",padding:"8px 4px 40px"}}>
    <div style={{...card,background:"#101828",color:"#fff"}}>
      <small style={{opacity:.7}}>K&V House Renovation</small>
      <h1 style={{margin:"2px 0 8px"}}>👷 {v.worker}</h1>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,fontSize:13}}>
        <div><div style={{opacity:.7}}>Годин</div><b style={{fontSize:20}}>{v.hours}</b></div>
        <div><div style={{opacity:.7}}>Заробив · ${v.rate}/год</div><b style={{fontSize:20}}>{money(v.earned)}</b></div>
        <div><div style={{opacity:.7}}>Ще винні</div><b style={{fontSize:20,color:v.owed>0?"#fdb022":"#75e0a7"}}>{money(v.owed)}</b></div>
      </div>
      {v.paid>0&&<small style={{opacity:.7}}>Вже виплачено: {money(v.paid)}</small>}
    </div>
    {v.projects.length>1&&<div style={{display:"flex",gap:6,marginTop:12,flexWrap:"wrap"}}>{v.projects.map((x,k)=><button key={x.sid} onClick={()=>setI(k)} style={{padding:"8px 12px",borderRadius:999,border:"none",fontWeight:700,background:k===i?"#2563eb":"#eef2f7",color:k===i?"#fff":"#101828"}}>{x.client}</button>)}</div>}
    {p?<Project key={p.sid} token={token} p={p}/>:<div style={card}>Поки немає проєктів. Василь додасть.</div>}
  </div>;
}
