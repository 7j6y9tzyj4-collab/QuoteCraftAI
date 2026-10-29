"use client";
import {useEffect,useRef,useState,type DragEvent} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {prepareReceiptFile,isPdf,isReceiptFile,filesFromDataTransfer,filesFromClipboardItems,prepareReceiptPages,joinReceiptImages} from "@/lib/receiptFile";
import {imageHash,findDuplicate,findManualMatch,hasPhoto,matchStatementByName,baseName,normDate} from "@/lib/receiptBatch";
import ReceiptBatch,{type Draft} from "@/components/ReceiptBatch";
import DateInput from "@/components/DateInput";
import ClientPicker from "@/components/ClientPicker";
import type {Client} from "@/lib/clients";
import {findCalcFor,planFromCalc} from "@/lib/priceHistory";
import {acceptedAmounts,type QuoteSnapshot} from "@/lib/sharedQuote";
import {invoiceLink} from "@/lib/invoiceLink";
import ChangeOrders from "@/components/ChangeOrders";
import PaymentSchedule from "@/components/PaymentSchedule";
import CrewPanel from "@/components/CrewPanel";
import HoursCalendar from "@/components/HoursCalendar";
import MonthEarnings from "@/components/MonthEarnings";
import VoiceLog,{type VoiceAction} from "@/components/VoiceLog";
import JobsSchedule from "@/components/JobsSchedule";
import WorkerLinks from "@/components/WorkerLinks";
import StatementPhotos from "@/components/StatementPhotos";
import YearReport from "@/components/YearReport";
import MonthReceiptsButton from "@/components/MonthReceiptsButton";
import type {SavedCalc} from "@/lib/calcTypes";
import {useScheduleJobs,upcomingStart,shortDate} from "@/lib/scheduleStarts";
import {normalizeCrew,jobRate,newStatement,statementTotals,OWN_ID,OWN_CATS,newOwnStatement,guessOwnCategory,crewSummary,statementStatus,STATUS_META,type StatusKey,type Statement,type Receipt,type Payment,type StatementLine} from "@/lib/statement";
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

