"use client";
import {useEffect,useRef,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {prepareJobPhoto} from "@/lib/jobPhotos";
import {newStatement,statementTotals,type Statement,type Receipt,type Payment,type StatementLine} from "@/lib/statement";
import {buildStatementPdf,statementFileName} from "@/lib/statementPdf";

// Розрахунок з клієнтом: робота + чеки на матеріали − оплати = залишок, PDF для клієнта.
const SK="qc_statements";
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const today=()=>new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
const uid=()=>crypto.randomUUID();
const loadLocal=():Statement[]=>{try{return JSON.parse(localStorage.getItem(SK)||"[]")}catch{return[]}};
const METHODS=["Cash","Check","Zelle","Card","Other"];

export default function PaymentsScreen({user}:{user:User|null}){
 const [list,setList]=useState<Statement[]>([]);
 const [openId,setOpenId]=useState<string|null>(null);
 const [msg,setMsg]=useState("");
 const [busy,setBusy]=useState(false);
 const cloudOk=useRef(false);
 const loaded=useRef(false);
 const fileRef=useRef<HTMLInputElement|null>(null);

 // завантаження: локально одразу, потім з акаунта (таблиця user_statements)
 useEffect(()=>{
   setList(loadLocal());loaded.current=true;
   if(!user)return;
   supabase.from("user_statements").select("statements").eq("user_id",user.id).maybeSingle()
     .then(({data,error}:{data:any;error:any})=>{
       if(error){cloudOk.current=false;return}
       cloudOk.current=true;
       const cloud=data?.statements as Statement[]|undefined;
       if(Array.isArray(cloud)&&cloud.length){setList(cloud);try{localStorage.setItem(SK,JSON.stringify(cloud))}catch{}}
     });
 },[user]);

 function persist(next:Statement[]){
   setList(next);
   try{localStorage.setItem(SK,JSON.stringify(next))}catch{}
   if(user&&cloudOk.current){
     supabase.from("user_statements").upsert({user_id:user.id,statements:next,updated_at:new Date().toISOString()},{onConflict:"user_id"})
       .then(({error}:{error:any})=>{if(error)setMsg("Не вдалося зберегти в акаунт: "+error.message)});
   }
 }
 const cur=list.find(s=>s.id===openId)||null;
 function update(patch:Partial<Statement>){
   if(!cur)return;
   persist(list.map(s=>s.id===cur.id?{...s,...patch,updatedAt:new Date().toISOString()}:s));
 }
 function create(){const s=newStatement();persist([s,...list]);setOpenId(s.id);setMsg("")}
 function remove(){
   if(!cur||!confirm(`Видалити розрахунок «${cur.client||"без імені"}»?`))return;
   persist(list.filter(s=>s.id!==cur.id));setOpenId(null);
 }

 // рядки
 const setLine=<T extends {id:string},>(key:"labor"|"receipts"|"payments",id:string,patch:Partial<T>)=>{
   if(!cur)return;update({[key]:(cur[key] as unknown as T[]).map(x=>x.id===id?{...x,...patch}:x)} as any);
 };
 const delLine=(key:"labor"|"receipts"|"payments",id:string)=>{if(cur)update({[key]:(cur[key] as any[]).filter(x=>x.id!==id)} as any)};

 async function addReceiptPhotos(files:FileList|null){
   if(!cur||!files?.length)return;
   setBusy(true);setMsg("");
   const added:Receipt[]=[];const failed:string[]=[];
   for(const f of Array.from(files)){
     try{
       const p=await prepareJobPhoto(f);
       const res=await fetch("/api/parse-receipt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo:p.dataUrl})});
       const d=await res.json();
       if(!res.ok)throw new Error(d?.error||"AI error");
       added.push({id:uid(),date:d.date||today(),store:d.store||"",items:d.items||"",amount:Number(d.total)||0});
       if((d.confidence??1)<0.7)failed.push(`${f.name}: перевір суму`);
     }catch(e){failed.push(`${f.name}: ${e instanceof Error?e.message:String(e)}`)}
   }
   const latest=list.find(s=>s.id===cur.id)||cur;
   persist(list.map(s=>s.id===latest.id?{...latest,receipts:[...latest.receipts,...added].sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()),updatedAt:new Date().toISOString()}:s));
   setBusy(false);
   setMsg(`Додано чеків: ${added.length}.`+(failed.length?" Увага — "+failed.join("; "):" Перевір суми з чеками."));
   if(fileRef.current)fileRef.current.value="";
 }

 async function pdf(share:boolean){
   if(!cur)return;
   setBusy(true);
   try{
     const blob=await buildStatementPdf(cur);
     const file=new File([blob],statementFileName(cur),{type:"application/pdf"});
     const nav=navigator as Navigator&{canShare?:(d:ShareData)=>boolean};
     if(share&&nav.share&&nav.canShare&&nav.canShare({files:[file]})){await nav.share({files:[file],title:file.name})}
     else{const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
   }catch(e){setMsg("Не вдалося зробити PDF: "+(e instanceof Error?e.message:String(e)))}
   finally{setBusy(false)}
 }

 if(!cur){
   return <section className="panel">
     <div className="head"><h1>Оплати</h1><button className="add" onClick={create}>＋ Новий розрахунок</button></div>
     <p className="muted" style={{marginTop:6}}>Робота + чеки на матеріали − оплати клієнта = залишок. PDF для клієнта однією кнопкою.</p>
     {list.length===0?<p className="empty">Ще немає розрахунків.</p>:list.map(s=>{const t=statementTotals(s);return(
       <button key={s.id} className="estimate" onClick={()=>{setOpenId(s.id);setMsg("")}}>
         <span><b>{s.client||"Без імені"}</b><small>{s.project||"Payment statement"}</small></span>
         <span style={{textAlign:"right"}}><strong>{money(t.balance)}</strong><small className="muted">залишок</small></span>
       </button>)})}
   </section>;
 }

 const t=statementTotals(cur);
 return <>
   <div className="screenbar noPrint"><button onClick={()=>setOpenId(null)}>← Список</button><b>Розрахунок</b><button onClick={remove} style={{color:"#b42318"}}>Видалити</button></div>
   <section className="panel grid">
     <label>Client<input value={cur.client} onChange={e=>update({client:e.target.value})}/></label>
     <label>Project<input value={cur.project} onChange={e=>update({project:e.target.value})}/></label>
   </section>

   <section className="panel">
     <div className="head"><h2>Робота</h2><button className="add" onClick={()=>update({labor:[...cur.labor,{id:uid(),description:"",amount:0}]})}>＋ Рядок</button></div>
     {cur.labor.map((l:StatementLine)=><div key={l.id} style={{display:"grid",gridTemplateColumns:"1fr 120px 42px",gap:8,marginTop:8}}>
       <input placeholder="Опис (напр. Range hood installation)" value={l.description} onChange={e=>setLine<StatementLine>("labor",l.id,{description:e.target.value})}/>
       <input type="number" step="0.01" value={l.amount} onChange={e=>setLine<StatementLine>("labor",l.id,{amount:Number(e.target.value)||0})}/>
       <button className="remove" onClick={()=>delLine("labor",l.id)}>×</button>
     </div>)}
   </section>

   <section className="panel">
     <div className="head"><h2>Чеки на матеріали</h2><button className="add" onClick={()=>update({receipts:[...cur.receipts,{id:uid(),date:today(),store:"",items:"",amount:0}]})}>＋ Вручну</button></div>
     <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>addReceiptPhotos(e.target.files)}/>
     <button className="primary full" disabled={busy} onClick={()=>fileRef.current?.click()}>{busy?"Читаю чеки…":"📷 Додати чеки з фото"}</button>
     {cur.receipts.map((r:Receipt)=><div key={r.id} style={{display:"grid",gridTemplateColumns:"110px 1fr 110px 42px",gap:8,marginTop:10,alignItems:"start"}}>
       <input value={r.date} onChange={e=>setLine<Receipt>("receipts",r.id,{date:e.target.value})}/>
       <div style={{display:"grid",gap:6}}>
         <input placeholder="Магазин" value={r.store} onChange={e=>setLine<Receipt>("receipts",r.id,{store:e.target.value})}/>
         <input placeholder="Що купив" value={r.items} onChange={e=>setLine<Receipt>("receipts",r.id,{items:e.target.value})}/>
       </div>
       <input type="number" step="0.01" value={r.amount} onChange={e=>setLine<Receipt>("receipts",r.id,{amount:Number(e.target.value)||0})}/>
       <button className="remove" onClick={()=>delLine("receipts",r.id)}>×</button>
     </div>)}
   </section>

   <section className="panel">
     <div className="head"><h2>Оплати клієнта</h2><button className="add" onClick={()=>update({payments:[...cur.payments,{id:uid(),date:today(),amount:0,method:"Zelle"}]})}>＋ Оплата</button></div>
     {cur.payments.map((p:Payment)=><div key={p.id} style={{display:"grid",gridTemplateColumns:"110px 1fr 110px 42px",gap:8,marginTop:8}}>
       <input value={p.date} onChange={e=>setLine<Payment>("payments",p.id,{date:e.target.value})}/>
       <select value={p.method} onChange={e=>setLine<Payment>("payments",p.id,{method:e.target.value})}>{METHODS.map(m=><option key={m}>{m}</option>)}</select>
       <input type="number" step="0.01" value={p.amount} onChange={e=>setLine<Payment>("payments",p.id,{amount:Number(e.target.value)||0})}/>
       <button className="remove" onClick={()=>delLine("payments",p.id)}>×</button>
     </div>)}
   </section>

   <section className="panel"><label>Примітка в PDF<textarea rows={3} value={cur.notes} onChange={e=>update({notes:e.target.value})}/></label></section>

   {msg&&<p className="muted" style={{margin:"0 4px 10px"}}>{msg}</p>}
   <section className="total">
     <div><span>Робота</span><span>{money(t.labor)}</span></div>
     <div><span>Матеріали за чеками</span><span>{money(t.materials)}</span></div>
     <div><span>Разом</span><b>{money(t.total)}</b></div>
     <div><span>Отримано</span><span>−{money(t.paid)}</span></div>
     <div className="grand"><span>{t.balance>=0?"Залишок до оплати":"Переплата"}</span><b>{money(Math.abs(t.balance))}</b></div>
   </section>
   <div className="actions noPrint"><button className="primary" disabled={busy} onClick={()=>pdf(false)}>Завантажити PDF</button><button className="secondary" disabled={busy} onClick={()=>pdf(true)}>Надіслати PDF</button></div>
 </>;
}
