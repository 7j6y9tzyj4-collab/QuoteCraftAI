"use client";
import {useEffect,useRef,useState,type DragEvent} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {prepareReceiptFile,isPdf,isReceiptFile,filesFromDataTransfer,filesFromClipboardItems,prepareReceiptPages,joinReceiptImages} from "@/lib/receiptFile";
import {imageHash,findDuplicate,matchStatementByName,baseName} from "@/lib/receiptBatch";
import ReceiptBatch,{type Draft} from "@/components/ReceiptBatch";
import {findCalcFor,planFromCalc} from "@/lib/priceHistory";
import type {SavedCalc} from "@/lib/calcTypes";
import {newStatement,statementTotals,type Statement,type Receipt,type Payment,type StatementLine} from "@/lib/statement";
import {buildStatementPdf,statementFileName,buildReceiptsPdf,receiptsFileName,type ReceiptPhoto} from "@/lib/statementPdf";
import {scanReceipt,shrinkImage,dataUrlToBlob,blobToDataUrl,imageSize} from "@/lib/receiptImage";

// Розрахунок з клієнтом: робота + чеки на матеріали − оплати = залишок, PDF для клієнта.
const SK="qc_statements";
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const today=()=>new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
const uid=()=>crypto.randomUUID();
const loadLocal=():Statement[]=>{try{return JSON.parse(localStorage.getItem(SK)||"[]")}catch{return[]}};
const METHODS=["Cash","Check","Zelle","Card","Other"];
const BUCKET="receipts";
const errText=(e:unknown)=>e instanceof Error?e.message:String(e);
const byDate=(a:Receipt,b:Receipt)=>new Date(a.date).getTime()-new Date(b.date).getTime();

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