export default function PaymentsScreen({user,calcs=[],clients:clientBook=[],onAddClient,incoming,onIncomingDone,openId:openReq,onOpened}:{user:User|null;calcs?:SavedCalc[];clients?:Client[];onAddClient?:(c:Client)=>void;incoming?:Statement|null;onIncomingDone?:()=>void;openId?:string|null;onOpened?:()=>void}){
 const [list,setList]=useState<Statement[]>([]);
 const [openId,setOpenId]=useState<string|null>(null);
 // відкрити конкретний розрахунок (з картки клієнта)
 useEffect(()=>{if(openReq){setOpenId(openReq);onOpened?.()}},[openReq,onOpened]);
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
 const [statusFilter,setStatusFilter]=useState<"all"|"active"|"planned"|"done">("all");
 const schedJobs=useScheduleJobs(user);
 // «Заплановано»: старт у Графіку робіт ще попереду (Mubeena з понеділка) — окремий колір і вкладка
 const startOf=(s:Statement)=>upcomingStart(s,schedJobs,listRef.current);
 const stOf=(s:Statement)=>statementStatus(s,startOf(s));
 const ORDER:Record<StatusKey,number>={active:0,waiting:1,planned:2,done:3};
 const inTab=(s:Statement,k:"all"|"active"|"planned"|"done")=>{const st=stOf(s);return k==="all"||(k==="done"?st==="done":k==="planned"?st==="planned":st==="active"||st==="waiting")};
 const [ready,setReady]=useState(false); // список з акаунта вже завантажено
 // пакет чеків: перегляд перед збереженням
 const [batch,setBatch]=useState<Draft[]|null>(null);
 const batchRef=useRef<Draft[]|null>(null);
 const [batchAsk,setBatchAsk]=useState(false);
 const [saving,setSaving]=useState(false);
 const [dragOn,setDragOn]=useState(false);
 const listRef=useRef<Statement[]>([]);
 listRef.current=list;
 const [report,setReport]=useState(false);
 const [hoursCal,setHoursCal]=useState(false);
 const [jobsCal,setJobsCal]=useState(false);
 const [ownMonth,setOwnMonth]=useState(()=>new Date().toLocaleDateString("sv-SE").slice(0,7)); // YYYY-MM

 // завантаження: локально одразу, потім з акаунта (таблиця user_statements)
 useEffect(()=>{
   setList(loadLocal());loaded.current=true;setReady(false);
   if(!user){setReady(true);return}
   supabase.from("user_statements").select("statements").eq("user_id",user.id).maybeSingle()
     .then(({data,error}:{data:any;error:any})=>{
       if(error){cloudOk.current=false;setReady(true);return}
       cloudOk.current=true;
       const cloud=data?.statements as Statement[]|undefined;
       if(Array.isArray(cloud)&&cloud.length){
         const fixed=normalizeCrew(cloud);
         if(fixed.changed){listRef.current=fixed.list;supabase.from("user_statements").upsert({user_id:user.id,statements:fixed.list,updated_at:new Date().toISOString()},{onConflict:"user_id"}).then(()=>{})}
         setList(fixed.list);try{localStorage.setItem(SK,JSON.stringify(fixed.list))}catch{}
       }
       setReady(true);
     });
 },[user]);

 function persist(next:Statement[]){
   next=normalizeCrew(next).list;
   listRef.current=next;
   setList(next);
   try{localStorage.setItem(SK,JSON.stringify(next))}catch{}
   if(user&&cloudOk.current){
     supabase.from("user_statements").upsert({user_id:user.id,statements:next,updated_at:new Date().toISOString()},{onConflict:"user_id"})
       .then(({error}:{error:any})=>{if(error)setMsg("Не вдалося зберегти в акаунт: "+error.message)});
   }
 }
 // ---- 🎤 голосом: години, оплати, чеки без фото ----
 function applyVoice(acts:VoiceAction[]):string{
   const us=(d:string)=>{const m=String(d||"").match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[2]}/${m[3]}/${m[1]}`:today()};
   const me=/^\s*(я|me|i|myself)?\s*$/i;
   let next=listRef.current.slice();const done:string[]=[];
   for(const a of acts){
     const s0=next.find(x=>x.id===a.project_id);if(!s0)continue;
     let s={...s0};
     if(a.type==="hours"){
       let crew=[...(s.crew||[])];
       let w=me.test(a.worker||"")?crew.find(c=>c.self):crew.find(c=>c.name.trim().toLowerCase()===a.worker.trim().toLowerCase());
       if(!w){w=me.test(a.worker||"")?{id:uid(),name:"Я",rate:0,self:true}:{id:uid(),name:a.worker.trim(),rate:0};crew=[...crew,w]}
       s={...s,crew,workLog:[...(s.workLog||[]),{id:uid(),date:us(a.date),workerId:w.id,hours:Math.round(a.hours*100)/100,note:a.note||undefined}]};
       done.push(`${a.hours} год → ${s.client}`);
     }else if(a.type==="payment"){
       s={...s,payments:[...s.payments,{id:uid(),date:us(a.date),amount:Math.round(a.amount*100)/100,method:a.method||"Zelle"}]};
       done.push(`оплата ${money(a.amount)} → ${s.client}`);
     }else{
       s={...s,receipts:[...s.receipts,{id:uid(),date:us(a.date),store:a.store||"",items:a.items||"",amount:Math.round(a.amount*100)/100}].sort(byDate)};
       done.push(`чек ${money(a.amount)} → ${s.client}`);
     }
     next=next.map(x=>x.id===s.id?{...s,updatedAt:new Date().toISOString()}:x);
   }
   persist(next);
   return done.length?"✓ Записано: "+done.join("; "):"Нічого не записано.";
 }

 // ---- 👷 що надіслав помічник за посиланням (worker_inbox) → у розрахунки ----
 const pulling=useRef(false);
 async function pullWorkerInbox(){
   if(!user||pulling.current)return;pulling.current=true;
   try{await pullWorkerInboxInner();await pullMail()}finally{pulling.current=false}
 }
 // ---- 📧 чеки з пошти (mail_receipts): впевнені — одразу в розрахунок, решта — «Розібрати» ----
 const [mailReview,setMailReview]=useState<any[]>([]);
 function addMailReceipt(lst:Statement[],row:any,sid:string,why?:string):Statement[]|null{
   if(sid===OWN_ID&&!lst.some(s=>s.id===OWN_ID))lst=[...lst,newOwnStatement()];
   const s=lst.find(x=>x.id===sid);if(!s)return null;
   const p=row.payload||{};
   if(lst.some(x=>findDuplicate({date:p.date,store:p.store,amount:Number(p.amount)||0,receiptNo:p.receiptNo},x.receipts||[])))return lst;
   const rc:Receipt={id:p.id||uid(),date:p.date||today(),store:p.store||"",items:p.items||"",amount:Number(p.amount)||0,photoPath:p.photoPath||undefined,receiptNo:p.receiptNo||undefined,src:"mail",why:why??(row.reason||undefined),...(s.own?{category:guessOwnCategory(p.items||"")}:{})};
   return lst.map(x=>x.id===sid?{...x,receipts:[...x.receipts,rc].sort(byDate),updatedAt:new Date().toISOString()}:x);
 }
 async function pullMail(){
   if(!user)return;
   const {data,error}=await supabase.from("mail_receipts").select("id,sid,suggest,reason,payload,status,store").eq("user_id",user.id).is("applied_at",null).in("status",["auto","review"]).order("created_at");
   if(error||!data)return;
   let next=listRef.current.slice();const done:string[]=[];const lost:any[]=[];
   for(const r of data.filter((x:any)=>x.status==="auto")){const n2=addMailReceipt(next,r,r.sid);if(n2){next=n2;done.push(r.id)}else lost.push(r)}
   if(done.length){
     persist(next);
     await supabase.from("mail_receipts").update({applied_at:new Date().toISOString(),status:"applied"}).in("id",done);
     setMsg(`📧 З пошти: ${done.length} ${done.length===1?"чек":"чеки"} розставлено по проєктах — видно «📧 з пошти» біля чека.`);
   }
   setMailReview([...lost,...data.filter((x:any)=>x.status==="review")]);
   window.dispatchEvent(new Event("qc-inbox-applied"));
 }
 async function chooseMail(row:any,sid:string){
   if(sid==="skip"){await supabase.from("mail_receipts").update({applied_at:new Date().toISOString(),status:"skipped"}).eq("id",row.id)}
   else{
     const n2=addMailReceipt(listRef.current.slice(),row,sid,sid===row.suggest&&row.reason?row.reason+" · підтвердив":"розставив вручну");
     if(!n2){setMsg("Проєкт не знайдено.");return}
     persist(n2);
     await supabase.from("mail_receipts").update({applied_at:new Date().toISOString(),status:"applied",sid}).eq("id",row.id);
   }
   setMailReview(x=>x.filter(r=>r.id!==row.id));
   window.dispatchEvent(new Event("qc-inbox-applied"));
 }
 function moveReceipt(rid:string,from:string,to:string){
   let next=listRef.current.slice();if(to===OWN_ID&&!next.some(s=>s.id===OWN_ID))next=[...next,newOwnStatement()];
   const src=next.find(s=>s.id===from);const r=src?.receipts.find(x=>x.id===rid);const dst=next.find(s=>s.id===to);if(!src||!r||!dst)return;
   const moved:Receipt={...r,why:"перенесено вручну",...(dst.own?{category:r.category||guessOwnCategory(r.items)}:{})};
   const now=new Date().toISOString();
   next=next.map(s=>s.id===from?{...s,receipts:s.receipts.filter(x=>x.id!==rid),updatedAt:now}:s.id===to?{...s,receipts:[...s.receipts,moved].sort(byDate),updatedAt:now}:s);
   persist(next);setMsg(`↪ Чек ${r.store||""} ${money(Number(r.amount)||0)} перенесено в «${dst.client}${dst.project?` — ${dst.project}`:""}».`);
 }
 async function pullWorkerInboxInner(){
   if(!user)return;
   const {data,error}=await supabase.from("worker_inbox").select("id,token,worker,sid,kind,payload,created_at").eq("user_id",user.id).is("applied_at",null).order("created_at");
   if(error||!data?.length)return;
   const {data:links}=await supabase.from("worker_links").select("token,rate").eq("user_id",user.id);
   const rateOf=(t:string)=>Number((links||[]).find((l:any)=>l.token===t)?.rate)||0;
   const us=(d:string)=>{const m=String(d||"").match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[2]}/${m[3]}/${m[1]}`:today()};
   let next=listRef.current.slice();const used:string[]=[];const sum:Record<string,{h:number;r:number;p:number}>={};
   for(const it of data as any[]){
     const s0=next.find(x=>x.id===it.sid);if(!s0){used.push(it.id);continue}
     let s={...s0};const p=it.payload||{};const who=String(it.worker||"").trim();
     const k=who;sum[k]||={h:0,r:0,p:0};
     if(it.kind==="hours"){
       let crew=[...(s.crew||[])];let w=crew.find(c=>!c.self&&c.name.trim().toLowerCase()===who.toLowerCase());
       if(!w){w={id:uid(),name:who,rate:rateOf(it.token)};crew=[...crew,w]}
       s={...s,crew,workLog:[...(s.workLog||[]),{id:uid(),date:us(p.date),workerId:w.id,hours:Number(p.hours)||0,note:p.note||undefined}]};sum[k].h+=Number(p.hours)||0;
     }else if(it.kind==="receipt"){
       if(!s.receipts.some(r=>r.id===p.id))s={...s,receipts:[...s.receipts,{id:p.id||uid(),date:p.date||today(),store:p.store||"",items:p.items||"",amount:Number(p.amount)||0,photoPath:p.photoPath,receiptNo:p.receiptNo||undefined,by:who}].sort(byDate)};sum[k].r++;
     }else if(it.kind==="photo"){
       if(!(s.photos||[]).some(x=>x.id===p.id))s={...s,photos:[...(s.photos||[]),{id:p.id||uid(),path:p.path,date:us(p.date),by:who,note:p.note||undefined}]};sum[k].p++;
     }
     next=next.map(x=>x.id===s.id?{...s,updatedAt:new Date().toISOString()}:x);used.push(it.id);
   }
   persist(next);
   await supabase.from("worker_inbox").update({applied_at:new Date().toISOString()}).in("id",used);
   window.dispatchEvent(new Event("qc-inbox-applied"));
   const txt=Object.entries(sum).map(([w,v])=>`👷 ${w}: ${[v.h?`${v.h} год`:"",v.r?`чеків ${v.r}`:"",v.p?`фото ${v.p}`:""].filter(Boolean).join(", ")}`).join("; ");
   if(txt)setMsg(txt+" — додано в розрахунки. Перевір суми чеків.");
 }
 useEffect(()=>{if(!ready||!user)return;const on=()=>void pullWorkerInbox();window.addEventListener("qc-inbox-new",on);return()=>window.removeEventListener("qc-inbox-new",on)
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,user]);
 useEffect(()=>{if(ready&&user)void pullWorkerInbox()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,user]);

 // ---- прийнятий естімейт → розрахунок в Оплатах ----
 type Pending={token:string;q:QuoteSnapshot&{chosenTier?:number;chosenOptions?:number[]};acceptedAt:string};
 const [pendingAcc,setPendingAcc]=useState<Pending[]>([]);
 const nrm=(x:string)=>String(x||"").trim().toLowerCase();
 function statementFromQuote(p:Pending):Statement{
   const q=p.q;const st=newStatement();
   st.client=q.client||"";st.project=q.project||"";st.quoteToken=p.token;
   const calc=calcs.find(c=>c.shareToken===p.token);if(calc)st.calcId=calc.id;
   const tier=q.tiers?.length&&typeof q.chosenTier==="number"?q.tiers[q.chosenTier]:null;
   const lines=[...(tier?tier.lines:q.lines),...(q.chosenOptions||[]).map(i=>q.optional[i]).filter(Boolean)];
   st.labor=lines.filter(l=>Number(l.labor)>0).map(l=>({id:uid(),description:l.name,amount:Math.round(Number(l.labor)*100)/100}));
   const disc=tier?Number(tier.totals.discount)||0:Number(q.totals?.discount)||0;
   if(disc>0)st.labor.push({id:uid(),description:q.totals?.discountLabel||"Package discount",amount:-Math.round(disc*100)/100});
   const a=acceptedAmounts(q);
   if(a.deposit>0)st.schedule=[{id:uid(),label:"Deposit",amount:a.deposit}];
   return st;
 }
 async function checkAccepted(){
   if(!user)return;
   const since=new Date(Date.now()-30*86400000).toISOString();
   const {data}=await supabase.from("shared_quotes").select("token,data,accepted_at").eq("user_id",user.id).eq("status","accepted").gte("accepted_at",since);
   const rows=((data||[]) as any[]).filter(r=>r.data&&!r.data.kind&&!r.data.stmtCreated&&String(r.data.client||"").trim());
   if(!rows.length){setPendingAcc([]);return}
   let list2=listRef.current.slice();let changed=false;const created:string[]=[];const ask:Pending[]=[];const mark:string[]=[];
   for(const r of rows){
     const p:Pending={token:r.token,q:r.data,acceptedAt:r.accepted_at};
     if(list2.some(s=>s.quoteToken===r.token)){mark.push(r.token);continue}
     const same=list2.find(s=>!s.own&&!s.quoteToken&&nrm(s.client)===nrm(p.q.client)&&nrm(s.project)===nrm(p.q.project));
     if(same){list2=list2.map(s=>s.id===same.id?{...s,quoteToken:r.token}:s);changed=true;mark.push(r.token);continue}
     // у клієнта вже є інші розрахунки — питаємо, щоб не задвоїти; немає — створюємо одразу
     if(list2.some(s=>!s.own&&nrm(s.client)===nrm(p.q.client))){ask.push(p);continue}
     list2=[statementFromQuote(p),...list2];changed=true;created.push(`${p.q.client} — ${p.q.project||"Estimate"}`);mark.push(r.token);
   }
   if(changed)persist(list2);
   for(const t of mark){const r=rows.find(x=>x.token===t);await supabase.from("shared_quotes").update({data:{...r.data,stmtCreated:true}}).eq("token",t)}
   setPendingAcc(ask);
   if(created.length)setMsg("✅ Клієнт прийняв — створено розрахунок: "+created.join("; ")+". Додавай чеки й оплати.");
 }
 useEffect(()=>{if(ready&&user)void checkAccepted()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,user]);
 async function resolvePending(p:Pending,create:boolean){
   if(create){const st=statementFromQuote(p);persist([st,...listRef.current]);setOpenId(st.id);setMsg("Створено з прийнятого естімейту. Додавай чеки й оплати.")}
   await supabase.from("shared_quotes").update({data:{...p.q,stmtCreated:true}}).eq("token",p.token);
   setPendingAcc(x=>x.filter(y=>y.token!==p.token));
 }

 const cur=list.find(s=>s.id===openId)||null;
 // естімейт з калькулятора → розрахунок (новий або оновлюємо роботу в існуючому)
 useEffect(()=>{
   if(!incoming||!ready)return;
   const same=list.find(s=>!s.own&&(incoming.quoteToken&&s.quoteToken===incoming.quoteToken)||
     (incoming.client.trim()&&s.client.trim().toLowerCase()===incoming.client.trim().toLowerCase()&&s.project.trim().toLowerCase()===incoming.project.trim().toLowerCase()));
   if(same&&confirm(`Розрахунок «${same.client||"без імені"}» вже є. Замінити в ньому роботу на цей естімейт? Чеки й оплати залишаться.`)){
     persist(list.map(s=>s.id===same.id?{...s,labor:[...incoming.labor,...s.labor.filter(l=>(s.changes||[]).some(c=>c.laborLineId===l.id))],quoteToken:incoming.quoteToken||s.quoteToken,calcId:incoming.calcId||s.calcId,updatedAt:new Date().toISOString()}:s));
     setOpenId(same.id);setMsg("Роботу оновлено з естімейту.");
   }else{
     persist([incoming,...list]);setOpenId(incoming.id);setMsg("Створено з естімейту. Додавай чеки й оплати.");
   }
   onIncomingDone?.();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[incoming,ready]);
 function update(patch:Partial<Statement>){
   if(!cur)return;
   const id=cur.id;
   persist(listRef.current.map(s=>s.id===id?{...s,...patch,updatedAt:new Date().toISOString()}:s));
 }
 function patchStatement(id:string,patch:Partial<Statement>){
   persist(listRef.current.map(s=>s.id===id?{...s,...patch,updatedAt:new Date().toISOString()}:s));
 }
 function create(){const s=newStatement();persist([s,...list]);setOpenId(s.id);setMsg("")}
 function openOwn(){
   if(!list.some(s=>s.id===OWN_ID))persist([newOwnStatement(),...list]);
   setOpenId(OWN_ID);setMsg("");
 }
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
   const latest=list.find(s=>s.id===target.id)||target;
   // робоча копія чеків проєкту: сюди додаємо нові і в неї ж «вклеюємо» фото до чеків, вписаних вручну
   let receipts:Receipt[]=[...latest.receipts];
   let addedN=0,mergedN=0;const skipped:string[]=[];const failed:string[]=[];
   for(const f of Array.from(files)){
     try{
       const p=await prepareReceiptFile(f);
       const clean=screenshot||isPdf(f); // скріншот / PDF — вже «чисті», не обрізаємо
       const res=await fetch("/api/parse-receipt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo:p.dataUrl})});
       const d=await res.json();
       if(!res.ok)throw new Error(d?.error||"AI error");
       const hash=await imageHash(p.dataUrl).catch(()=>"");
       const info={date:d.date||today(),store:d.store||"",items:d.items||"",amount:Number(d.total)||0,receiptNo:String(d.receipt_no||""),hash};
       // 1) такий чек з фото вже є → не додаємо
       const dup=findDuplicate(info,receipts);
       if(dup&&hasPhoto(dup)){skipped.push(`${dup.date} · ${dup.store||"чек"} · ${money(Number(dup.amount)||0)}`);continue}
       // 2) є такий самий чек, вписаний вручну без фото → прикріплюємо фото до нього
       const manual=dup||findManualMatch(info,receipts);
       const rid=manual?manual.id:uid();
       let photo:{photoPath?:string;photoData?:string}={};
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
           if(!error){photo={photoPath:path};saved=true}
         }
         if(!saved)photo={photoData:clean?p.dataUrl:await shrinkImage(scan)};
       }catch{/* без фото, але з сумою */}
       if(manual){
         // дані з чека точніші за вписані вручну; категорію («Мої витрати») лишаємо
         receipts=receipts.map(r=>r.id===manual.id?{...r,...info,items:info.items||r.items,store:info.store||r.store,...photo}:r);
         mergedN++;
       }else{
         receipts.push({id:rid,...info,...photo});
         addedN++;
       }
       if((d.confidence??1)<0.7)failed.push(`${f.name}: перевір суму`);
     }catch(e){failed.push(`${f.name}: ${e instanceof Error?e.message:String(e)}`)}
   }
   if(addedN||mergedN){
     const now=list.find(s=>s.id===target.id)||latest;
     receipts.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
     persist(list.map(s=>s.id===now.id?{...now,receipts,updatedAt:new Date().toISOString()}:s));
   }
   setBusy(false);
   const parts=[`Додано чеків: ${addedN}.`];
   if(mergedN)parts.push(`Фото прикріплено до чеків, вписаних вручну: ${mergedN}.`);
   if(skipped.length)parts.push(`Пропущено — вже є: ${skipped.join("; ")}.`);
   setMsg(parts.join(" ")+(failed.length?" Увага — "+failed.join("; "):" Перевір суми з чеками."));
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

 // дублікати: проти чеків У ВСІХ проєктах (будь-якого клієнта) і проти попередніх чеків цього ж пакета
 function markDuplicates(){
   setB(ds=>{
     if(!ds)return ds;
     const all=listRef.current;
     const seen:Receipt[]=[];
     return ds.map(d=>{
       if(d.status!=="ok")return d.dupOf?{...d,dupOf:undefined}:d;
       let label="";
       for(const st of all){
         const r=findDuplicate(d,st.receipts||[]);
         if(r){label=`${r.date} · ${r.store||"чек"} · ${money(Number(r.amount)||0)} — у «${st.client||"Без імені"}${st.project?` — ${st.project}`:""}»`;break}
       }
       if(!label&&findDuplicate(d,seen))label="той самий чек уже є вище в цьому пакеті";
       if(!label)seen.push({id:d.key,date:d.date,store:d.store,items:"",amount:d.amount,receiptNo:d.receiptNo,hash:d.hash});
       if(label)return {...d,include:false,dupOf:label};
       return d.dupOf?{...d,dupOf:undefined,include:(Number(d.amount)||0)!==0}:d;
     });
   });
 }

 // у клієнта кілька проєктів → AI розкладає кожен чек у свій проєкт за тим, що куплено
 const sameClient=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
 function projectsFor(targetId:string){
   const t=listRef.current.find(s=>s.id===targetId);
   if(!t||t.own)return [];
   return listRef.current.filter(s=>!s.own&&sameClient(s.client,t.client));
 }
 async function autoAssign(){
   const ds=batchRef.current;if(!ds)return;
   const groups=new Map<string,Draft[]>();
   for(const d of ds){
     if(d.status!=="ok"||d.dupOf||!d.targetId||d.targetId==="new")continue;
     const projs=projectsFor(d.targetId);if(projs.length<2)continue;
     const k=projs.map(p=>p.id).sort().join(",");(groups.get(k)||groups.set(k,[]).get(k)!).push(d);
   }
   for(const [k,items] of groups){
     const projs=k.split(",").map(id=>listRef.current.find(s=>s.id===id)!).filter(Boolean);
     const projects=projs.map(p=>{
       const calc=findCalcFor(p,calcs);
       const ctx=[p.labor.map(l=>l.description).filter(Boolean).join("; "),calc?"Estimate items: "+(calc.items||[]).map(i=>i.name).slice(0,40).join("; "):"",
         p.receipts.length?"Receipts already filed: "+p.receipts.map(r=>r.items).filter(Boolean).slice(-15).join(" | "):""].filter(Boolean).join("\n");
       return {id:p.id,label:`${p.client} — ${p.project||"(no name)"}`,context:ctx};
     });
     try{
       setMsg("AI розкладає чеки по проєктах…");
       const res=await fetch("/api/receipt-assign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projects,receipts:items.map(d=>({key:d.key,date:d.date,store:d.store,items:d.items,amount:d.amount}))})});
       const j=await res.json();
       if(!res.ok)throw new Error(j?.error||"AI error");
       const m=new Map<string,{project_id:string;confidence:number;reason:string}>((j.assign||[]).map((a:any)=>[a.key,a]));
       setB(x=>x&&x.map(d=>{const a=m.get(d.key);return a&&projs.some(p=>p.id===a.project_id)?{...d,targetId:a.project_id,aiConf:a.confidence,aiReason:a.reason}:d}));
       setMsg("");
     }catch(e){setMsg("Не вдалося розкласти по проєктах автоматично ("+errText(e)+") — вибери проєкт біля кожного чека.")}
   }
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
       receiptNo:String(j.receipt_no||""),confidence:typeof j.confidence==="number"?j.confidence:1,hash:await imageHash(d.dataUrl),scan,include:(Number(j.total)||0)!==0});
   }catch(e){patchDraft(key,{status:"error",error:errText(e),include:false})}
 }

 async function readAll(keys:string[]){
   let i=0;
   const worker=async()=>{while(i<keys.length&&batchRef.current){await readDraft(keys[i++])}};
   await Promise.all([worker(),worker(),worker()]);
   markDuplicates();
   await autoAssign();
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
   setB(ds=>ds&&ds.map(d=>d.source===source?{...d,targetId,aiConf:undefined,aiReason:undefined}:d));
   markDuplicates();
   void autoAssign();
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
   onPatch={patchDraft} onTarget={batchTarget} projectsFor={projectsFor} onJoin={joinDraft} onCancel={()=>{if(saving)return;if(confirm("Скасувати пакет? Нічого не буде додано.")){setB(()=>null);setMsg("")}}} onSave={saveBatch}/>;

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

 const clients=list.filter(s=>!s.own);
 const ownSt=list.find(s=>s.id===OWN_ID);
 const inMonth=(r:Receipt,m:string)=>normDate(r.date).slice(0,7)===m;
 const catOf=(r:Receipt)=>r.category||guessOwnCategory(r.items);
 function ownTotal(m:string){return Math.round((ownSt?.receipts||[]).filter(r=>inMonth(r,m)).reduce((a,r)=>a+(Number(r.amount)||0),0)*100)/100}

 if(!cur&&jobsCal)return <JobsSchedule user={user} list={list} onClose={()=>setJobsCal(false)}/>;
 if(!cur&&hoursCal)return <HoursCalendar list={list} onPatch={patchStatement} onClose={()=>setHoursCal(false)}/>;
 if(!cur&&report)return <YearReport list={list} calcs={calcs} onClose={()=>setReport(false)}/>;
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
     {mailReview.length>0&&<div style={{marginTop:10,padding:12,borderRadius:12,background:"#fffaeb",border:"1px solid #fedf89"}}>
       <b>🧾 Чеки з пошти — куди? · {mailReview.length}</b>
       <small className="muted" style={{display:"block"}}>Програма не впевнена. Синя кнопка — її підказка.</small>
       {mailReview.map(r=>{const p=r.payload||{};const targets=[...list.filter(s=>!s.own&&stOf(s)!=="done"),...list.filter(s=>s.own)];if(!targets.some(s=>s.own))targets.push(newOwnStatement());return <div key={r.id} style={{marginTop:10,paddingTop:10,borderTop:"1px solid #fde68a"}}>
         <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
           {p.photoPath&&<div style={{width:56,flex:"none"}}><ReceiptThumb r={{id:p.id,date:p.date,store:p.store,items:p.items,amount:p.amount,photoPath:p.photoPath}}/></div>}
           <div style={{flex:1}}><b>{p.store||r.store} · {money(Number(p.amount)||0)}</b><small style={{display:"block"}}>{p.date} · {p.items}</small>{p.job&&<small style={{display:"block",fontWeight:700}}>Job на чеку: {p.job}</small>}{r.reason&&<small className="muted" style={{display:"block"}}>{r.reason}</small>}</div>
         </div>
         <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
           {targets.map(s=><button key={s.id} className={s.id===r.suggest?"primary":"secondary"} onClick={()=>chooseMail(r,s.id)} style={{padding:"8px 10px",fontSize:13}}>{s.own?"🧰 Мої витрати":`${s.client}${s.project&&list.filter(x=>x.client===s.client).length>1?` — ${s.project.slice(0,24)}`:""}`}</button>)}
           <button className="secondary" onClick={()=>chooseMail(r,"skip")} style={{padding:"8px 10px",fontSize:13}}>✕ Не рахувати</button>
         </div>
       </div>})}
     </div>}
     {pendingAcc.map(p=><div key={p.token} style={{marginTop:10,padding:12,borderRadius:12,background:"#ecfdf3",border:"1px solid #abefc6"}}>
       <b>✅ {p.q.client} прийняв(ла) естімейт «{p.q.project||"Estimate"}» — {money(acceptedAmounts(p.q).total)}</b>
       <small className="muted" style={{display:"block"}}>У клієнта вже є інші розрахунки, тому питаю, щоб не задвоїти.</small>
       <div className="actions" style={{marginTop:6}}><button className="primary" onClick={()=>resolvePending(p,true)}>＋ Створити розрахунок</button><button className="secondary" onClick={()=>resolvePending(p,false)}>Вже є / не треба</button></div>
     </div>)}
     <p className="muted" style={{marginTop:6}}>Робота + чеки на матеріали − оплати клієнта = залишок. PDF для клієнта однією кнопкою.</p>
     <p className="muted" style={{marginTop:4,fontSize:13}}>{dragOn?"Відпусти — прочитаю всі чеки":"📦 Пакет чеків: PDF з Нотаток, назва файлу = ім'я клієнта («Uzma.pdf») — сам знайду проєкт. Можна перетягнути файли сюди."}</p>
     {list.some(x=>!x.own)&&<VoiceLog list={list} onApply={applyVoice}/>}
     {list.length>0&&<MonthEarnings list={list}/>}
     <button className="estimate" onClick={()=>setJobsCal(true)} style={{background:"#eff8ff"}}>
       <span><b>📅 Графік робіт</b><small>Хто, з якого дня і скільки днів · найближчий вільний день</small></span>
       <span style={{textAlign:"right",alignSelf:"center"}}>›</span>
     </button>
     <button className="estimate" onClick={()=>setHoursCal(true)} style={{background:"#f0fdf4"}}>
       <span><b>🗓 Години по днях і тижнях</b><small>Календар: хто, де й скільки годин працював, підсумок тижня</small></span>
       <span style={{textAlign:"right",alignSelf:"center"}}>›</span>
     </button>
     <button className="estimate" onClick={()=>setReport(true)} style={{background:"#f5f3ff"}}>
       <span><b>📊 Річний звіт</b><small>Дохід по клієнтах і місяцях, мої витрати, CSV для бухгалтера</small></span>
       <span style={{textAlign:"right",alignSelf:"center"}}>›</span>
     </button>
     <button className="estimate" onClick={openOwn} style={{background:"#f0f9ff"}}>
       <span><b>🧰 Мої витрати</b><small>Інструменти й матеріали для себе — {new Date(ownMonth+"-15").toLocaleDateString("uk-UA",{month:"long"})}</small></span>
       <span style={{textAlign:"right"}}><strong>{money(ownTotal(ownMonth))}</strong><small className="muted">цей місяць</small></span>
     </button>
     <MonthReceiptsButton list={list}/>
     {clients.length>0&&<div style={{display:"flex",gap:6,marginTop:12,flexWrap:"wrap"}}>
       {([["all","Всі"],["active","В роботі"],["planned","Заплановані"],["done","Завершені"]] as const).map(([k,l])=>{const n=clients.filter(s=>inTab(s,k)).length;if(k==="planned"&&!n)return null;return <button key={k} onClick={()=>setStatusFilter(k)} style={{borderRadius:999,padding:"7px 13px",fontWeight:700,fontSize:13,background:statusFilter===k?"#101828":"#eef2f7",color:statusFilter===k?"#fff":"#344054"}}>{l} · {n}</button>})}
     </div>}
     {clients.length===0?<p className="empty">Ще немає розрахунків.</p>:[...clients].filter(s=>inTab(s,statusFilter)).sort((a,b)=>ORDER[stOf(a)]-ORDER[stOf(b)]).map(s=>{const t=statementTotals(s);const st=stOf(s);const m=STATUS_META[st];const start=startOf(s);return(
       <button key={s.id} className="estimate" onClick={()=>{setOpenId(s.id);setMsg("")}} style={{borderLeft:`6px solid ${m.color}`,background:m.bg,opacity:st==="done"?0.85:1}}>
         <span><b>{s.client||"Без імені"}</b><small>{s.project||"Payment statement"}</small><small style={{color:m.color,fontWeight:800,marginTop:3}}>{st==="done"?"✓ ":st==="planned"?"🗓 ":"● "}{m.label}{st==="planned"&&start?` · з ${shortDate(start)}`:""}{s.status?" ✎":""}{st==="done"&&jobRate(s).hours>0?` · ${money(jobRate(s).rate)}/год`:""}</small></span>
         <span style={{textAlign:"right"}}><strong>{money(t.balance)}</strong><small className="muted">залишок</small></span>
       </button>)})}
   </section>{inputs}</>;
 }

 // ---- 🧰 Мої витрати: свої інструменти й матеріали, підсумок за місяць ----
 if(cur.own){
   const rs=cur.receipts.filter(r=>inMonth(r,ownMonth)||!normDate(r.date));
   const byCat=OWN_CATS.map(c=>({c,sum:Math.round(rs.filter(r=>normDate(r.date)&&catOf(r)===c).reduce((a,r)=>a+(Number(r.amount)||0),0)*100)/100}));
   const total=ownTotal(ownMonth);
   const year=ownMonth.slice(0,4);
   const yearTotal=Math.round(cur.receipts.filter(r=>normDate(r.date).startsWith(year)).reduce((a,r)=>a+(Number(r.amount)||0),0)*100)/100;
   const monthName=new Date(ownMonth+"-15").toLocaleDateString("uk-UA",{month:"long",year:"numeric"});
   const summary=[`Мої витрати на роботу — ${monthName}`,...byCat.filter(x=>x.sum).map(x=>`${x.c}: ${money(x.sum)}`),`Разом: ${money(total)}`].join("\n");
   const copySummary=async()=>{try{await navigator.clipboard.writeText(summary);setMsg("Скопійовано — встав у свою таблицю.")}catch{setMsg(summary)}};
   const csv=()=>{
     const q=(v:unknown)=>`"${String(v??"").replace(/"/g,'""')}"`;
     const lines=[["Дата","Магазин","Що купив","Категорія","Сума"].map(q).join(","),
       ...rs.filter(r=>normDate(r.date)).sort((a,b)=>normDate(a.date).localeCompare(normDate(b.date))).map(r=>[r.date,r.store,r.items,catOf(r),(Number(r.amount)||0).toFixed(2)].map(q).join(",")),
       "",...byCat.map(x=>[q(""),q(""),q(""),q(x.c),x.sum.toFixed(2)].join(",")),[q(""),q(""),q(""),q("Разом"),total.toFixed(2)].join(",")];
     const blob=new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
     const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`Мої витрати ${ownMonth}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
   };
   return <>
     <div className="screenbar noPrint"><button onClick={()=>setOpenId(null)}>← Список</button><b>🧰 Мої витрати</b><span/></div>
     {batchView}
     <section className="panel" {...dropProps(cur.id)} style={dragOn?{outline:"2px dashed #2563eb",background:"#eff6ff"}:undefined}>
       <p className="muted" style={{marginTop:0}}>Інструменти й матеріали, які купуєш для себе (не для клієнта). Чеки — так само: фото, пакет PDF або вручну.</p>
       <label>Місяць<input type="month" value={ownMonth} onChange={e=>e.target.value&&setOwnMonth(e.target.value)}/></label>
       <div className="actions" style={{marginTop:10}}>
         <button className="primary" disabled={busy} onClick={()=>{targetRef.current=cur.id;camRef.current?.click()}}>{busy?"Читаю…":"📷 Чек"}</button>
         <button className="secondary" disabled={busy||!!batch} onClick={()=>fileRef.current?.click()}>📦 Пакет (фото / PDF)</button>
         <button className="secondary" onClick={()=>{const [y,m]=ownMonth.split("-");const now=new Date();const d=now.toLocaleDateString("sv-SE").startsWith(ownMonth)?today():`${m}/01/${y}`;update({receipts:[...cur.receipts,{id:uid(),date:d,store:"",items:"",amount:0}]})}}>＋ Вручну</button>
       </div>
       {rs.length===0&&<p className="empty">За {monthName} ще нічого.</p>}
       {rs.sort((a,b)=>normDate(a.date).localeCompare(normDate(b.date))).map((r:Receipt)=><div key={r.id} style={{display:"grid",gridTemplateColumns:"56px 1fr 42px",gap:8,marginTop:10,alignItems:"start",paddingBottom:10,borderBottom:"1px solid #f2f4f7"}}>
         <div>{(r.photoPath||r.photoData)?<ReceiptThumb r={r}/>:<span className="muted" style={{fontSize:11}}>без фото</span>}</div>
         <div style={{display:"grid",gap:6,minWidth:0}}>
           <div style={{display:"grid",gridTemplateColumns:"minmax(0,130px) minmax(0,1fr) minmax(0,100px)",gap:6}}>
             <DateInput value={r.date} style={!normDate(r.date)?{borderColor:"#f04438"}:undefined} onChange={v=>setLine<Receipt>("receipts",r.id,{date:v})}/>
             <input placeholder="Магазин" value={r.store} onChange={e=>setLine<Receipt>("receipts",r.id,{store:e.target.value})}/>
             <input type="number" step="0.01" value={r.amount} onChange={e=>setLine<Receipt>("receipts",r.id,{amount:Number(e.target.value)||0})}/>
           </div>
           <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 130px",gap:6}}>
             <input placeholder="Що купив" value={r.items} onChange={e=>setLine<Receipt>("receipts",r.id,{items:e.target.value})}/>
             {r.by&&<small style={{color:"#7a5af8",fontWeight:700}}>👷 додав {r.by}</small>}
             <select value={catOf(r)} onChange={e=>setLine<Receipt>("receipts",r.id,{category:e.target.value})}>{OWN_CATS.map(c=><option key={c}>{c}</option>)}</select>
             {(r.src==="mail"||r.why)&&<small style={{color:"#175cd3",fontWeight:700}}>{r.src==="mail"?"📧 з пошти":""}{r.src==="mail"&&r.why?" · ":""}{r.why||""}</small>}
             <select value="" onChange={e=>{if(e.target.value)moveReceipt(r.id,cur.id,e.target.value)}} style={{padding:"6px 8px",fontSize:13,color:"#475467"}}><option value="">↪ Це для клієнта…</option>{list.filter(s=>!s.own).map(s=><option key={s.id} value={s.id}>{s.client}{s.project?` — ${s.project}`:""}</option>)}</select>
           </div>
           {!normDate(r.date)&&<small style={{color:"#b42318"}}>Виправ дату (MM/DD/YYYY), інакше чек не потрапить у місяць.</small>}
         </div>
         <button className="remove" onClick={()=>delLine("receipts",r.id)}>×</button>
       </div>)}
     </section>
     {msg&&<p className="muted" style={{margin:"0 4px 10px"}}>{msg}</p>}
     <section className="total">
       {byCat.filter(x=>x.sum).map(x=><div key={x.c}><span>{x.c}</span><span>{money(x.sum)}</span></div>)}
       <div className="grand"><span>Разом за {monthName}</span><b>{money(total)}</b></div>
       <div><span>З початку {year} року</span><span>{money(yearTotal)}</span></div>
     </section>
     <div className="actions noPrint"><button className="primary" onClick={copySummary}>📋 Скопіювати для таблиці</button><button className="secondary" onClick={csv}>⬇ CSV за місяць</button></div>
     {inputs}
   </>;
 }

 const t=statementTotals(cur);
 // ---- план / факт ----
 const linked=findCalcFor(cur,calcs);
 const plan=linked?planFromCalc(linked):null;
 const matDiff=plan&&plan.materials>0?Math.round((t.materials/plan.materials-1)*1000)/10:null;
 const crewSm=crewSummary(cur);
 const earned=Math.round((t.paid-t.materials-crewSm.cost)*100)/100;
 const hours=crewSm.hours>0?crewSm.hours:(Number(cur.hours)||0);
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
     <span><b>Твій заробіток</b><small className="muted" style={{display:"block"}}>отримано − чеки{crewSm.cost>0?` − помічники ${money(crewSm.cost)}`:""}</small></span>
     <b style={{textAlign:"right",color:earned>=0?"#067647":"#b42318"}}>{money(earned)}</b>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"1fr 100px",gap:6,alignItems:"center",marginTop:6}}>
     {crewSm.hours>0?<span style={{fontSize:14}}>Годин: <b>{crewSm.hours}</b><small className="muted" style={{display:"block"}}>з обліку команди вище</small></span>:<label style={{margin:0}}>Годин роботи<input type="number" min="0" step="0.5" value={cur.hours??""} placeholder="напр. 32" onChange={e=>update({hours:e.target.value===""?undefined:Math.max(0,Number(e.target.value)||0)})}/></label>}
     {hours>0&&<span style={{textAlign:"right",fontSize:14}}>робота ÷ год<b style={{display:"block",fontSize:16}}>{money(t.labor/hours)}/год</b></span>}
   </div>
 </section>;
 return <>
   <div className="screenbar noPrint"><button onClick={()=>setOpenId(null)}>← Список</button><b>Розрахунок</b><button onClick={remove} style={{color:"#b42318"}}>Видалити</button></div>
   <section className="panel grid">
     <ClientPicker value={cur.client} onChange={v=>update({client:v})} clients={clientBook} onAdd={c=>onAddClient?.(c)}/>
     <label>Project<input value={cur.project} onChange={e=>update({project:e.target.value})}/></label>
    <label>Статус проєкту<select value={cur.status||"auto"} onChange={e=>update({status:e.target.value==="auto"?undefined:e.target.value as StatusKey})}>
      <option value="auto">Авто — зараз: {STATUS_META[statementStatus({...cur,status:undefined},startOf(cur))].label}</option>
      {(Object.keys(STATUS_META) as StatusKey[]).map(k=><option key={k} value={k}>{STATUS_META[k].label}</option>)}
    </select></label>
   </section>

   <section className="panel">
     <div className="head"><h2>Робота</h2><button className="add" onClick={()=>update({labor:[...cur.labor,{id:uid(),description:"",amount:0}]})}>＋ Рядок</button></div>
     {cur.labor.map((l:StatementLine)=><div key={l.id} style={{display:"grid",gridTemplateColumns:"1fr 120px 42px",gap:8,marginTop:8}}>
       <input placeholder="Опис (напр. Range hood installation)" value={l.description} onChange={e=>setLine<StatementLine>("labor",l.id,{description:e.target.value})}/>
       <input type="number" step="0.01" value={l.amount} onChange={e=>setLine<StatementLine>("labor",l.id,{amount:Number(e.target.value)||0})}/>
       <button className="remove" onClick={()=>delLine("labor",l.id)}>×</button>
     </div>)}
   </section>

   <ChangeOrders key={cur.id} st={cur} user={user} onPatch={update} setMsg={setMsg}/>

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
     {cur.receipts.map((r:Receipt)=><div key={r.id} style={{display:"grid",gridTemplateColumns:"56px 130px 1fr 110px 42px",gap:8,marginTop:10,alignItems:"start"}}>
       <div>{(r.photoPath||r.photoData)?<ReceiptThumb r={r}/>:<span className="muted" style={{fontSize:11}}>без фото</span>}</div>
       <DateInput value={r.date} onChange={v=>setLine<Receipt>("receipts",r.id,{date:v})}/>
       <div style={{display:"grid",gap:6}}>
         <input placeholder="Магазин" value={r.store} onChange={e=>setLine<Receipt>("receipts",r.id,{store:e.target.value})}/>
         <input placeholder="Що купив" value={r.items} onChange={e=>setLine<Receipt>("receipts",r.id,{items:e.target.value})}/>
         {r.by&&<small style={{color:"#7a5af8",fontWeight:700}}>👷 додав {r.by}</small>}
         {(r.src==="mail"||r.why)&&<small style={{color:"#175cd3",fontWeight:700}}>{r.src==="mail"?"📧 з пошти":""}{r.src==="mail"&&r.why?" · ":""}{r.why||""}</small>}
         <select value="" onChange={e=>{if(e.target.value)moveReceipt(r.id,cur.id,e.target.value)}} style={{padding:"6px 8px",fontSize:13,color:"#475467"}}><option value="">↪ Перенести в інший проєкт…</option>{list.filter(s=>s.id!==cur.id).map(s=><option key={s.id} value={s.id}>{s.own?"🧰 Мої витрати":`${s.client}${s.project?` — ${s.project}`:""}`}</option>)}{!list.some(s=>s.own)&&<option value={OWN_ID}>🧰 Мої витрати</option>}</select>
       </div>
       <input type="number" step="0.01" value={r.amount} onChange={e=>setLine<Receipt>("receipts",r.id,{amount:Number(e.target.value)||0})}/>
       <button className="remove" onClick={()=>delLine("receipts",r.id)}>×</button>
     </div>)}
   </section>

   <section className="panel">
     <div className="head"><h2>Оплати клієнта</h2><button className="add" onClick={()=>update({payments:[...cur.payments,{id:uid(),date:today(),amount:0,method:"Zelle"}]})}>＋ Оплата</button></div>
     {cur.payments.map((p:Payment)=><div key={p.id} style={{display:"grid",gridTemplateColumns:"130px 1fr 110px 42px",gap:8,marginTop:8}}>
       <DateInput value={p.date} onChange={v=>setLine<Payment>("payments",p.id,{date:v})}/>
       <select value={p.method} onChange={e=>setLine<Payment>("payments",p.id,{method:e.target.value})}>{METHODS.map(m=><option key={m}>{m}</option>)}</select>
       <input type="number" step="0.01" value={p.amount} onChange={e=>setLine<Payment>("payments",p.id,{amount:Number(e.target.value)||0})}/>
       <button className="remove" onClick={()=>delLine("payments",p.id)}>×</button>
     </div>)}
   </section>

   <PaymentSchedule st={cur} contractTotal={plan?Math.round((plan.total+(cur.changes||[]).filter(c=>c.status==="accepted").reduce((a,c)=>a+c.lines.reduce((b,l)=>b+(Number(l.amount)||0),0),0))*100)/100:t.total} depositPct={linked?.depositPct} onPatch={update}/>

   <CrewPanel st={cur} all={list} onPatch={update}/>
   <WorkerLinks user={user} st={cur}/>
   <StatementPhotos st={cur} onPatch={update}/>
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
   {user&&<div className="actions noPrint" style={{marginTop:8}}><button className="secondary" disabled={busy} onClick={async()=>{
     try{const link=await invoiceLink(user,cur);
       const nav=navigator as Navigator&{share?:(d:ShareData)=>Promise<void>};
       if(nav.share&&/iPhone|iPad|Android/i.test(navigator.userAgent)){try{await nav.share({text:link});setMsg("Посилання на рахунок: "+link);return}catch{}}
       try{await navigator.clipboard.writeText(link);setMsg("Посилання на рахунок скопійовано: "+link)}catch{setMsg("Посилання на рахунок: "+link)}
     }catch(e){setMsg("Не вдалося: "+(e instanceof Error?e.message:String(e)))}}}>🔗 Рахунок клієнту (посилання, завжди свіжі цифри)</button></div>}
   {cur.receipts.some(r=>r.photoPath||r.photoData)&&<div className="actions noPrint" style={{marginTop:8}}><button className="secondary" disabled={busy} onClick={receiptsPdf}>📥 Скачати всі чеки проєкту (PDF)</button></div>}
   {inputs}
 </>;
}
