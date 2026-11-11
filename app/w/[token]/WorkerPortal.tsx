"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {WorkerView,WorkerProject} from "@/lib/workerView";
import {prepareJobPhoto} from "@/lib/jobPhotos";
import ShopList from "@/components/ShopList";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const today=()=>new Date().toLocaleDateString("sv-SE");
const fmtL=(d:string,loc:string)=>{const x=new Date(d+"T12:00:00");return isNaN(+x)?d:x.toLocaleDateString(loc,{weekday:"short",day:"numeric",month:"short"})};
type Lang="uk"|"en";
const T={
  uk:{call:"📞 Клієнт",hoursH:"⏱ Скільки працював",other:"інше число годин",note:"що робив (необов'язково)",save:(h:string)=>`✓ Записати ${h} год`,saving:"Записую…",saved:(h:number,d:string)=>`✓ Записано ${h} год за ${d}`,
    h:"год",total:"Разом на цьому об'єкті",pending:"⏳ — ще не переглянуто",media:"📷 Чеки й фото",rec:"🧾 Фото чека",reading:"Читаю чек…",photo:"🏗 Фото роботи",sending:"Надсилаю…",
    counts:(r:number,p:number)=>`Чеків по об'єкту: ${r} · фото: ${p}. Чек фотографуй рівно, щоб було видно суму.`,sent:"✓ Надіслано: ",recNo:"чек (сума не прочиталась — Василь перевірить)",ph:"фото",
    scope:"📋 Що робимо",opts:"Опції (тільки якщо клієнт погодив): ",buy:"📦 Матеріали з естімейту",buyHint:"Купив — одразу сфотографуй чек тут.",
    hours:"Годин",earned:(r:number)=>`Заробив · $${r}/год`,owed:"Ще винні",paid:"Вже виплачено: ",none:"Поки немає проєктів.",tr:"Перекладаю…",units:{each:"шт",sqft:"sq ft",linear_ft:"lin ft",hour:"год",room:"кімн."} as Record<string,string>,loc:"uk-UA"},
  en:{call:"📞 Client",hoursH:"⏱ Hours worked",other:"other number of hours",note:"what you did (optional)",save:(h:string)=>`✓ Save ${h} h`,saving:"Saving…",saved:(h:number,d:string)=>`✓ Saved ${h} h for ${d}`,
    h:"h",total:"Total on this job",pending:"⏳ — not reviewed yet",media:"📷 Receipts & photos",rec:"🧾 Receipt photo",reading:"Reading receipt…",photo:"🏗 Work photo",sending:"Sending…",
    counts:(r:number,p:number)=>`Receipts on this job: ${r} · photos: ${p}. Shoot the receipt straight so the total is readable.`,sent:"✓ Sent: ",recNo:"receipt (total not read — will be checked)",ph:"photo",
    scope:"📋 Scope of work",opts:"Options (only if the client approved): ",buy:"📦 Materials from the estimate",buyHint:"Bought something — take a photo of the receipt here.",
    hours:"Hours",earned:(r:number)=>`Earned · $${r}/h`,owed:"Owed to you",paid:"Already paid: ",none:"No projects yet.",tr:"Translating…",units:{each:"pcs",sqft:"sq ft",linear_ft:"lin ft",hour:"h",room:"room"} as Record<string,string>,loc:"en-US"},
};
// переклад обсягу робіт / матеріалів на українську (кеш у браузері)
const TRK="qc_w_tr_uk";
function useUk(texts:string[],on:boolean,token:string){
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
        try{const r=await fetch("/api/translate",{method:"POST",headers:{"Content-Type":"application/json","x-worker-token":token},body:JSON.stringify({texts:chunk,to:"uk"})});const j=await r.json();if(r.ok&&Array.isArray(j.texts))chunk.forEach((t,k)=>out[t]=j.texts[k])}catch{}
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

function Project({token,p,lang,worker}:{token:string;p:WorkerProject;lang:Lang;worker:string}){
  const L=T[lang];const fmt=(d:string)=>fmtL(d,L.loc);const unitL=(u:string)=>L.units[u]||u;
  const {tr,busy:trBusy}=useUk([...p.scope.flatMap(x=>[x.name,x.note]),...p.materials.flatMap(x=>[x.name,x.note])],lang==="uk",token);
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
  // 🧾 чек: спочатку показуємо, що прочитала програма (і чи такий чек уже є), а додаємо тільки після «Додати»
  const [draft,setDraft]=useState<any|null>(null);const [dup,setDup]=useState("");
  async function scanReceipt(files:FileList|null){
    const f=files?.[0];if(!f)return;setBusy("receipt");setMsg("");
    try{const j=await prepareJobPhoto(f);const d=await post({token,sid:p.sid,action:"receipt_scan",photo:j.dataUrl});setDraft(d.draft);setDup(d.dup||"")}
    catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("");if(rec.current)rec.current.value=""}
  }
  async function confirmReceipt(){
    if(!draft)return;setBusy("rc");
    try{await post({token,sid:p.sid,action:"receipt_confirm",draft,dupOk:!!dup});setMsg(L.sent+`${draft.store||"чек"} ${money(Number(draft.amount)||0)}`);setDraft(null);setDup("");router.refresh()}
    catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("")}
  }
  async function cancelReceipt(){
    if(!draft)return;const pth=draft.photoPath;setDraft(null);setDup("");setMsg(lang==="en"?"Receipt not added.":"Чек не додано.");
    try{await post({token,sid:p.sid,action:"receipt_cancel",photoPath:pth})}catch{}
  }
  async function upload(files:FileList|null,kind:"receipt"|"photo"){
    if(kind==="receipt"){await scanReceipt(files);return}
    if(!files?.length)return;setBusy(kind);setMsg("");
    const out:string[]=[];
    try{
      for(const f of Array.from(files)){
        const j=await prepareJobPhoto(f);
        const d=await post({token,sid:p.sid,action:kind,photo:j.dataUrl});
        void d;out.push(L.ph);
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

    {p.scope.length>0&&<details style={card} open={p.scope.length<=6}><summary style={{fontWeight:800,fontSize:16}}>{L.scope}{trBusy?` · ${L.tr}`:""}</summary>
      <ol style={{paddingLeft:20}}>{p.scope.filter(s=>!s.optional).map((s,i)=><li key={i} style={{marginTop:6}}><b>{tr(s.name)}</b>{s.qty>1||s.unit!=="each"?` — ${s.qty} ${unitL(s.unit)}`:""}{s.note&&<div style={{fontSize:13,color:"#667085"}}>{tr(s.note)}</div>}</li>)}</ol>
      {p.scope.some(s=>s.optional)&&<p style={{fontSize:13,color:"#667085"}}>{L.opts}{p.scope.filter(s=>s.optional).map(s=>tr(s.name)).join("; ")}</p>}
    </details>}
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
        <button disabled={!!busy||!!draft} onClick={()=>rec.current?.click()} style={{...big,background:"#2563eb",color:"#fff"}}>{busy==="receipt"?L.reading:L.rec}</button>
        <button disabled={!!busy} onClick={()=>ph.current?.click()} style={{...big,background:"#7a5af8",color:"#fff"}}>{busy==="photo"?L.sending:L.photo}</button>
      </div>
      <input ref={rec} type="file" accept="image/*" capture="environment" hidden onChange={e=>upload(e.target.files,"receipt")}/>
      <input ref={ph} type="file" accept="image/*" multiple hidden onChange={e=>upload(e.target.files,"photo")}/>
      <small style={{color:"#667085",display:"block",marginTop:6}}>{L.counts(p.receipts,p.photos)}</small>
      {p.myReceipts.length>0&&<details style={{marginTop:8}}><summary style={{fontWeight:700,fontSize:15}}>{lang==="en"?`My receipts (${p.myReceipts.length}) · ${money(p.myReceipts.reduce((a,r)=>a+r.amount,0))}`:`Мої чеки (${p.myReceipts.length}) · ${money(p.myReceipts.reduce((a,r)=>a+r.amount,0))}`}</summary>
        {p.myReceipts.map((r,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"6px 0",borderTop:"1px solid #f2f4f7",fontSize:15}}>
          <span>{fmt(r.date)} · {r.store||(lang==="en"?"receipt":"чек")}<small onClick={async()=>{try{await post({token,sid:p.sid,action:"receipt_payer",id:r.id,paidBy:r.mine?"biz":"mine"});router.refresh()}catch(e){setMsg(e instanceof Error?e.message:String(e))}}} style={{display:"inline-block",marginTop:3,padding:"3px 8px",borderRadius:8,border:"1px solid "+(r.mine?"#d9d6fe":"#d0d5dd"),background:r.mine?"#f4f3ff":"#f9fafb",cursor:"pointer",color:r.mine?"#7a5af8":"#667085"}}>{r.mine?(lang==="en"?`💳 your card${r.card?` ****${r.card}`:""} — will be paid back`:`💳 твоя картка${r.card?` ****${r.card}`:""} — повернуть`):(lang==="en"?"💼 business card":"💼 бізнес-картка")}{" ⇄"}</small>{r.pending&&<small style={{display:"block",color:"#b54708"}}>{lang==="en"?"not reviewed yet":"ще не переглянуто"}</small>}</span><b>{money(r.amount)}</b></div>)}
      </details>}
      {draft&&<div style={{marginTop:10,padding:12,borderRadius:14,border:dup?"2px solid #f79009":"1px solid #d0d5dd",background:dup?"#fffaeb":"#fff"}}>
        <b style={{display:"block",marginBottom:6}}>{lang==="en"?"Check the receipt":"Перевір чек"}</b>
        {dup&&<p style={{margin:"0 0 8px",color:"#b54708",fontSize:14,fontWeight:700}}>⚠ {lang==="en"?"This receipt is already in the app:":"Цей чек уже є в програмі:"} <span style={{fontWeight:500}}>{dup}</span><br/>{lang==="en"?"Add it anyway?":"Додати все одно?"}</p>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <label style={{fontSize:13,color:"#667085"}}>{lang==="en"?"Store":"Магазин"}<input value={draft.store||""} onChange={e=>setDraft({...draft,store:e.target.value})} style={{display:"block",width:"100%",padding:10,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16,boxSizing:"border-box"}}/></label>
          <label style={{fontSize:13,color:"#667085"}}>{lang==="en"?"Total, $":"Сума, $"}<input type="number" step="0.01" value={draft.amount||""} onChange={e=>setDraft({...draft,amount:Number(e.target.value)||0})} style={{display:"block",width:"100%",padding:10,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16,boxSizing:"border-box"}}/></label>
        </div>
        <small style={{display:"block",color:"#475467",marginTop:6}}>{draft.date}{draft.items?` · ${String(draft.items).slice(0,140)}`:""}</small>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:8}}>
          {(["mine","biz"] as const).map(k=>{const on=k==="biz"?draft.paidBy==="biz":draft.paidBy!=="biz"&&!!draft.paidBy;
            return <button key={k} onClick={()=>setDraft({...draft,paidBy:k==="biz"?"biz":worker})} style={{padding:"10px 6px",borderRadius:10,border:on?"2px solid #101828":"1px solid #d0d5dd",background:on?"#101828":"#fff",color:on?"#fff":"#344054",fontWeight:700,fontSize:14}}>
              {k==="mine"?(lang==="en"?"💳 My own card":"💳 Моя картка"):(lang==="en"?"💼 Business card":"💼 Бізнес-картка")}</button>})}
        </div>
        <small style={{display:"block",color:"#667085",marginTop:4}}>{draft.card?`${lang==="en"?"Card on receipt":"Картка на чеку"}: ****${draft.card}`:(lang==="en"?"Card not read — choose who paid.":"Картку не прочитало — вибери, хто платив.")}</small>
        {!draft.amount&&<small style={{display:"block",color:"#b42318",marginTop:4}}>{lang==="en"?"Total not read — type it in.":"Суму не прочитало — впиши вручну."}</small>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10}}>
          <button disabled={busy==="rc"} onClick={cancelReceipt} style={{...big,background:"#eef2f7",color:"#344054"}}>{lang==="en"?"✕ Cancel":"✕ Скасувати"}</button>
          <button disabled={busy==="rc"||!draft.paidBy} onClick={confirmReceipt} style={{...big,background:dup?"#f79009":"#079455",color:"#fff"}}>{busy==="rc"?"…":dup?(lang==="en"?"Add anyway":"Все одно додати"):(lang==="en"?"✓ Add":"✓ Додати")}</button>
        </div>
      </div>}
    </div>
    <ShopList key={"p"+p.sid} kind="punch" hideEmpty lang={lang} authHeaders={{"x-worker-token":token}} style={card} call={async(x:any)=>{const a=x.action==="list"?"shop_list":"shop_"+x.action;return post({...x,token,sid:p.sid,action:a})}}/>
    <ShopList key={p.sid} lang={lang} authHeaders={{"x-worker-token":token}} style={card} call={async(x:any)=>{const a=x.action==="list"?"shop_list":"shop_"+x.action;return post({...x,token,sid:p.sid,action:a})}}/>
    {msg&&<div style={{...card,background:msg.startsWith("✓")?"#ecfdf3":"#fef3f2",color:msg.startsWith("✓")?"#067647":"#b42318"}}>{msg}</div>}

    {p.materials.length>0&&<details style={card}><summary style={{fontWeight:800,fontSize:16}}>{L.buy}{trBusy?` · ${L.tr}`:""}</summary>
      <ul style={{paddingLeft:20}}>{p.materials.map((m,i)=><li key={i} style={{marginTop:6}}>{tr(m.name)}{m.note&&<div style={{fontSize:13,color:"#667085"}}>{tr(m.note)}</div>}</li>)}</ul>
      <p style={{fontSize:13,color:"#667085"}}>{L.buyHint}</p>
    </details>}
  </>;
}

