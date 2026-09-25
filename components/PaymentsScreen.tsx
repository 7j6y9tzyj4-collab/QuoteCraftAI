"use client";
import {useEffect,useRef,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {prepareReceiptFile,isPdf,filesFromDataTransfer,filesFromClipboardItems} from "@/lib/receiptFile";
import {newStatement,statementTotals,type Statement,type Receipt,type Payment,type StatementLine} from "@/lib/statement";
import {buildStatementPdf,statementFileName,type ReceiptPhoto} from "@/lib/statementPdf";
import {scanReceipt,dataUrlToBlob,blobToDataUrl,imageSize} from "@/lib/receiptImage";

// Розрахунок з клієнтом: робота + чеки на матеріали − оплати = залишок, PDF для клієнта.
const SK="qc_statements";
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const today=()=>new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
const uid=()=>crypto.randomUUID();
const loadLocal=():Statement[]=>{try{return JSON.parse(localStorage.getItem(SK)||"[]")}catch{return[]}};
const METHODS=["Cash","Check","Zelle","Card","Other"];
const BUCKET="receipts";

// мініатюра чека: з акаунта (приватне сховище, тимчасове посилання) або локальна копія
function ReceiptThumb({r}:{r:Receipt}){
 const [src,setSrc]=useState<string|null>(r.photoData||null);
 useEffect(()=>{
   if(r.photoData){setSrc(r.photoData);return}
   if(!r.photoPath)return;
   let on=true;
   supabase.storage.from(BUCKET).createSignedUrl(r.photoPath,3600).then(({data}:{data:any})=>{if(on&&data?.signedUrl)setSrc(data.signedUrl)});
   return()=>{on=false};
 },[r.photoPath,r.photoData]);
 if(!src)return null;
 return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="receipt" style={{width:56,height:72,objectFit:"cover",borderRadius:8,border:"1px solid #d0d5dd"}}/></a>;
}

export default function PaymentsScreen({user}:{user:User|null}){
 const [list,setList]=useState<Statement[]>([]);
 const [openId,setOpenId]=useState<string|null>(null);
 const [msg,setMsg]=useState("");
 const [busy,setBusy]=useState(false);
 const cloudOk=useRef(false);
 const loaded=useRef(false);
 const fileRef=useRef<HTMLInputElement|null>(null);   // галерея, кілька фото
 const camRef=useRef<HTMLInputElement|null>(null);    // одразу камера
 const targetRef=useRef<string|null>(null);           // куди додати чек зі швидкої кнопки
 const [picking,setPicking]=useState(false);
 const [zoneOn,setZoneOn]=useState(false);
 const [withPhotos,setWithPhotos]=useState(true);

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
 function removeFiles(paths:(string|undefined)[]){
   const ps=paths.filter(Boolean) as string[];
   if(ps.length&&user)supabase.storage.from(BUCKET).remove(ps).then(()=>{});
 }
 function remove(){
   if(!cur||!confirm(`Видалити розрахунок «${cur.client||"без імені"}»?`))return;
   removeFiles(cur.receipts.map(r=>r.photoPath));
   persist(list.filter(s=>s.id!==cur.id));setOpenId(null);
 }

 // рядки
 const setLine=<T extends {id:string},>(key:"labor"|"receipts"|"payments",id:string,patch:Partial<T>)=>{
   if(!cur)return;update({[key]:(cur[key] as unknown as T[]).map(x=>x.id===id?{...x,...patch}:x)} as any);
 };
 const delLine=(key:"labor"|"receipts"|"payments",id:string)=>{
   if(!cur)return;
   if(key==="receipts"){const r=cur.receipts.find(x=>x.id===id);if(r?.photoPath&&!confirm("Видалити чек разом з фото?"))return;removeFiles([r?.photoPath])}
   update({[key]:(cur[key] as any[]).filter(x=>x.id!==id)} as any);
 };

 async function addReceiptPhotos(files:FileList|File[]|null,targetId?:string|null,screenshot=false){
   const target=list.find(s=>s.id===(targetId||cur?.id))||null;
   if(!target||!files?.length)return;
   if(openId!==target.id)setOpenId(target.id);
   setBusy(true);setMsg("");
   const added:Receipt[]=[];const failed:string[]=[];
   for(const f of Array.from(files)){
     try{
       const p=await prepareReceiptFile(f);
       const clean=screenshot||isPdf(f); // скріншот / PDF — вже «чисті», не обрізаємо
       const res=await fetch("/api/parse-receipt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo:p.dataUrl})});
       const d=await res.json();
       if(!res.ok)throw new Error(d?.error||"AI error");
       const rid=uid();
       const rec:Receipt={id:rid,date:d.date||today(),store:d.store||"",items:d.items||"",amount:Number(d.total)||0};
       // обрізаємо по межах чека і зберігаємо фото
       try{
         // скріншот з програми магазину — вже «чистий», не обрізаємо і не робимо сірим
         const scan=clean?p.dataUrl:await scanReceipt(p.dataUrl,d.box||null);
         let saved=false;
         if(user){
           const path=`${user.id}/${target.id}/${rid}.jpg`;
           const {error}=await supabase.storage.from(BUCKET).upload(path,dataUrlToBlob(scan),{contentType:"image/jpeg",upsert:true});
           if(!error){rec.photoPath=path;saved=true}
         }
         if(!saved)rec.photoData=clean?p.dataUrl:await scanReceipt(p.dataUrl,d.box||null,900,.5);
       }catch{/* без фото, але з сумою */}
       added.push(rec);
       if((d.confidence??1)<0.7)failed.push(`${f.name}: перевір суму`);
     }catch(e){failed.push(`${f.name}: ${e instanceof Error?e.message:String(e)}`)}
   }
   const latest=list.find(s=>s.id===target.id)||target;
   persist(list.map(s=>s.id===latest.id?{...latest,receipts:[...latest.receipts,...added].sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime()),updatedAt:new Date().toISOString()}:s));
   setBusy(false);
   setMsg(`Додано чеків: ${added.length}.`+(failed.length?" Увага — "+failed.join("; "):" Перевір суми з чеками."));
   if(fileRef.current)fileRef.current.value="";
   if(camRef.current)camRef.current.value="";
   targetRef.current=null;
 }
 // швидкий чек зі списку: вибрав клієнта → одразу камера
 // скріншот чека з програми Home Depot / Floor & Decor: скопіював → вставив
 async function pasteReceipt(id:string){
   setPicking(false);setMsg("");
   try{
     const cb=navigator.clipboard as Clipboard&{read?:()=>Promise<ClipboardItem[]>};
     if(!cb?.read)throw new Error("цей браузер не дає читати буфер кнопкою");
     const {files,types}=await filesFromClipboardItems(await cb.read());
     if(!files.length){setMsg(noClipMsg(types));return}
     await addReceiptPhotos(files,id,true);
   }catch(e){setMsg("Кнопка не змогла прочитати буфер ("+(e instanceof Error?e.message:String(e))+"). На ноутбуці: відкрий розрахунок, клікни в рамку «Вставити сюди» і натисни ⌘V.")}
 }
 function noClipMsg(types:string[]){
   const t=types.filter(x=>!x.startsWith("text/")||x==="text/html");
   return "У буфері немає картинки чи PDF"+(types.length?` (там: ${types.join(", ")})`:"")+
     (t.length?"":". Якщо копіював чек через Print → Поділитися → «Копіювати», iPhone кладе туди тільки текст — краще вибери «Зберегти у Файли» і додай через «🖼 Фото / PDF», або зроби скріншот.");
 }
 // Cmd+V / «Вставити» у відкритому розрахунку
 useEffect(()=>{
   if(!openId)return;
   const onPaste=async(e:ClipboardEvent)=>{
     const el=e.target as HTMLElement|null;
     const tag=el?.tagName;
     if(tag==="INPUT"||tag==="TEXTAREA")return;
     const inZone=!!el?.closest?.("[data-paste-zone]");
     const dt=e.clipboardData;
     // синхронно забираємо, поки буфер доступний
     const got=filesFromDataTransfer(dt);
     if(inZone)e.preventDefault();
     const {files,types}=await got;
     if(!files.length){if(inZone)setMsg(noClipMsg(types));return}
     e.preventDefault();addReceiptPhotos(files,openId,true);
   };
   window.addEventListener("paste",onPaste);
   return()=>window.removeEventListener("paste",onPaste);
 });
 function quickReceipt(id:string){
   targetRef.current=id;setPicking(false);
   camRef.current?.click();
 }

 async function pdf(share:boolean){
   if(!cur)return;
   setBusy(true);
   try{
     const photos:ReceiptPhoto[]=[];
     if(withPhotos)for(const r of cur.receipts){
       try{
         let dataUrl=r.photoData||"";
         if(!dataUrl&&r.photoPath){const {data}=await supabase.storage.from(BUCKET).download(r.photoPath);if(data)dataUrl=await blobToDataUrl(data)}
         if(!dataUrl)continue;
         const {w,h}=await imageSize(dataUrl);
         photos.push({label:`${r.date} · ${r.store||"Receipt"} · ${money(Number(r.amount)||0)}`,dataUrl,w,h});
       }catch{/* пропускаємо фото, яке не завантажилось */}
     }
     const blob=await buildStatementPdf(cur,photos);
     const file=new File([blob],statementFileName(cur),{type:"application/pdf"});
     const nav=navigator as Navigator&{canShare?:(d:ShareData)=>boolean};
     if(share&&nav.share&&nav.canShare&&nav.canShare({files:[file]})){await nav.share({files:[file],title:file.name})}
     else{const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
   }catch(e){setMsg("Не вдалося зробити PDF: "+(e instanceof Error?e.message:String(e)))}
   finally{setBusy(false)}
 }

 const inputs=<>
   <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" multiple style={{display:"none"}} onChange={e=>addReceiptPhotos(e.target.files)}/>
   <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>addReceiptPhotos(e.target.files,targetRef.current)}/>
 </>;

 if(!cur){
   return <><section className="panel">
     <div className="head"><h1>Оплати</h1><div style={{display:"flex",gap:6}}>{list.length>0&&<button className="add" disabled={busy} onClick={()=>setPicking(p=>!p)}>{busy?"Читаю…":"📷 Чек"}</button>}<button className="add" onClick={create}>＋ Новий</button></div></div>
     {picking&&<div style={{marginTop:10,padding:10,background:"#f8fafc",borderRadius:12}}>
       <small className="muted">Для кого чек? «📷 Фото» — камера; «📋 Скріншот» — вставити скопійований скріншот з програми магазину.</small>
       {list.map(s=><div key={s.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:6,marginTop:6,alignItems:"center"}}>
         <b style={{fontSize:14}}>{s.client||"Без імені"}{s.project?` — ${s.project}`:""}</b>
         <button className="secondary" onClick={()=>quickReceipt(s.id)}>📷 Фото</button>
         <button className="secondary" onClick={()=>pasteReceipt(s.id)}>📋 Скріншот</button>
       </div>)}
     </div>}
     {msg&&<p className="muted" style={{marginTop:8}}>{msg}</p>}
     <p className="muted" style={{marginTop:6}}>Робота + чеки на матеріали − оплати клієнта = залишок. PDF для клієнта однією кнопкою.</p>
     {list.length===0?<p className="empty">Ще немає розрахунків.</p>:list.map(s=>{const t=statementTotals(s);return(
       <button key={s.id} className="estimate" onClick={()=>{setOpenId(s.id);setMsg("")}}>
         <span><b>{s.client||"Без імені"}</b><small>{s.project||"Payment statement"}</small></span>
         <span style={{textAlign:"right"}}><strong>{money(t.balance)}</strong><small className="muted">залишок</small></span>
       </button>)})}
   </section>{inputs}</>;
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
     <div className="actions" style={{marginTop:10}}>
       <button className="primary" disabled={busy} onClick={()=>{targetRef.current=cur.id;camRef.current?.click()}}>{busy?"Читаю чеки…":"📷 Сфотографувати чек"}</button>
       <button className="secondary" disabled={busy} onClick={()=>fileRef.current?.click()}>🖼 Фото / PDF</button>
       <button className="secondary" disabled={busy} onClick={()=>pasteReceipt(cur.id)}>📋 Скріншот</button>
     </div>
     <div data-paste-zone style={{position:"relative",marginTop:10,padding:"12px 10px",border:`2px dashed ${zoneOn?"#2563eb":"#cbd5e1"}`,background:zoneOn?"#eff6ff":"transparent",borderRadius:12,color:zoneOn?"#1d4ed8":"#64748b",fontSize:13,textAlign:"center"}}>
       {busy?"Читаю…":zoneOn?"Тепер натисни ⌘V":"📋 Вставити сюди: клікни тут і натисни ⌘V (скріншот з iPhone, картинка або PDF)"}
       {/* порожнє редаговане поле поверх рамки — Safari на Mac дає вставити тільки в таке */}
       <div contentEditable suppressContentEditableWarning aria-label="Вставити чек"
         onInput={e=>{e.currentTarget.innerHTML=""}} onFocus={()=>setZoneOn(true)} onBlur={()=>setZoneOn(false)}
         style={{position:"absolute",inset:0,opacity:0,outline:"none",caretColor:"transparent",cursor:"pointer"}}/>
     </div>
     {cur.receipts.map((r:Receipt)=><div key={r.id} style={{display:"grid",gridTemplateColumns:"56px 110px 1fr 110px 42px",gap:8,marginTop:10,alignItems:"start"}}>
       <div>{(r.photoPath||r.photoData)?<ReceiptThumb r={r}/>:<span className="muted" style={{fontSize:11}}>без фото</span>}</div>
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
   {cur.receipts.some(r=>r.photoPath||r.photoData)&&<label className="noPrint" style={{display:"flex",gap:8,alignItems:"center",margin:"0 4px 10px"}}><input type="checkbox" style={{width:"auto"}} checked={withPhotos} onChange={e=>setWithPhotos(e.target.checked)}/>Додати фото чеків у PDF</label>}
   <div className="actions noPrint"><button className="primary" disabled={busy} onClick={()=>pdf(false)}>Завантажити PDF</button><button className="secondary" disabled={busy} onClick={()=>pdf(true)}>Надіслати PDF</button></div>
   {inputs}
 </>;
}