export default function PaymentsScreen({user,calcs=[],incoming,onIncomingDone}:{user:User|null;calcs?:SavedCalc[];incoming?:Statement|null;onIncomingDone?:()=>void}){
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
 const [ready,setReady]=useState(false); // список з акаунта вже завантажено
 // пакет чеків: перегляд перед збереженням
 const [batch,setBatch]=useState<Draft[]|null>(null);
 const batchRef=useRef<Draft[]|null>(null);
 const [batchAsk,setBatchAsk]=useState(false);
 const [saving,setSaving]=useState(false);
 const [dragOn,setDragOn]=useState(false);
 const listRef=useRef<Statement[]>([]);
 listRef.current=list;

 // завантаження: локально одразу, потім з акаунта (таблиця user_statements)
 useEffect(()=>{
   setList(loadLocal());loaded.current=true;setReady(false);
   if(!user){setReady(true);return}
   supabase.from("user_statements").select("statements").eq("user_id",user.id).maybeSingle()
     .then(({data,error}:{data:any;error:any})=>{
       if(error){cloudOk.current=false;setReady(true);return}
       cloudOk.current=true;
       const cloud=data?.statements as Statement[]|undefined;
       if(Array.isArray(cloud)&&cloud.length){setList(cloud);try{localStorage.setItem(SK,JSON.stringify(cloud))}catch{}}
       setReady(true);
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
 // естімейт з калькулятора → розрахунок (новий або оновлюємо роботу в існуючому)
 useEffect(()=>{
   if(!incoming||!ready)return;
   const same=list.find(s=>(incoming.quoteToken&&s.quoteToken===incoming.quoteToken)||
     (incoming.client.trim()&&s.client.trim().toLowerCase()===incoming.client.trim().toLowerCase()&&s.project.trim().toLowerCase()===incoming.project.trim().toLowerCase()));
   if(same&&confirm(`Розрахунок «${same.client||"без імені"}» вже є. Замінити в ньому роботу на цей естімейт? Чеки й оплати залишаться.`)){
     persist(list.map(s=>s.id===same.id?{...s,labor:incoming.labor,quoteToken:incoming.quoteToken||s.quoteToken,calcId:incoming.calcId||s.calcId,updatedAt:new Date().toISOString()}:s));
     setOpenId(same.id);setMsg("Роботу оновлено з естімейту.");
   }else{
     persist([incoming,...list]);setOpenId(incoming.id);setMsg("Створено з естімейту. Додавай чеки й оплати.");
   }
   onIncomingDone?.();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[incoming,ready]);
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
         // обрізаємо з оригінального фото (повна роздільність), а не зі зменшеної копії для AI
         const orig=URL.createObjectURL(f);
         let scan=p.dataUrl;
         if(!clean){try{scan=await scanReceipt(orig,d.box||null)}catch{scan=await scanReceipt(p.dataUrl,d.box||null)}finally{URL.revokeObjectURL(orig)}}
         let saved=false;
         if(user){
           const path=`${user.id}/${target.id}/${rid}.jpg`;
           const {error}=await supabase.storage.from(BUCKET).upload(path,dataUrlToBlob(scan),{contentType:"image/jpeg",upsert:true});
           if(!error){rec.photoPath=path;saved=true}
         }
         if(!saved)rec.photoData=clean?p.dataUrl:await shrinkImage(scan);
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

 // ---------- Пакет чеків: кілька фото / PDF (1 сторінка = 1 чек) → перегляд → «Додати всі» ----------
 function setB(fn:(d:Draft[]|null)=>Draft[]|null){batchRef.current=fn(batchRef.current);setBatch(batchRef.current)}
 const patchDraft=(key:string,patch:Partial<Draft>)=>setB(ds=>ds&&ds.map(d=>d.key===key?{...d,...patch}:d));

 // дублікати: проти чеків у проєкті і проти попередніх чеків цього ж пакета
 function markDuplicates(){
   setB(ds=>{
     if(!ds)return ds;
     const seen:Record<string,Receipt[]>={};
     return ds.map(d=>{
       if(d.status!=="ok"||!d.targetId)return d.dupOf?{...d,dupOf:undefined,include:d.status==="ok"}:d;
       const st=listRef.current.find(s=>s.id===d.targetId);
       const pool=[...(st?.receipts||[]),...(seen[d.targetId]||[])];
       const dup=findDuplicate(d,pool);
       let out:Draft;
       if(dup)out={...d,include:false,dupOf:`${dup.date} · ${dup.store||"чек"} · ${money(Number(dup.amount)||0)}`};
       else out=d.dupOf?{...d,dupOf:undefined,include:true}:d;
       if(!dup)(seen[d.targetId]||=[]).push({id:d.key,date:d.date,store:d.store,items:"",amount:d.amount,receiptNo:d.receiptNo,hash:d.hash});
       return out;
     });
   });
 }

 async function readDraft(key:string){
   const d=batchRef.current?.find(x=>x.key===key);if(!d)return;
   patchDraft(key,{status:"reading"});
   try{
     const res=await fetch("/api/parse-receipt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo:d.dataUrl})});
     const j=await res.json();
     if(!res.ok)throw new Error(j?.error||"AI error");
     // фото — обрізаємо по межах чека з оригіналу; сторінка PDF (сканер Нотаток) — вже чиста
     let scan=d.dataUrl;
     if(!d.fromPdf){
       const orig=URL.createObjectURL(d.file);
       try{scan=await scanReceipt(orig,j.box||null)}catch{try{scan=await scanReceipt(d.dataUrl,j.box||null)}catch{/* лишаємо як є */}}
       finally{URL.revokeObjectURL(orig)}
     }
     patchDraft(key,{status:"ok",date:j.date||today(),store:j.store||"",items:j.items||"",amount:Number(j.total)||0,
       receiptNo:String(j.receipt_no||""),confidence:typeof j.confidence==="number"?j.confidence:1,hash:await imageHash(d.dataUrl),scan,include:true});
   }catch(e){patchDraft(key,{status:"error",error:errText(e),include:false})}
 }

 async function readAll(keys:string[]){
   let i=0;
   const worker=async()=>{while(i<keys.length&&batchRef.current){await readDraft(keys[i++])}};
   await Promise.all([worker(),worker(),worker()]);
   markDuplicates();
 }

 // targetId: проєкт, куди скинули; null — з головної Оплат (шукаємо проєкт за назвою файлу)
 async function startBatch(files:File[],targetId:string|null){
   const fs=files.filter(isReceiptFile);
   if(!fs.length){setMsg("Тут немає фото чи PDF.");return}
   if(batchRef.current){setMsg("Спершу збережи або скасуй поточний пакет чеків.");return}
   setMsg("");setBatchAsk(!targetId);setBusy(true);
   const drafts:Draft[]=[];const errs:string[]=[];
   for(const f of fs){
     const tid=targetId||matchStatementByName(f.name,listRef.current)?.id||"";
     try{
       for(const p of await prepareReceiptPages(f))drafts.push({key:p.key,source:p.name,page:p.page,pages:p.pages,fromPdf:p.fromPdf,file:p.file,dataUrl:p.dataUrl,
         status:"wait",date:"",store:"",items:"",amount:0,receiptNo:"",confidence:1,hash:"",include:false,targetId:tid});
     }catch(e){errs.push(`${f.name}: ${errText(e)}`)}
   }
   setBusy(false);
   if(errs.length)setMsg("Не вдалося відкрити — "+errs.join("; "));
   if(!drafts.length)return;
   setB(()=>drafts);
   await readAll(drafts.map(d=>d.key));
 }

 function batchTarget(source:string,targetId:string){
   setB(ds=>ds&&ds.map(d=>d.source===source?{...d,targetId}:d));
   markDuplicates();
 }

 // довгий чек на 2 сторінки: приклеюємо сторінку до попередньої і читаємо ще раз
 async function joinDraft(key:string){
   const ds=batchRef.current;if(!ds)return;
   const i=ds.findIndex(d=>d.key===key);if(i<1)return;
   const prev=ds[i-1],d=ds[i];
   try{
     const merged=await joinReceiptImages(prev.dataUrl,d.dataUrl);
     setB(x=>x&&x.filter(y=>y.key!==key).map(y=>y.key===prev.key?{...y,dataUrl:merged,scan:undefined,status:"wait",dupOf:undefined}:y));
     await readDraft(prev.key);
     markDuplicates();
   }catch(e){setMsg("Не вдалося з'єднати: "+errText(e))}
 }

 async function saveBatch(){
   const ds=(batchRef.current||[]).filter(d=>d.include&&d.status==="ok");
   if(!ds.length||ds.some(d=>!d.targetId))return;
   const skipped=(batchRef.current||[]).filter(d=>d.dupOf&&!d.include).length;
   setSaving(true);
   let all=listRef.current.slice();
   const newIds:Record<string,string>={};
   const add:Record<string,Receipt[]>={};
   let noPhoto=0;
   for(let k=0;k<ds.length;k++){
     const d=ds[k];
     setMsg(`Зберігаю чеки… ${k+1} / ${ds.length}`);
     let tid=d.targetId;
     if(tid==="new"){
       if(!newIds[d.source]){const s={...newStatement(),client:baseName(d.source)};all=[s,...all];newIds[d.source]=s.id}
       tid=newIds[d.source];
     }
     const rid=uid();
     const rec:Receipt={id:rid,date:d.date||today(),store:d.store,items:d.items,amount:Number(d.amount)||0,receiptNo:d.receiptNo||undefined,hash:d.hash||undefined};
     const img=d.scan||d.dataUrl;
     let saved=false;
     if(user){
       const path=`${user.id}/${tid}/${rid}.jpg`;
       const {error}=await supabase.storage.from(BUCKET).upload(path,dataUrlToBlob(img),{contentType:"image/jpeg",upsert:true});
       if(!error){rec.photoPath=path;saved=true}
     }
     if(!saved){try{rec.photoData=await shrinkImage(img)}catch{noPhoto++}}
     (add[tid]||=[]).push(rec);
   }
   const now=new Date().toISOString();
   persist(all.map(s=>add[s.id]?{...s,receipts:[...s.receipts,...add[s.id]].sort(byDate),updatedAt:now}:s));
   const ids=Object.keys(add);
   setB(()=>null);setSaving(false);
   if(ids.length===1)setOpenId(ids[0]);
   setMsg(`Додано чеків: ${ds.length}`+(ids.length>1?` у ${ids.length} проєкти`:"")+(skipped?`. Пропущено дублікатів: ${skipped}`:"")+(noPhoto?`. Без фото: ${noPhoto}`:"")+". Перевір суми з чеками.");
 }

 // перетягнути файли на сторінку (Mac) — той самий пакет
 const dropProps=(targetId:string|null)=>({
   onDragOver:(e:DragEvent)=>{if(Array.from(e.dataTransfer.types||[]).includes("Files")){e.preventDefault();if(!dragOn)setDragOn(true)}},
   onDragLeave:(e:DragEvent)=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDragOn(false)},
   onDrop:(e:DragEvent)=>{const fs=Array.from(e.dataTransfer.files||[]);if(!fs.length)return;e.preventDefault();setDragOn(false);startBatch(fs,targetId)},
 });

 const batchView=batch&&<ReceiptBatch drafts={batch} list={list} askTarget={batchAsk} saving={saving}
   onPatch={patchDraft} onTarget={batchTarget} onJoin={joinDraft} onCancel={()=>{if(saving)return;if(confirm("Скасувати пакет? Нічого не буде додано.")){setB(()=>null);setMsg("")}}} onSave={saveBatch}/>;

 // фото чеків для PDF (з акаунта або локальна копія)
 async function loadPhotos(s:Statement):Promise<ReceiptPhoto[]>{
   const photos:ReceiptPhoto[]=[];
   for(const r of s.receipts){
     try{
       let dataUrl=r.photoData||"";
       if(!dataUrl&&r.photoPath){const {data}=await supabase.storage.from(BUCKET).download(r.photoPath);if(data)dataUrl=await blobToDataUrl(data)}
       if(!dataUrl)continue;
       const {w,h}=await imageSize(dataUrl);
       photos.push({label:`${r.date} · ${r.store||"Receipt"} · ${money(Number(r.amount)||0)}`,dataUrl,w,h});
     }catch{/* пропускаємо фото, яке не завантажилось */}
   }
   return photos;
 }
 async function deliver(blob:Blob,name:string,share:boolean){
   const file=new File([blob],name,{type:"application/pdf"});
   const nav=navigator as Navigator&{canShare?:(d:ShareData)=>boolean};
   if(share&&nav.share&&nav.canShare&&nav.canShare({files:[file]})){await nav.share({files:[file],title:file.name})}
   else{const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 }

 async function pdf(share:boolean){
   if(!cur)return;
   setBusy(true);
   try{
     const photos=withPhotos?await loadPhotos(cur):[];
     await deliver(await buildStatementPdf(cur,photos),statementFileName(cur),share);
   }catch(e){setMsg("Не вдалося зробити PDF: "+errText(e))}
   finally{setBusy(false)}
 }
 // усі чеки проєкту одним PDF — на iPhone відкриється «Поділитись» → «Зберегти у Файли»
 async function receiptsPdf(){
   if(!cur)return;
   setBusy(true);setMsg("Збираю чеки в PDF…");
   try{
     const photos=await loadPhotos(cur);
     const mobile=typeof matchMedia!=="undefined"&&matchMedia("(pointer:coarse)").matches;
     await deliver(await buildReceiptsPdf(cur,photos),receiptsFileName(cur),mobile);
     setMsg(`PDF з чеками: ${photos.length} шт.`);
   }catch(e){if((e as any)?.name!=="AbortError")setMsg("Не вдалося зробити PDF з чеками: "+errText(e));else setMsg("")}
   finally{setBusy(false)}
 }

 const inputs=<>
   <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" multiple style={{display:"none"}} onChange={e=>{const fs=Array.from(e.target.files||[]);e.target.value="";startBatch(fs,cur?.id??null)}}/>
   <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>addReceiptPhotos(e.target.files,targetRef.current)}/>
 </>;

 if(!cur){
   return <>{batchView}<section className="panel" {...dropProps(null)} style={dragOn?{outline:"2px dashed #2563eb",background:"#eff6ff"}:undefined}>
     <div className="head"><h1>Оплати</h1><div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>{list.length>0&&<button className="add" disabled={busy} onClick={()=>setPicking(p=>!p)}>{busy?"Читаю…":"📷 Чек"}</button>}<button className="add" disabled={busy||!!batch} onClick={()=>fileRef.current?.click()} title="Кілька фото або PDF з Нотаток — проєкт знайду за назвою файлу">📦 Пакет</button><button className="add" onClick={create}>＋ Новий</button></div></div>
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
     <p className="muted" style={{marginTop:4,fontSize:13}}>{dragOn?"Відпусти — прочитаю всі чеки":"📦 Пакет чеків: PDF з Нотаток, назва файлу = ім'я клієнта («Uzma.pdf») — сам знайду проєкт. Можна перетягнути файли сюди."}</p>
     {list.length===0?<p className="empty">Ще немає розрахунків.</p>:list.map(s=>{const t=statementTotals(s);return(
       <button key={s.id} className="estimate" onClick={()=>{setOpenId(s.id);setMsg("")}}>
         <span><b>{s.client||"Без імені"}</b><small>{s.project||"Payment statement"}</small></span>
         <span style={{textAlign:"right"}}><strong>{money(t.balance)}</strong><small className="muted">залишок</small></span>
       </button>)})}
   </section>{inputs}</>;
 }

 const t=statementTotals(cur);
 // ---- план / факт ----
 const linked=findCalcFor(cur,calcs);
 const plan=linked?planFromCalc(linked):null;
 const matDiff=plan&&plan.materials>0?Math.round((t.materials/plan.materials-1)*1000)/10:null;
 const earned=Math.round((t.paid-t.materials)*100)/100;
 const hours=Number(cur.hours)||0;
 const pf=(label:string,planV:number|null,fact:number,warn=false,note?:string)=><div style={{display:"grid",gridTemplateColumns:"1fr 100px 100px",gap:6,padding:"6px 0",borderBottom:"1px solid #f2f4f7",fontSize:14}}>
   <span>{label}{note&&<small className="muted" style={{display:"block"}}>{note}</small>}</span>
   <span style={{textAlign:"right"}}>{planV===null?"—":money(planV)}</span>
   <b style={{textAlign:"right",color:warn?"#b42318":undefined}}>{money(fact)}</b>
 </div>;
 const planView=<section className="panel">
   <div className="head"><h2>📊 План / факт</h2></div>
   <label style={{marginTop:6}}><small className="muted">Естімейт для порівняння</small>
     <select value={linked?.id||(cur.calcId==="none"?"none":"")} onChange={e=>update({calcId:e.target.value||undefined})}>
       <option value="">{linked?"":"— вибери естімейт —"}</option>
       {calcs.map(c=><option key={c.id} value={c.id}>{c.client||"Без імені"}{c.project?` — ${c.project}`:""} · {money(c.total)} · {new Date(c.updatedAt).toLocaleDateString("uk-UA")}</option>)}
       <option value="none">Без естімейту</option>
     </select>
   </label>
   <div style={{display:"grid",gridTemplateColumns:"1fr 100px 100px",gap:6,marginTop:10,fontSize:12,color:"#667085"}}><span/><span style={{textAlign:"right"}}>за естімейтом</span><span style={{textAlign:"right"}}>факт</span></div>
   {pf("Матеріали",plan?plan.materials:null,t.materials,matDiff!==null&&matDiff>=15,matDiff!==null?`чеки ${matDiff>=0?"+":""}${matDiff}% від естімейту${matDiff>=15?" ⚠":""}`:undefined)}
   {pf("Робота",plan?plan.labor:null,t.labor,false,"у розрахунку")}
   {pf("Отримано від клієнта",null,t.paid)}
   {pf(t.balance>=0?"Залишок до оплати":"Переплата",null,Math.abs(t.balance))}
   <div style={{display:"grid",gridTemplateColumns:"1fr 100px",gap:6,padding:"10px 0 4px",fontSize:15}}>
     <span><b>Твій заробіток</b><small className="muted" style={{display:"block"}}>отримано − чеки</small></span>
     <b style={{textAlign:"right",color:earned>=0?"#067647":"#b42318"}}>{money(earned)}</b>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"1fr 100px",gap:6,alignItems:"center",marginTop:6}}>
     <label style={{margin:0}}>Годин роботи<input type="number" min="0" step="0.5" value={cur.hours??""} placeholder="напр. 32" onChange={e=>update({hours:e.target.value===""?undefined:Math.max(0,Number(e.target.value)||0)})}/></label>
     {hours>0&&<span style={{textAlign:"right",fontSize:14}}>робота ÷ год<b style={{display:"block",fontSize:16}}>{money(t.labor/hours)}/год</b></span>}
   </div>
 </section>;
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

   {batchView}
   <section className="panel" {...dropProps(cur.id)} style={dragOn?{outline:"2px dashed #2563eb",background:"#eff6ff"}:undefined}>
     <div className="head"><h2>Чеки на матеріали</h2><button className="add" onClick={()=>update({receipts:[...cur.receipts,{id:uid(),date:today(),store:"",items:"",amount:0}]})}>＋ Вручну</button></div>
     <div className="actions" style={{marginTop:10}}>
       <button className="primary" disabled={busy} onClick={()=>{targetRef.current=cur.id;camRef.current?.click()}}>{busy?"Читаю чеки…":"📷 Сфотографувати чек"}</button>
       <button className="secondary" disabled={busy||!!batch} onClick={()=>fileRef.current?.click()}>📦 Пакет чеків (фото / PDF)</button>
       <button className="secondary" disabled={busy} onClick={()=>pasteReceipt(cur.id)}>📋 Скріншот</button>
     </div>
     <div data-paste-zone style={{position:"relative",marginTop:10,padding:"12px 10px",border:`2px dashed ${zoneOn?"#2563eb":"#cbd5e1"}`,background:zoneOn?"#eff6ff":"transparent",borderRadius:12,color:zoneOn?"#1d4ed8":"#64748b",fontSize:13,textAlign:"center"}}>
       {busy?"Читаю…":dragOn?"Відпусти — прочитаю всі чеки":zoneOn?"Тепер натисни ⌘V":"📋 Вставити сюди: клікни тут і натисни ⌘V, або перетягни файли (пакет PDF / фото)"}
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

   {planView}

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
   {cur.receipts.some(r=>r.photoPath||r.photoData)&&<div className="actions noPrint" style={{marginTop:8}}><button className="secondary" disabled={busy} onClick={receiptsPdf}>📥 Скачати всі чеки проєкту (PDF)</button></div>}
   {inputs}
 </>;
}