// 🧾 Усі мої чеки по всіх об'єктах: натиснув на чек — видно картку, фото і можна виправити, хто платив.
function MyReceipts({token,v,lang}:{token:string;v:WorkerView;lang:Lang}){
  const en=lang==="en";const router=useRouter();
  const all=v.projects.flatMap(p=>p.myReceipts.map(r=>({...r,sid:p.sid,where:`${p.client}${v.projects.filter(y=>y.client===p.client).length>1&&p.project?` — ${String(p.project).trim().slice(0,30)}`:""}`}))).sort((a,b)=>b.date.localeCompare(a.date));
  const [open,setOpen]=useState(false);const [sel,setSel]=useState("");const [busy,setBusy]=useState("");const [err,setErr]=useState("");
  const [urls,setUrls]=useState<Record<string,string>>({});
  if(!all.length)return null;
  const sum=all.reduce((a,r)=>a+r.amount,0);const mine=all.filter(r=>r.payer==="mine");const none=all.filter(r=>r.payer==="none").length;
  async function setPayer(r:typeof all[number],k:"mine"|"biz"){setBusy(r.id+k);setErr("");
    try{await post({token,sid:r.sid,action:"receipt_payer",id:r.id,paidBy:k});router.refresh()}catch(e){setErr(e instanceof Error?e.message:String(e))}finally{setBusy("")}}
  async function photo(r:typeof all[number]){setBusy(r.id+"p");setErr("");
    try{const d=await post({token,sid:r.sid,action:"receipt_photo",id:r.id});if(d.url)setUrls(u=>({...u,[r.id]:d.url}))}catch(e){setErr(e instanceof Error?e.message:String(e))}finally{setBusy("")}}
  const tag=(r:typeof all[number])=>r.payer==="mine"?{t:en?"💳 my card":"💳 моя картка",c:"#7a5af8",b:"#f4f3ff"}:r.payer==="biz"?{t:en?"💼 business card":"💼 бізнес-картка",c:"#475467",b:"#f2f4f7"}:{t:en?"⚠ who paid?":"⚠ хто платив?",c:"#b42318",b:"#fef3f2"};
  const btn=(on:boolean):React.CSSProperties=>({padding:"11px 6px",borderRadius:10,border:on?"2px solid #101828":"1px solid #d0d5dd",background:on?"#101828":"#fff",color:on?"#fff":"#344054",fontWeight:700,fontSize:14});
  return <>
    <button onClick={()=>setOpen(o=>!o)} style={{display:"block",width:"100%",textAlign:"left",border:"none",background:"#fff",borderRadius:14,padding:14,marginTop:10,boxShadow:"0 1px 3px #0001"}}>
      <small style={{display:"block",color:"#8e8e93",fontSize:13,fontWeight:500}}>🧾 {en?"My receipts":"Мої чеки"}</small>
      <b style={{display:"block",fontSize:24,fontWeight:700,marginTop:4,color:"#000"}}>{all.length} · {money(sum)}</b>
      <small style={{display:"block",color:none?"#b42318":"#8e8e93",fontSize:12,marginTop:1}}>{en?`my card: ${mine.length} · ${money(mine.reduce((a,r)=>a+r.amount,0))}`:`з моєї картки: ${mine.length} · ${money(mine.reduce((a,r)=>a+r.amount,0))}`}{none?(en?` · ⚠ ${none} without payer`:` · ⚠ ${none} без платника`):""} · {open?(en?"hide":"сховати"):(en?"tap to open":"натисни")}</small>
    </button>
    {open&&<div style={{...card,marginTop:10,padding:0}}>
      {err&&<div style={{padding:"10px 14px",color:"#b42318",fontSize:14}}>{err}</div>}
      {all.map((r,k)=>{const g=tag(r);const on=sel===r.id;return <div key={r.sid+r.id} style={{borderTop:k?"1px solid #f2f2f7":"none"}}>
        <button onClick={()=>setSel(on?"":r.id)} style={{display:"flex",width:"100%",justifyContent:"space-between",gap:10,alignItems:"center",padding:"12px 14px",border:"none",background:on?"#f9fafb":"transparent",textAlign:"left",color:"#000"}}>
          <span style={{minWidth:0}}><b style={{display:"block",fontSize:16}}>{r.store||(en?"Receipt":"Чек")}</b>
            <small style={{display:"block",color:"#8e8e93"}}>{fmtL(r.date,T[lang].loc)} · {r.where}</small>
            <small style={{display:"inline-block",marginTop:4,padding:"2px 8px",borderRadius:8,background:g.b,color:g.c,fontWeight:700}}>{g.t}</small></span>
          <b style={{flex:"none",fontSize:16}}>{money(r.amount)}</b>
        </button>
        {on&&<div style={{padding:"0 14px 14px"}}>
          <div style={{fontSize:14,color:"#475467"}}>{en?"Card on the receipt":"Картка на чеку"}: <b>{r.card?`****${r.card}`:(en?"not read":"не прочиталась")}</b></div>
          {r.items&&<div style={{fontSize:13,color:"#667085",marginTop:4}}>{r.items}</div>}
          {r.pending&&<div style={{fontSize:13,color:"#b54708",marginTop:4}}>{en?"Not reviewed by the owner yet":"Власник ще не переглянув"}</div>}
          {r.photo&&(urls[r.id]?<a href={urls[r.id]} target="_blank" rel="noreferrer"><img src={urls[r.id]} alt="" style={{display:"block",width:"100%",maxHeight:360,objectFit:"contain",borderRadius:10,marginTop:8,background:"#f2f4f7"}}/></a>
            :<button disabled={busy===r.id+"p"} onClick={()=>photo(r)} style={{marginTop:8,border:"none",borderRadius:10,background:"rgba(47,109,246,.1)",color:"#2f6df6",fontWeight:600,fontSize:14,padding:"8px 12px"}}>{busy===r.id+"p"?"…":(en?"🖼 Show receipt photo":"🖼 Показати фото чека")}</button>)}
          <div style={{fontSize:13,color:"#667085",marginTop:10}}>{en?"Who paid for it?":"Хто за нього платив?"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:4}}>
            <button disabled={!!busy} onClick={()=>setPayer(r,"mine")} style={btn(r.payer==="mine")}>{busy===r.id+"mine"?"…":(en?"💳 My own card":"💳 Моя картка")}</button>
            <button disabled={!!busy} onClick={()=>setPayer(r,"biz")} style={btn(r.payer==="biz")}>{busy===r.id+"biz"?"…":(en?"💼 Business card":"💼 Бізнес-картка")}</button>
          </div>
          <small style={{display:"block",color:"#8e8e93",marginTop:6}}>{en?"My card — the amount is added to what you are owed. Business card — nothing is owed back.":"Моя картка — суму додадуть до того, що тобі винні. Бізнес-картка — повертати нічого не треба."}</small>
        </div>}
      </div>})}
    </div>}
  </>;
}

export default function WorkerPortal({token,v}:{token:string;v:WorkerView}){
  const [i,setI]=useState(0);
  const [lang,setLang]=useState<Lang>("uk");
  useEffect(()=>{try{const l=localStorage.getItem("qc_w_lang");if(l==="en"||l==="uk")setLang(l)}catch{}},[]);
  const pick=(l:Lang)=>{setLang(l);try{localStorage.setItem("qc_w_lang",l)}catch{}};
  const L=T[lang];
  const p=v.projects[i];
  const en=lang==="en";const hr=new Date().getHours();
  const hello=en?(hr<12?"Good morning":hr<18?"Good afternoon":"Good evening"):(hr<12?"Доброго ранку":hr<18?"Добрий день":"Добрий вечір");
  const open=(sid:string)=>{const k=v.projects.findIndex(x=>x.sid===sid);if(k>=0)setI(k);setTimeout(()=>document.getElementById("w-proj")?.scrollIntoView({behavior:"smooth",block:"start"}),50)};
  const tile:React.CSSProperties={background:"#fff",borderRadius:14,padding:14,minWidth:0,boxShadow:"0 1px 3px #0001"};
  const tl:React.CSSProperties={display:"block",color:"#8e8e93",fontSize:13,fontWeight:500};
  const tb:React.CSSProperties={display:"block",fontSize:24,fontWeight:700,marginTop:4,letterSpacing:"-.02em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"};
  const ts:React.CSSProperties={display:"block",color:"#8e8e93",fontSize:12,marginTop:1};
  const h2s:React.CSSProperties={fontSize:20,margin:"20px 8px 8px",letterSpacing:"-.01em"};
  const act:React.CSSProperties={border:"none",borderRadius:10,background:"rgba(47,109,246,.1)",color:"#2f6df6",fontWeight:600,fontSize:14,padding:"8px 12px",textDecoration:"none"};
  return <div style={{maxWidth:560,margin:"0 auto",padding:"8px 4px 40px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 8px 0"}}><small style={{color:"#8e8e93",fontWeight:600}}>{v.company}</small><span style={{display:"flex",gap:4}}>{(["uk","en"] as Lang[]).map(l=><button key={l} onClick={()=>pick(l)} style={{padding:"4px 10px",borderRadius:999,border:"none",fontWeight:800,background:lang===l?"#101828":"#e5e5ea",color:lang===l?"#fff":"#101828"}}>{l==="uk"?"UA":"EN"}</button>)}</span></div>
    <div style={{padding:"4px 8px 0"}}>
      <small style={{color:"#8e8e93",textTransform:"uppercase",fontWeight:600,fontSize:12}}>{new Date().toLocaleDateString(L.loc,{weekday:"long",day:"numeric",month:"long"})}</small>
      <h1 style={{margin:"2px 0 0",fontSize:30,letterSpacing:"-.02em"}}>{hello}, {v.worker}</h1>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10,marginTop:12}}>
      <div style={tile}><small style={tl}>{en?"This week":"Цей тиждень"}</small><b style={{...tb,color:"#079455"}}>{money(v.week.earned)}</b><small style={ts}>{v.week.hours} {L.h} × ${v.rate}</small></div>
      <div style={tile}><small style={tl}>{en?"Owed to you":"Тобі винні"}</small><b style={{...tb,color:v.owed>0.5?"#c2410c":"#079455"}}>{money(v.owed)}</b>
        <small style={ts}>{en?"work":"робота"} {money(Math.max(0,v.owed-v.reimb))}{v.reimb>0?<> + {en?"receipts":"чеки"} {money(v.reimb)}</>:null}</small></div>
      <div style={tile}><small style={tl}>{en?"All hours":"Усього годин"}</small><b style={tb}>{v.hours}</b><small style={ts}>{en?"earned":"заробив"} {money(v.earned)}</small></div>
      <div style={tile}><small style={tl}>{en?"Paid out":"Виплачено"}</small><b style={tb}>{money(v.paid)}</b><small style={ts}>{v.lastPaid?`${en?"last":"остання"}: ${money(v.lastPaid.amount)} · ${fmtL(v.lastPaid.date,L.loc)}`:(en?"no payouts yet":"виплат ще не було")}</small></div>
    </div>
    <MyReceipts token={token} v={v} lang={lang}/>
    {v.reimb>0&&<small style={{display:"block",color:"#8e8e93",padding:"6px 8px 0"}}>{en?"Receipts paid with your own card are added to what you are owed.":"Чеки, оплачені твоєю карткою, додаються до того, що тобі винні."}</small>}

    {v.today.length>0&&<><h2 style={h2s}>{en?"Today":"Сьогодні"}</h2>
      <div style={{...card,marginTop:0,padding:0}}>{v.today.map((j,k)=><div key={k} style={{padding:14,borderTop:k?"1px solid #f2f2f7":"none"}}>
        <b style={{fontSize:17}}>{j.client}</b>
        {j.title&&<div style={{fontSize:14,color:"#667085"}}>{j.title}</div>}
        {j.address&&<div style={{fontSize:14,color:"#667085",marginTop:2}}>📍 {j.address}</div>}
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
          {j.address&&<a style={act} href={`https://maps.apple.com/?daddr=${encodeURIComponent(j.address)}`} target="_blank" rel="noreferrer">🧭 {en?"Route":"Маршрут"}</a>}
          {j.sid&&<button style={act} onClick={()=>open(j.sid)}>⏱ {en?"Log hours":"Записати години"}</button>}
          {j.sid&&<button style={act} onClick={()=>open(j.sid)}>📷 {en?"Receipt":"Чек"}</button>}
        </div>
      </div>)}</div></>}
    {v.soon.length>0&&<><h2 style={h2s}>{en?"Coming up":"Найближчі роботи"}</h2>
      <div style={{...card,marginTop:0,padding:0}}>{v.soon.map((j,k)=><div key={k} style={{padding:"12px 14px",borderTop:k?"1px solid #f2f2f7":"none",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}>
        <span style={{minWidth:0}}><b>{j.client}</b>{j.title&&<div style={{fontSize:13,color:"#667085"}}>{j.title}</div>}</span>
        <span style={{flex:"none",background:"#e8f0fe",color:"#2f6df6",borderRadius:999,padding:"4px 10px",fontWeight:700,fontSize:13}}>{fmtL(j.start,L.loc)}</span>
      </div>)}</div></>}
    <h2 id="w-proj" style={h2s}>{en?"My jobs":"Мої об'єкти"}</h2>
    {v.projects.length>1&&<div style={{display:"flex",gap:6,marginTop:0,flexWrap:"wrap"}}>{v.projects.map((x,k)=><button key={x.sid} onClick={()=>setI(k)} style={{padding:"8px 12px",borderRadius:999,border:"none",fontWeight:700,background:k===i?"#2563eb":"#eef2f7",color:k===i?"#fff":"#101828",textAlign:"left",lineHeight:1.2}}>{x.client}{v.projects.filter(y=>y.client===x.client).length>1&&x.project?<small style={{display:"block",fontWeight:500,fontSize:12,opacity:.85}}>{String(x.project).trim().slice(0,28)}</small>:null}</button>)}</div>}
    {p?<Project key={p.sid+lang} token={token} p={p} lang={lang} worker={v.worker}/>:<div style={card}>{L.none}</div>}
  </div>;
}
