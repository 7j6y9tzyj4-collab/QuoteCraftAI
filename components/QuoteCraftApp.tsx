"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import type {Estimate,EstimateStatus,Item,PriceRule,Unit} from "@/lib/types";
import {prepareJobPhoto,type JobPhoto} from "@/lib/jobPhotos";
import PhotoMeasurements from "@/components/PhotoMeasurements";
import {PRELIMINARY_NOTE} from "@/lib/photoMeasurements";
import PriceEditor from "@/components/PriceEditor";
import {validPrice,bounds,categoryOf} from "@/lib/priceCatalog";
import {estimateTotals,itemTotal,itemMaterialRate,itemFinishRate} from "@/lib/estimateTotals";
import ServicePicker from "@/components/ServicePicker";
import {defaults} from "@/lib/defaults";
import {supabase} from "@/lib/supabase";
import type {User} from "@supabase/supabase-js";
import type {CalcTask,CalcItem,CalcDifficulty,CalcAIItem,CalcDraft} from "@/lib/calcTypes";
import {buildCalcPdf,buildShoppingPdf,pdfFileName} from "@/lib/calcPdf";
import {buildShoppingList} from "@/lib/shoppingList";
import {calcDefaults} from "@/lib/calcPricing";
import {legacyIdMap} from "@/lib/catalog";
import {computeCalcLine,computeCalcTotals,computeOptionalTotal} from "@/lib/calcEngine";

const EK="qc-estimates-v1",PK="qc-prices-v1",CK="qc-calc-pricing-v1",CKO="qc-calc-overrides-v1",CDK="qc-calc-draft-v1";
// Одна таблиця цін: Calculator бере ставки з Prices (праця = rate, матеріали = materialRate),
// а решту параметрів (складність, діапазон) — з каталогу. Окремих цін калькулятора більше нема.
type CalcOverride={laborRate:number;materialRate:number};
type CalcOverrides=Record<string,CalcOverride>;
const tasksFromPrices=(prices:PriceRule[]):CalcTask[]=>{
 const byId=new Map(prices.map(p=>[p.id,p]));
 const fromCatalog=calcDefaults.map(t=>{
  const p=byId.get(t.id);
  return p?{...t,laborRate:Number(p.rate)||0,materialRate:typeof p.materialRate==="number"?p.materialRate:t.materialRate,finishRate:typeof p.finishRate==="number"?p.finishRate:(t.finishRate||0),suppliesPct:0,suppliesFixed:0}:t;
 });
 const custom=prices.filter(p=>!calcDefaults.some(t=>t.id===p.id)).map(p=>({
  id:p.id,category:categoryOf(p),name:p.name,unit:p.unit,laborRate:Number(p.rate)||0,materialRate:p.materialRate||0,finishRate:p.finishRate||0,suppliesPct:0,suppliesFixed:0,minPrice:0,
  difficultyMultipliers:{basic:0.9,standard:1,difficult:1.2},lowMult:0.9,highMult:1.15,notes:"",source:"Власна позиція з Prices."
 }));
 return fromCatalog.concat(custom);
};
// Ціни, збережені під старим id, переносимо на новий і накладаємо на повний
// каталог: так нові роботи зʼявляються самі, а власні ставки й додані вручну
// позиції зберігаються.
const mergeSavedPrices=(saved:PriceRule[]|null|undefined):PriceRule[]=>{
 const byId:Record<string,PriceRule>={};
 // Спершу позиції під старими id, потім під актуальними: якщо збережено обидві,
 // діє ставка з актуального id (власна), а стара копія лише зливається.
 const saved_=saved||[];
 saved_.filter(p=>legacyIdMap[p.id]).forEach(p=>{const id=legacyIdMap[p.id];byId[id]={...p,id}});
 saved_.filter(p=>!legacyIdMap[p.id]).forEach(p=>{byId[p.id]={...p}});
 const merged=defaults.map(d=>{
  const own=byId[d.id];
  // матеріали й оздоблення — з каталогу (ціни магазинів), якщо власник не змінював їх вручну
  return own?{...d,rate:own.rate,rateMin:own.rateMin,rateMax:own.rateMax,
   ...(own.materialOwn&&typeof own.materialRate==="number"?{materialRate:own.materialRate,materialOwn:true}:{}),
   ...(own.finishOwn&&typeof own.finishRate==="number"?{finishRate:own.finishRate,finishOwn:true}:{})}:d;
 });
 const custom=Object.values(byId).filter(p=>!defaults.some(d=>d.id===p.id));
 return merged.concat(custom);
};

// Каталоги зводили в один, і частина робіт змінила id. Правки, збережені під
// старим id, переносимо на новий, інакше вони б мовчки перестали діяти.
const migrateOverrides=(ov:CalcOverrides|null|undefined):CalcOverrides=>{
 const out:CalcOverrides={};
 Object.entries(ov||{}).forEach(([id,v])=>{out[legacyIdMap[id]||id]=v});
 return out;
};
// Старі окремі ціни калькулятора (localStorage / user_calc_prices) один раз переносимо у Prices.
const applyLegacyCalcOverrides=(prices:PriceRule[],ov:CalcOverrides):PriceRule[]=>{
 const m=migrateOverrides(ov);
 if(!Object.keys(m).length)return prices;
 return prices.map(p=>m[p.id]?{...p,rate:m[p.id].laborRate,rateMin:Math.min(p.rateMin??m[p.id].laborRate,m[p.id].laborRate),rateMax:Math.max(p.rateMax??m[p.id].laborRate,m[p.id].laborRate)}:p);
};
const missingCalcTable=(e:{code?:string;message?:string}|null)=>!!e&&(e.code==="42P01"||/user_calc_prices/.test(e.message||""));
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const fresh=():Estimate=>({id:crypto.randomUUID(),client:"",project:"",address:"",items:[],discount:0,tax:0,deposit:25,createdAt:new Date().toISOString(),status:"draft",includeFinish:true});
const load=<T,>(k:string,f:T):T=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(f))}catch{return f}};
const unitLabel=(u:Unit)=>({each:"each",sqft:"sq ft",hour:"hour",linear_ft:"linear ft",room:"room"}[u]);
const DEFAULT_CALC_NOTES="Additional conditions: This estimate includes labor and an editable allowance for basic installation materials (adhesive/thinset, waterproof boards, floor underlayment boards, shower pan/base, drain and plumbing rough materials, grout, silicone, sealants and small consumables). Final material cost may change based on product choice, final layout and conditions found after demolition.\n\nFinish materials (tile, vanity, faucet, mirror, shower glass/door, light fixtures, fan, accessories) are either shown above as a basic-grade allowance or purchased by the customer; the final amount follows the customer's actual selection and receipts. Appliances, permits, dumpster/disposal, and any hidden damage behind walls or under the floor are separate unless specifically included above. Small consumables (fasteners, sealant, putty, etc.) are purchased by the contractor and reimbursed by the customer based on receipts. Payment can be made in cash, by check, or via Zelle.\n\nAny additional work beyond this estimate will be billed separately; the customer will be informed in advance to approve the cost before proceeding. Final labor may change if ductwork, plumbing, electrical, rotten subfloor, mold, or other hidden issues are found after demolition. Prices are valid for 30 days.";
// Шаблони нотаток: власник зберігає свої абзаци й вставляє їх у кошторис однією кнопкою.
type NoteTemplate={id:string;name:string;text:string};
const NTK="qc_note_templates";
const DEFAULT_NOTE_TEMPLATES:NoteTemplate[]=[
 {id:"std",name:"Стандартні умови",text:DEFAULT_CALC_NOTES},
 {id:"per-item",name:"Ціни по пунктах + матеріали по чеках",text:"Pricing: all prices are per item as listed. Any additional work requested or found necessary will be added to the estimate, and any listed work that is not performed will be deducted from it. The customer will approve any change before it is done.\n\nMaterials: material amounts shown are estimates. The contractor purchases the materials needed for the job, and the final material cost is billed based on the actual store receipts, which will be provided to the customer."},
 {id:"wallpaper",name:"Шпалери: стан стін (якщо треба)",text:"Wallpaper removal: the condition of the walls under the existing wallpaper is unknown until it is removed. If the drywall surface is damaged during removal (torn paper facing, old adhesive, or no primer underneath), repair will be charged additionally: spot repair with sealer and joint compound at $1.25 per sq ft of damaged area, or a full skim coat at $2.25 per sq ft. The customer will be informed and approve before this work begins."},
 {id:"hidden",name:"Приховані умови в стінах",text:"Hidden conditions: plumbing, electrical, vent pipes or framing found inside the walls, and any hidden damage behind walls or under the floor, are not included and will be discussed with the customer before any extra work."},
 {id:"payment",name:"Оплата і термін дії",text:"Not included: permits, disposal/dumpster, and any work not listed above.\n\nPayment can be made in cash, by check, or via Zelle. Prices are valid for 30 days."},
];
const missingNotesTable=(e:{code?:string;message?:string}|null)=>!!e&&(e.code==="42P01"||e.code==="PGRST205"||/user_note_templates/.test(e.message||""));
const freshCalcDraft=():CalcDraft=>({items:[],client:"",project:"",locationMultiplier:1,notes:DEFAULT_CALC_NOTES,discountType:"percent",discountValue:0});

type AIItem={
  serviceId:string;
  description:string;
  quantity:number;
  unit:Unit;
  note:string|null;
  confidence:number;
  explicitRate?:number|null;
};

export default function QuoteCraftApp(){
 const [screen,setScreen]=useState<"home"|"new"|"saved"|"prices"|"calc">("home");
 const [all,setAll]=useState<Estimate[]>([]);
 const [prices,setPrices]=useState<PriceRule[]>(defaults);
 const [cur,setCur]=useState<Estimate>(fresh());
 const [prompt,setPrompt]=useState("");
 const [photos,setPhotos]=useState<JobPhoto[]>([]);
 const [photoBusy,setPhotoBusy]=useState(false);
 const [questions,setQuestions]=useState<string[]>([]);
 const jobRevision=useRef(0);
 const photoInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{
   jobRevision.current++;
   setPhotos([]);setQuestions([]);setPrompt("");
   return ()=>{
     jobRevision.current++;
     if(mediaRecorderRef.current?.state==="recording")mediaRecorderRef.current.stop();
   };
 },[cur.id]);
 const [thinking,setThinking]=useState(false);
 const [listening,setListening]=useState(false);
 const [message,setMessage]=useState("");
 const [user,setUser]=useState<User|null>(null);
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [authLoading,setAuthLoading]=useState(true);
 const [recoveryMode,setRecoveryMode]=useState(false);
 const [newPassword,setNewPassword]=useState("");
 const [transcribing,setTranscribing]=useState(false);
 const recognitionRef=useRef<any>(null);
 const baseRef=useRef("");
 const finalRef=useRef("");
 const mediaRecorderRef=useRef<MediaRecorder|null>(null);
 const audioChunksRef=useRef<Blob[]>([]);

 const [calcItems,setCalcItems]=useState<CalcItem[]>([]);
 const [calcClient,setCalcClient]=useState("");
 const [calcProject,setCalcProject]=useState("");
 const [calcLocationMultiplier,setCalcLocationMultiplier]=useState(1);
 // Пакетна знижка — на працю, як у кошторисах власника (матеріали не знижуються)
 const [calcDiscountType,setCalcDiscountType]=useState<"percent"|"amount">("percent");
 const [calcDiscountValue,setCalcDiscountValue]=useState(0);
 // базове оздоблення (плитка, прилади за цінами магазинів) — у сумі за замовчуванням
 const [calcIncludeFinish,setCalcIncludeFinish]=useState(true);
 const [calcNotes,setCalcNotes]=useState(DEFAULT_CALC_NOTES);
 const [noteTemplates,setNoteTemplates]=useState<NoteTemplate[]>(DEFAULT_NOTE_TEMPLATES);
 const [noteTplName,setNoteTplName]=useState("");
 const notesRef=useRef<HTMLTextAreaElement|null>(null);
 const notesCloudOk=useRef(false);
 useEffect(()=>{setNoteTemplates(load<NoteTemplate[]>(NTK,DEFAULT_NOTE_TEMPLATES))},[]);
 const [calcPrompt,setCalcPrompt]=useState("");
 const [calcThinking,setCalcThinking]=useState(false);
 const [calcListening,setCalcListening]=useState(false);
 const [calcTranscribing,setCalcTranscribing]=useState(false);
 const [calcMessage,setCalcMessage]=useState("");
 const calcRecognitionRef=useRef<any>(null);
 const calcBaseRef=useRef("");
 const calcFinalRef=useRef("");
 const calcMediaRecorderRef=useRef<MediaRecorder|null>(null);
 const calcAudioChunksRef=useRef<Blob[]>([]);

 useEffect(()=>{
   setAll(load(EK,[]));
   const savedPrices=mergeSavedPrices(load<PriceRule[]|null>(PK,null));
   setPrices(savedPrices);
   try{localStorage.setItem(PK,JSON.stringify(savedPrices))}catch{}
   // одноразове перенесення старих локальних цін калькулятора у Prices
   const localOv=load<CalcOverrides|null>(CKO,null);
   if(localOv&&Object.keys(localOv).length){
     const migrated=applyLegacyCalcOverrides(savedPrices,localOv);
     setPrices(migrated);
     try{localStorage.setItem(PK,JSON.stringify(migrated));localStorage.removeItem(CKO);localStorage.removeItem(CK)}catch{}
   }
   const draft=load<CalcDraft>(CDK,freshCalcDraft());
   setCalcItems(draft.items||[]);
   setCalcClient(draft.client||"");
   setCalcProject(draft.project||"");
   setCalcLocationMultiplier(draft.locationMultiplier??1);
   setCalcDiscountType(draft.discountType??"percent");
   setCalcDiscountValue(Number(draft.discountValue)||0);
   setCalcIncludeFinish(draft.includeFinish!==false);
   setCalcNotes(draft.notes??DEFAULT_CALC_NOTES);
 },[]);

 useEffect(()=>{
   const draft:CalcDraft={items:calcItems,client:calcClient,project:calcProject,locationMultiplier:calcLocationMultiplier,notes:calcNotes,discountType:calcDiscountType,discountValue:calcDiscountValue,includeFinish:calcIncludeFinish};
   localStorage.setItem(CDK,JSON.stringify(draft));
 },[calcItems,calcClient,calcProject,calcLocationMultiplier,calcNotes,calcDiscountType,calcDiscountValue,calcIncludeFinish]);

 const calcTasks=useMemo(()=>tasksFromPrices(prices),[prices]);
 // Пакетні групи («повний ремонт») — першими у списку, решта — у порядку каталогу
 const calcCategories=useMemo(()=>{
   const all=Array.from(new Set(calcTasks.map(t=>t.category)));
   const pkg=all.filter(c=>/повний ремонт/i.test(c));
   return [...pkg,...all.filter(c=>!pkg.includes(c))];
 },[calcTasks]);
 const calcTotalsValue=useMemo(()=>computeCalcTotals(calcItems,calcLocationMultiplier,calcIncludeFinish),[calcItems,calcLocationMultiplier,calcIncludeFinish]);
 const calcOptionalTotal=useMemo(()=>computeOptionalTotal(calcItems,calcLocationMultiplier,calcIncludeFinish),[calcItems,calcLocationMultiplier,calcIncludeFinish]);
 const calcDiscount=useMemo(()=>{
   const v=Math.max(0,Number(calcDiscountValue)||0);
   const raw=calcDiscountType==="percent"?calcTotalsValue.labor*v/100:v;
   return Math.min(Math.round(raw*100)/100,calcTotalsValue.labor);
 },[calcDiscountType,calcDiscountValue,calcTotalsValue.labor]);
 const calcGrandTotal=Math.max(0,calcTotalsValue.lineTotal-calcDiscount);
 const calcDiscountLabel=calcDiscountType==="percent"?`Package discount (${calcDiscountValue}% of labor)`:"Package discount";

 function applyCalcTask(item:CalcItem,task:CalcTask):CalcItem{
   return{
     ...item,
     taskId:task.id,
     name:task.name,
     laborOwn:undefined,
     finishOwn:undefined,
     category:task.category,
     unit:task.unit,
     laborRate:task.laborRate,
     materialRate:task.materialRate,
     finishRate:task.finishRate||0,
     suppliesPct:task.suppliesPct,
     suppliesFixed:task.suppliesFixed,
     minPrice:task.minPrice,
     difficultyMultipliers:task.difficultyMultipliers,
     lowMult:task.lowMult,
     highMult:task.highMult,
     notes:task.notes
   };
 }

 function updateCalcItem(id:string,patch:Partial<CalcItem>){
   setCalcItems(items=>items.map(it=>{
     if(it.id!==id)return it;
     let next={...it,...patch};
     if(patch.taskId&&patch.taskId!==it.taskId){
       const task=calcTasks.find(t=>t.id===patch.taskId);
       if(task)next=applyCalcTask(next,task);
     }
     return next;
   }));
 }

 function removeCalcItem(id:string){
   setCalcItems(items=>items.filter(it=>it.id!==id));
 }

 function addCalcItem(){
   const task=calcTasks[0];
   if(!task)return;
   const blank:CalcItem={id:crypto.randomUUID(),taskId:"",name:"",category:"",unit:"each",quantity:1,difficulty:"standard",laborRate:0,materialRate:0,suppliesPct:0,suppliesFixed:0,minPrice:0,difficultyMultipliers:{basic:1,standard:1,difficult:1},lowMult:0.85,highMult:1.25,notes:""};
   setCalcItems(items=>[...items,applyCalcTask(blank,task)]);
 }

 function clearCalc(){
   if(calcItems.length&&!confirm("Почати новий розрахунок? Поточний буде очищено."))return;
   setCalcItems([]);setCalcClient("");setCalcProject("");setCalcLocationMultiplier(1);setCalcNotes(DEFAULT_CALC_NOTES);setCalcPrompt("");setCalcMessage("");
 }

 function needsCalcRecorderFallback(){
  if(typeof window==="undefined")return false;
  const ua=navigator.userAgent||"";
  const isIOS=/iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
  const w=window as typeof window&{SpeechRecognition?:unknown;webkitSpeechRecognition?:unknown};
  const hasLiveApi=Boolean(w.SpeechRecognition||w.webkitSpeechRecognition);
  return isIOS||!hasLiveApi;
 }

 function startCalcVoice(){
  if(needsCalcRecorderFallback())startCalcVoiceRecording();
  else startCalcVoiceLive();
 }

 function stopCalcVoice(){
  if(calcMediaRecorderRef.current)stopCalcVoiceRecording();
  else stopCalcVoiceLive();
 }

 function startCalcVoiceLive(){
  setCalcMessage("");
  const w=window as typeof window&{SpeechRecognition?:new()=>any;webkitSpeechRecognition?:new()=>any};
  const Ctor=w.SpeechRecognition||w.webkitSpeechRecognition;
  if(!Ctor){setCalcMessage("Цей браузер не підтримує Voice. На Mac відкрий сайт у Chrome.");return}

  const recognition=new Ctor();
  calcRecognitionRef.current=recognition;
  calcBaseRef.current=calcPrompt.trim();
  calcFinalRef.current="";
  recognition.lang="uk-UA";
  recognition.continuous=true;
  recognition.interimResults=true;

  recognition.onstart=()=>setCalcListening(true);
  recognition.onresult=(event:any)=>{
    let interim="";
    for(let i=event.resultIndex;i<event.results.length;i++){
      const part=String(event.results[i][0].transcript||"").trim();
      if(event.results[i].isFinal)calcFinalRef.current=(calcFinalRef.current+" "+part).trim();
      else interim=(interim+" "+part).trim();
    }
    const spoken=[calcFinalRef.current,interim].filter(Boolean).join(" ");
    setCalcPrompt([calcBaseRef.current,spoken].filter(Boolean).join(" ").trim());
  };
  recognition.onerror=(e:any)=>{
    setCalcListening(false);
    if(e?.error!=="aborted")setCalcMessage("Microphone error: "+String(e?.error||"unknown"));
  };
  recognition.onend=()=>{setCalcListening(false);calcRecognitionRef.current=null};
  recognition.start();
 }

 function stopCalcVoiceLive(){calcRecognitionRef.current?.stop?.();setCalcListening(false)}

 async function startCalcVoiceRecording(){
  setCalcMessage("");
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const candidates=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/aac"];
    const mimeType=candidates.find(t=>typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported?.(t))||"";
    const recorder=mimeType?new MediaRecorder(stream,{mimeType}):new MediaRecorder(stream);
    calcMediaRecorderRef.current=recorder;
    calcAudioChunksRef.current=[];

    recorder.ondataavailable=e=>{if(e.data&&e.data.size>0)calcAudioChunksRef.current.push(e.data)};
    recorder.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      calcMediaRecorderRef.current=null;
      setCalcListening(false);

      const blob=new Blob(calcAudioChunksRef.current,{type:recorder.mimeType||"audio/mp4"});
      calcAudioChunksRef.current=[];

      if(blob.size<800){setCalcMessage("Запис надто короткий. Спробуй ще раз.");return}

      setCalcTranscribing(true);
      try{
        const ext=(recorder.mimeType||"").includes("webm")?"webm":(recorder.mimeType||"").includes("aac")?"aac":"mp4";
        const form=new FormData();
        form.append("audio",blob,`voice.${ext}`);

        const response=await fetch("/api/transcribe",{method:"POST",body:form});
        const data=await response.json();
        if(!response.ok)throw new Error(data?.error||"Не вдалося розпізнати мову.");

        const text=String(data.text||"").trim();
        if(text)setCalcPrompt(p=>[p.trim(),text].filter(Boolean).join(" ").trim());
        else setCalcMessage("Не вдалося розпізнати мову. Спробуй ще раз, говорячи чіткіше.");
      }catch(err){
        setCalcMessage(err instanceof Error?err.message:"Помилка транскрибування.");
      }finally{
        setCalcTranscribing(false);
      }
    };

    recorder.start(1000);
    setCalcListening(true);
  }catch{
    setCalcListening(false);
    setCalcMessage("Не вдалося отримати доступ до мікрофона. Дозволь доступ у Налаштування → Safari → Мікрофон.");
  }
 }

 function saveNoteTemplates(next:NoteTemplate[]){
   setNoteTemplates(next);
   try{localStorage.setItem(NTK,JSON.stringify(next))}catch{}
   if(user&&notesCloudOk.current){
     supabase.from("user_note_templates").upsert({user_id:user.id,templates:next,updated_at:new Date().toISOString()},{onConflict:"user_id"})
       .then(({error})=>{if(error&&!missingNotesTable(error))setCalcMessage("Не вдалося зберегти шаблони: "+error.message)});
   }
 }
 function insertNoteTemplate(t:NoteTemplate){
   setCalcNotes(n=>{const cur=n.trim();return cur?`${cur}\n\n${t.text}`:t.text});
 }
 function addNoteTemplate(){
   const el=notesRef.current;
   const sel=el&&el.selectionEnd>el.selectionStart?calcNotes.slice(el.selectionStart,el.selectionEnd).trim():"";
   const text=sel||calcNotes.trim();
   if(!text){setCalcMessage("Спочатку напиши або виділи текст у нотатках.");return}
   const name=noteTplName.trim()||text.slice(0,40);
   saveNoteTemplates([...noteTemplates,{id:crypto.randomUUID(),name,text}]);
   setNoteTplName("");
   setCalcMessage(sel?"Виділений текст збережено як шаблон.":"Весь текст нотаток збережено як шаблон.");
 }
 function removeNoteTemplate(id:string){
   saveNoteTemplates(noteTemplates.filter(t=>t.id!==id));
 }

 function stopCalcVoiceRecording(){calcMediaRecorderRef.current?.stop?.()}

 async function generateCalc(){
  if(!calcPrompt.trim()){setCalcMessage("Спочатку опиши роботу.");return}
  setCalcThinking(true);setCalcMessage("");
  try{
    const response=await fetch("/api/parse-calculator-estimate",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:calcPrompt,tasks:calcTasks})
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data?.error||"AI request failed.");

    const aiItems=(data.items||[]) as CalcAIItem[];
    const items:CalcItem[]=aiItems.map(ai=>{
      const aiId=legacyIdMap[ai.taskId]||ai.taskId; // AI може повернути старий id
      const task=calcTasks.find(t=>t.id===aiId);
      const blank:CalcItem={id:crypto.randomUUID(),taskId:"",name:ai.description,category:"Custom",unit:ai.unit,quantity:Number(ai.quantity)||1,difficulty:ai.difficulty||"standard",laborRate:0,materialRate:0,suppliesPct:0,suppliesFixed:0,minPrice:0,difficultyMultipliers:{basic:1,standard:1,difficult:1},lowMult:0.85,highMult:1.25,notes:"",note:ai.note||undefined,confidence:ai.confidence,...(ai.optional?{optional:true}:{})};
      if(!task){const sp=Number(ai.statedPrice);return sp>0?{...blank,laborRate:Math.round((ai.statedPriceType==="total"?sp/(blank.quantity||1):sp)*10000)/10000,laborOwn:true}:blank}
      // пакетні ставки — вже пакетні: «basic» на них не застосовуємо (підстраховка до серверної перевірки)
      const difficulty=/^(br|kp)_/.test(task.id)&&ai.difficulty==="basic"?"standard":(ai.difficulty||"standard");
      const supplied=(ai as any).customerSupplied===true;
      const item:CalcItem={...applyCalcTask(blank,task),quantity:Number(ai.quantity)||1,difficulty,note:ai.note||undefined,confidence:ai.confidence,...(supplied?{finishRate:0,finishOwn:true}:{}),...(ai.optional?{optional:true}:{})};
      // ціна, яку власник сам назвав у тексті, — своя ставка цього рядка
      const sp=Number(ai.statedPrice);
      if(ai.includedInStated)return{...item,laborRate:0,laborOwn:true,difficulty:"standard",minPrice:0};
      if(sp>0){
        // 4 знаки, щоб $120 на 34 lin ft дало рівно $120.00, а не $120.02
        const rate=ai.statedPriceType==="total"?sp/(item.quantity||1):sp;
        return{...item,laborRate:Math.round(rate*10000)/10000,laborOwn:true,difficulty:"standard",minPrice:0};
      }
      return item;
    });

    setCalcItems(items);
    const custom=items.filter(i=>!i.taskId).length;
    setCalcMessage(custom?`${custom} робіт не знайдено в бібліотеці цін — оберіть завдання вручну.`:"AI розібрав опис. Перевір позиції, кількість і складність.");
  }catch(error){
    setCalcMessage(error instanceof Error?error.message:"AI error.");
  }finally{
    setCalcThinking(false);
  }
 }

 function calcEstimateAsText(){
   const lines:string[]=[];
   lines.push("CONSTRUCTION ESTIMATE");
   lines.push("======================");
   lines.push("Client: "+(calcClient||"—"));
   lines.push("Project: "+(calcProject||"—"));
   lines.push("Location multiplier: "+calcLocationMultiplier);
   lines.push("");
   lines.push("LINE ITEMS");
   lines.push("----------");
   calcItems.forEach(li=>{
     const c=computeCalcLine(li,calcLocationMultiplier,calcIncludeFinish);
     lines.push(`${li.optional?"[OPTIONAL, not in total] ":""}${li.name} — ${li.quantity} ${unitLabel(li.unit)} (${li.difficulty})  →  ${money(c.lineTotal)}  [range ${money(c.low)}–${money(c.high)}]`);
     if(li.note)lines.push("   note: "+li.note);
   });
   lines.push("");
   lines.push("TOTALS");
   lines.push("------");
   lines.push("Labor: "+money(calcTotalsValue.labor));
   lines.push("Materials: "+money(calcTotalsValue.materials));
   if(calcTotalsValue.finish>0)lines.push("Finish allowance (basic grade): "+money(calcTotalsValue.finish));
   if(calcTotalsValue.supplies>0)lines.push("Supplies/equipment: "+money(calcTotalsValue.supplies));
   lines.push("Subtotal: "+money(calcTotalsValue.lineTotal));
   if(calcDiscount>0){lines.push(calcDiscountLabel+": -"+money(calcDiscount));lines.push("Total: "+money(calcGrandTotal));}
   lines.push("Estimated range: "+money(Math.max(0,calcTotalsValue.low-calcDiscount))+" – "+money(Math.max(0,calcTotalsValue.high-calcDiscount)));
   lines.push("");
   lines.push("NOTES / EXCLUSIONS");
   lines.push("-------------------");
   lines.push(calcNotes||"");
   return lines.join("\n");
 }

 function copyCalcAsText(){
   const text=calcEstimateAsText();
   if(navigator.clipboard&&navigator.clipboard.writeText){
     navigator.clipboard.writeText(text).then(
       ()=>setCalcMessage("Кошторис скопійовано як текст."),
       ()=>setCalcMessage(text)
     );
   }else{
     setCalcMessage(text);
   }
 }

 const [calcPdfBusy,setCalcPdfBusy]=useState(false);
 async function makeCalcPdf(){
   return buildCalcPdf({client:calcClient,project:calcProject,locationMultiplier:calcLocationMultiplier,items:calcItems,totals:calcTotalsValue,discount:calcDiscount,discountLabel:calcDiscountLabel,grandTotal:calcGrandTotal,includeFinish:calcIncludeFinish,notes:calcNotes});
 }
 // Список закупівлі для власника: усі роботи, округлено до цілих упаковок
 async function downloadShoppingPdf(){
   if(!calcItems.length){setCalcMessage("Спочатку додай позиції.");return}
   setCalcPdfBusy(true);
   try{
     const list=buildShoppingList(calcItems.map(i=>({taskId:i.taskId,name:i.name,quantity:i.quantity,finishRate:i.finishRate})),calcIncludeFinish);
     if(!list.stores.length){setCalcMessage("Для цих позицій немає переліку товарів.");return}
     const blob=await buildShoppingPdf({project:calcProject,client:calcClient,list});
     const url=URL.createObjectURL(blob);
     const a=document.createElement("a");a.href=url;a.download=pdfFileName("Shopping list "+(calcProject||""),calcClient);document.body.appendChild(a);a.click();a.remove();
     setTimeout(()=>URL.revokeObjectURL(url),10000);
   }catch(e){setCalcMessage("Не вдалося зробити список: "+(e instanceof Error?e.message:String(e)))}
   finally{setCalcPdfBusy(false)}
 }
 // Завантажити PDF — на комп'ютері; Надіслати — на телефоні відкриває меню
 // «Поділитись» (Messages, WhatsApp, Mail), де ця кнопка є, інакше просто зберігає.
 async function downloadCalcPdf(){
   if(!calcItems.length){setCalcMessage("Спочатку додай позиції.");return}
   setCalcPdfBusy(true);
   try{
     const blob=await makeCalcPdf();
     const url=URL.createObjectURL(blob);
     const a=document.createElement("a");a.href=url;a.download=pdfFileName(calcProject,calcClient);document.body.appendChild(a);a.click();a.remove();
     setTimeout(()=>URL.revokeObjectURL(url),10000);
   }catch(e){setCalcMessage("Не вдалося зробити PDF: "+(e instanceof Error?e.message:String(e)))}
   finally{setCalcPdfBusy(false)}
 }
 async function shareCalcPdf(){
   if(!calcItems.length){setCalcMessage("Спочатку додай позиції.");return}
   setCalcPdfBusy(true);
   try{
     const blob=await makeCalcPdf();
     const file=new File([blob],pdfFileName(calcProject,calcClient),{type:"application/pdf"});
     const nav=navigator as Navigator&{canShare?:(d:ShareData)=>boolean};
     if(nav.share&&nav.canShare&&nav.canShare({files:[file]})){
       await nav.share({files:[file],title:calcProject||"Estimate"});
     }else{
       const url=URL.createObjectURL(blob);
       const a=document.createElement("a");a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
       setTimeout(()=>URL.revokeObjectURL(url),10000);
       setCalcMessage("Цей браузер не вміє ділитися файлами — PDF збережено в Завантаження.");
     }
   }catch(e){
     const msg=e instanceof Error?e.message:String(e);
     if(!/abort/i.test(msg))setCalcMessage("Не вдалося надіслати PDF: "+msg);
   }finally{setCalcPdfBusy(false)}
 }

 function printCalcEstimate(){
   const printWindow=window.open("","_blank");
   if(!printWindow){
     alert("Safari заблокував нове вікно. Дозвольте pop-ups і спробуйте ще раз.");
     return;
   }

   const esc=(value:unknown)=>String(value??"")
     .replace(/&/g,"&amp;")
     .replace(/</g,"&lt;")
     .replace(/>/g,"&gt;")
     .replace(/"/g,"&quot;")
     .replace(/'/g,"&#039;");

   const rows=calcItems.map(li=>{
     const c=computeCalcLine(li,calcLocationMultiplier,calcIncludeFinish);
     return`
     <tr>
       <td><strong>${esc(li.name)}</strong>${li.optional?` <em>(optional, not in total)</em>`:""}${li.note?`<div class="note">${esc(li.note)}</div>`:""}</td>
       <td>${esc(li.quantity)} ${esc(unitLabel(li.unit))}</td>
       <td>${esc(li.difficulty)}</td>
       <td>${esc(money(c.lineTotal))}</td>
     </tr>`;
   }).join("");

   const html=`
   <!doctype html>
   <html>
   <head>
     <meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${esc(calcProject||"Estimate")}</title>
     <style>
       body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#101828;margin:0;padding:24px}
       h1{margin:0 0 8px}
       .meta{line-height:1.6;margin-bottom:22px}
       table{width:100%;border-collapse:collapse}
       th,td{border-bottom:1px solid #d0d5dd;padding:10px 5px;text-align:left;vertical-align:top}
       th{font-size:12px;color:#475467}
       .note{font-size:11px;color:#667085;margin-top:4px}
       .totals{width:290px;margin:24px 0 0 auto}
       .totals div{display:flex;justify-content:space-between;padding:6px 0}
       .grand{border-top:2px solid #101828;margin-top:6px;padding-top:12px!important;font-size:20px;font-weight:800}
       @media print{body{padding:0}}
     </style>
   </head>
   <body>
     <h1>${esc(calcProject||"Estimate")}</h1>
     <div class="meta">${calcClient?`<div><strong>Client:</strong> ${esc(calcClient)}</div>`:""}</div>
     <table>
       <thead><tr><th>Description</th><th>Quantity</th><th>Difficulty</th><th>Total</th></tr></thead>
       <tbody>${rows}</tbody>
     </table>
     <div class="totals">
       <div><span>Labor</span><span>${esc(money(calcTotalsValue.labor))}</span></div>
       <div><span>Materials</span><span>${esc(money(calcTotalsValue.materials))}</span></div>
       ${calcTotalsValue.finish>0?`<div><span>Finish allowance (basic grade)</span><span>${esc(money(calcTotalsValue.finish))}</span></div>`:""}
       ${calcTotalsValue.supplies>0?`<div><span>Supplies</span><span>${esc(money(calcTotalsValue.supplies))}</span></div>`:""}
       <div${calcDiscount>0?"":' class="grand"'}><span>Subtotal</span><span>${esc(money(calcTotalsValue.lineTotal))}</span></div>
       ${calcDiscount>0?`<div><span>${esc(calcDiscountLabel)}</span><span>−${esc(money(calcDiscount))}</span></div><div class="grand"><span>Total</span><span>${esc(money(calcGrandTotal))}</span></div>`:""}
       <div><strong>Estimated range</strong><strong>${esc(money(Math.max(0,calcTotalsValue.low-calcDiscount)))} – ${esc(money(Math.max(0,calcTotalsValue.high-calcDiscount)))}</strong></div>
     </div>
     ${calcNotes.trim()?`<div class="notes" style="margin-top:24px;font-size:12px;line-height:1.5;color:#333;white-space:pre-wrap;border-top:1px solid #ddd;padding-top:12px"><strong>Notes &amp; exclusions</strong><br/>${esc(calcNotes.trim())}</div>`:""}
     <script>window.addEventListener("load",function(){setTimeout(function(){window.print();},500);});</script>
   </body>
   </html>`;

   printWindow.document.open();
   printWindow.document.write(html);
   printWindow.document.close();
 }

 useEffect(()=>{
   let active=true;

   supabase.auth.getSession().then(({data})=>{
     if(!active)return;
     setUser(data.session?.user??null);
     setAuthLoading(false);
   });

   const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
     setUser(session?.user??null);

     if(event==="PASSWORD_RECOVERY"){
       setRecoveryMode(true);
       setMessage("Введи новий пароль.");
     }

     setAuthLoading(false);
   });

   return()=>{
     active=false;
     subscription.unsubscribe();
   };
 },[]);


 useEffect(()=>{
   if(!user)return;

   const channel=supabase
     .channel(`user-prices-${user.id}`)
     .on(
       "postgres_changes",
       {
         event:"*",
         schema:"public",
         table:"user_prices",
         filter:`user_id=eq.${user.id}`
       },
       payload=>{
         const row=payload.new as {prices_data?:PriceRule[]};

         if(row?.prices_data){
           const merged=mergeSavedPrices(row.prices_data);
           setPrices(merged);
           localStorage.setItem(PK,JSON.stringify(merged));
         }
       }
     )
     .subscribe();

   return()=>{
     supabase.removeChannel(channel);
   };
 },[user]);

 // Шаблони нотаток з акаунта (таблиця user_note_templates). Нема таблиці — працюємо локально.
 useEffect(()=>{
   if(!user)return;
   let active=true;
   supabase.from("user_note_templates").select("templates").eq("user_id",user.id).maybeSingle()
     .then(({data,error})=>{
       if(!active)return;
       if(error){notesCloudOk.current=false;return}
       notesCloudOk.current=true;
       const cloud=data?.templates as NoteTemplate[]|undefined;
       if(Array.isArray(cloud)&&cloud.length){
         setNoteTemplates(cloud);
         try{localStorage.setItem(NTK,JSON.stringify(cloud))}catch{}
       }else{
         const local=load<NoteTemplate[]>(NTK,DEFAULT_NOTE_TEMPLATES);
         supabase.from("user_note_templates").upsert({user_id:user.id,templates:local,updated_at:new Date().toISOString()},{onConflict:"user_id"}).then(()=>{});
       }
     });
   return()=>{active=false};
 },[user]);

 useEffect(()=>{
   if(!user)return;

   const loadLatestPrices=async()=>{
     const {data,error}=await supabase
       .from("user_prices")
       .select("prices_data")
       .eq("user_id",user.id)
       .maybeSingle();

     if(error){
       setMessage("Не вдалося оновити ціни: "+error.message);
       return;
     }

     if(data?.prices_data){
       const latest=mergeSavedPrices(data.prices_data as PriceRule[]);
       setPrices(latest);
       localStorage.setItem(PK,JSON.stringify(latest));
     }
   };

   loadLatestPrices();

   const refresh=()=>{
     if(document.visibilityState==="visible"){
       loadLatestPrices();
     }
   };

   window.addEventListener("focus",loadLatestPrices);
   document.addEventListener("visibilitychange",refresh);

   return()=>{
     window.removeEventListener("focus",loadLatestPrices);
     document.removeEventListener("visibilitychange",refresh);
   };
 },[user,screen]);

 useEffect(()=>{
   if(!user)return;

   let active=true;

   const loadCloudEstimates=async()=>{
     setAuthLoading(true);

     const {data,error}=await supabase
       .from("estimates")
       .select("estimate_data")
       .eq("user_id",user.id)
       .order("updated_at",{ascending:false});

     if(!active)return;

     if(error){
       setMessage("Не вдалося завантажити estimates: "+error.message);
       setAuthLoading(false);
       return;
     }

     let cloudEstimates=(data??[]).map(
       row=>row.estimate_data as Estimate
     );

     const localEstimates=load<Estimate[]>(EK,[]);

     if(cloudEstimates.length===0&&localEstimates.length>0){
       const rows=localEstimates.map(estimate=>({
         id:estimate.id,
         user_id:user.id,
         estimate_data:estimate,
         share_token:estimate.shareToken??null,
         status:estimate.status??"draft",
         updated_at:new Date().toISOString()
       }));

       const {error:uploadError}=await supabase
         .from("estimates")
         .upsert(rows,{onConflict:"id"});

       if(uploadError){
         setMessage("Не вдалося перенести старі estimates: "+uploadError.message);
       }else{
         cloudEstimates=localEstimates;
         setMessage("Старі estimates перенесено у хмару.");
       }
     }

     setAll(cloudEstimates);
     localStorage.setItem(EK,JSON.stringify(cloudEstimates));

     const {data:priceRow,error:priceError}=await supabase
       .from("user_prices")
       .select("prices_data")
       .eq("user_id",user.id)
       .maybeSingle();

     if(priceError){
       setMessage("Не вдалося завантажити ціни: "+priceError.message);
     }else if(priceRow?.prices_data){
       const cloudPrices=mergeSavedPrices(priceRow.prices_data as PriceRule[]);
       setPrices(cloudPrices);
       localStorage.setItem(PK,JSON.stringify(cloudPrices));
     }else{
       const localPrices=load<PriceRule[]>(PK,defaults);

       const {error:uploadPriceError}=await supabase
         .from("user_prices")
         .upsert({
           user_id:user.id,
           prices_data:localPrices,
           updated_at:new Date().toISOString()
         },{onConflict:"user_id"});

       if(uploadPriceError){
         setMessage("Не вдалося перенести ціни у хмару: "+uploadPriceError.message);
       }
     }

     // Старі ціни калькулятора в акаунті (user_calc_prices) переносимо у Prices один раз і обнуляємо.
     const {data:calcRow,error:calcError}=await supabase
       .from("user_calc_prices")
       .select("calc_overrides")
       .eq("user_id",user.id)
       .maybeSingle();
     if(!calcError&&calcRow?.calc_overrides&&Object.keys(calcRow.calc_overrides as object).length){
       setPrices(prev=>{
         const migrated=applyLegacyCalcOverrides(prev,calcRow.calc_overrides as CalcOverrides);
         supabase.from("user_prices").upsert({user_id:user.id,prices_data:migrated,updated_at:new Date().toISOString()},{onConflict:"user_id"})
           .then(({error})=>{if(!error)supabase.from("user_calc_prices").update({calc_overrides:{},updated_at:new Date().toISOString()}).eq("user_id",user.id).then(()=>{});});
         try{localStorage.setItem(PK,JSON.stringify(migrated))}catch{}
         return migrated;
       });
     }else if(calcError&&!missingCalcTable(calcError)){
       setMessage("Не вдалося перевірити старі ціни калькулятора: "+calcError.message);
     }

     setAuthLoading(false);
   };

   loadCloudEstimates();

   return()=>{
     active=false;
   };
 },[user]);

 const estIncludeFinish=cur.includeFinish!==false;
 const estTotals=useMemo(()=>estimateTotals(cur.items,estIncludeFinish),[cur.items,estIncludeFinish]);
 const subtotal=estTotals.subtotal;
 const discount=Math.min(subtotal,cur.discount||0);
 const tax=(subtotal-discount)*(cur.tax||0)/100;
 const total=subtotal-discount+tax;
 const deposit=total*(cur.deposit||0)/100;
 const saveAll=async(x:Estimate[])=>{
   setAll(x);
   localStorage.setItem(EK,JSON.stringify(x));

   if(!user)return;

   const rows=x.map(estimate=>({
     id:estimate.id,
     user_id:user.id,
     estimate_data:estimate,
     share_token:estimate.shareToken??null,
     status:estimate.status??"draft",
     updated_at:new Date().toISOString()
   }));

   const {error}=await supabase
     .from("estimates")
     .upsert(rows,{onConflict:"id"});

   if(error){
     setMessage("Кошторис збережено на пристрої, але не в хмарі: "+error.message);
   }
 };
 const deleteEstimate=async(id:string)=>{
   const next=all.filter(x=>x.id!==id);

   setAll(next);
   localStorage.setItem(EK,JSON.stringify(next));

   if(!user)return;

   const {error}=await supabase
     .from("estimates")
     .delete()
     .eq("id",id)
     .eq("user_id",user.id);

   if(error){
     setMessage("Не вдалося видалити estimate з хмари: "+error.message);
     return;
   }

   setMessage("Estimate видалено.");
 };

 const savePrices=async(x:PriceRule[]):Promise<string>=>{
   if(x.some(p=>!validPrice(p)))throw new Error("Ціна має бути числом від 0 і вище.");
   if(!user)throw new Error("Увійди в акаунт для збереження цін.");
   const {error}=await supabase.from("user_prices").upsert({
     user_id:user.id,prices_data:x,updated_at:new Date().toISOString()
   },{onConflict:"user_id"}).abortSignal(AbortSignal.timeout(15000));
   if(error)throw new Error("Не вдалося зберегти ціни в акаунті. Зміни залишилися у формі; спробуй ще раз. "+error.message);
   setPrices(x);
   try{localStorage.setItem(PK,JSON.stringify(x))}
   catch{return "Ціни збережено в акаунті. Локальна копія недоступна."}
   return "Ціни збережено в акаунті.";
 };
 const value=(e:Estimate)=>estimateTotals(e.items,e.includeFinish!==false).subtotal;


 const signUp=async()=>{
   if(!email.trim()||!password){
     setMessage("Введи email і пароль.");
     return;
   }

   setAuthLoading(true);

   const {error}=await supabase.auth.signUp({
     email:email.trim(),
     password
   });

   setAuthLoading(false);

   if(error){
     setMessage(error.message);
     return;
   }

   setMessage("Акаунт створено. Перевір email для підтвердження.");
 };

 const signIn=async()=>{
   if(!email.trim()||!password){
     setMessage("Введи email і пароль.");
     return;
   }

   setAuthLoading(true);

   const {error}=await supabase.auth.signInWithPassword({
     email:email.trim(),
     password
   });

   setAuthLoading(false);

   if(error){
     setMessage(error.message);
     return;
   }

   setPassword("");
   setMessage("Вхід виконано.");
 };


 const resetPassword=async()=>{
   if(!email.trim()){
     setMessage("Введи email.");
     return;
   }

   setAuthLoading(true);

   const {error}=await supabase.auth.resetPasswordForEmail(
     email.trim(),
     {
       redirectTo:window.location.origin
     }
   );

   setAuthLoading(false);

   if(error){
     setMessage(error.message);
     return;
   }

   setMessage("Лист для скидання пароля надіслано. Перевір email.");
 };


 const updatePassword=async()=>{
   if(newPassword.length<6){
     setMessage("Новий пароль має містити щонайменше 6 символів.");
     return;
   }

   setAuthLoading(true);

   const {error}=await supabase.auth.updateUser({
     password:newPassword
   });

   setAuthLoading(false);

   if(error){
     setMessage(error.message);
     return;
   }

   setNewPassword("");
   setRecoveryMode(false);
   setMessage("Пароль успішно змінено.");
 };

 const signOut=async()=>{
   await supabase.auth.signOut();
   setUser(null);
   setMessage("Ти вийшов з акаунта.");
 };

 function start(){
  jobRevision.current++;
  recognitionRef.current?.abort?.();
  mediaRecorderRef.current?.stop?.();
  setCur(fresh());setPrompt("");setMessage("");setListening(false);setTranscribing(false);setScreen("new");
 }

 function needsRecorderFallback(){
  if(typeof window==="undefined")return false;
  const ua=navigator.userAgent||"";
  const isIOS=/iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
  const w=window as typeof window&{SpeechRecognition?:unknown;webkitSpeechRecognition?:unknown};
  const hasLiveApi=Boolean(w.SpeechRecognition||w.webkitSpeechRecognition);
  return isIOS||!hasLiveApi;
 }

 function startVoice(){
  // The same transcription path on iPhone and desktop understands mixed vocabulary.
  startVoiceRecording();
 }

 function stopVoice(){
  if(mediaRecorderRef.current)stopVoiceRecording();
  else stopVoiceLive();
 }

 function startVoiceLive(){
  setMessage("");
  const w=window as typeof window&{SpeechRecognition?:new()=>any;webkitSpeechRecognition?:new()=>any};
  const Ctor=w.SpeechRecognition||w.webkitSpeechRecognition;
  if(!Ctor){setMessage("Цей браузер не підтримує Voice. На Mac відкрий сайт у Chrome.");return}

  const recognition=new Ctor();
  recognitionRef.current=recognition;
  baseRef.current=prompt.trim();
  finalRef.current="";
  recognition.lang="uk-UA";
  recognition.continuous=true;
  recognition.interimResults=true;

  recognition.onstart=()=>setListening(true);
  recognition.onresult=(event:any)=>{
    let interim="";
    for(let i=event.resultIndex;i<event.results.length;i++){
      const part=String(event.results[i][0].transcript||"").trim();
      if(event.results[i].isFinal)finalRef.current=(finalRef.current+" "+part).trim();
      else interim=(interim+" "+part).trim();
    }
    const spoken=[finalRef.current,interim].filter(Boolean).join(" ");
    setPrompt([baseRef.current,spoken].filter(Boolean).join(" ").trim());
  };
  recognition.onerror=(e:any)=>{
    setListening(false);
    if(e?.error!=="aborted")setMessage("Microphone error: "+String(e?.error||"unknown"));
  };
  recognition.onend=()=>{setListening(false);recognitionRef.current=null};
  recognition.start();
 }

 function stopVoiceLive(){recognitionRef.current?.stop?.();setListening(false)}

 async function startVoiceRecording(){
  const revision=jobRevision.current;
  setMessage("");
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const candidates=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/aac"];
    const mimeType=candidates.find(t=>typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported?.(t))||"";
    const recorder=mimeType?new MediaRecorder(stream,{mimeType}):new MediaRecorder(stream);
    if(revision!==jobRevision.current){stream.getTracks().forEach(t=>t.stop());return}
    mediaRecorderRef.current=recorder;
    audioChunksRef.current=[];
    let recordingBytes=0;
    const limitTimer=window.setTimeout(()=>{if(recorder.state==="recording")recorder.stop()},90000);

    recorder.ondataavailable=e=>{if(e.data&&e.data.size>0){
      audioChunksRef.current.push(e.data);recordingBytes+=e.data.size;
      if(recordingBytes>2800000&&recorder.state==="recording")recorder.stop();
    }};
    recorder.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      window.clearTimeout(limitTimer);
      mediaRecorderRef.current=null;
      setListening(false);
      if(revision!==jobRevision.current)return;

      const blob=new Blob(audioChunksRef.current,{type:recorder.mimeType||"audio/mp4"});
      audioChunksRef.current=[];

      if(blob.size<800){setMessage("Запис надто короткий. Спробуй ще раз.");return}

      setTranscribing(true);
      try{
        const ext=(recorder.mimeType||"").includes("webm")?"webm":(recorder.mimeType||"").includes("aac")?"aac":"mp4";
        const form=new FormData();
        form.append("audio",blob,`voice.${ext}`);

        const response=await fetch("/api/transcribe",{method:"POST",body:form});
        const data=await response.json();
        if(!response.ok)throw new Error(data?.error||"Не вдалося розпізнати мову.");

        const text=String(data.text||"").trim();
        if(revision!==jobRevision.current)return;
        if(text)setPrompt(p=>[p.trim(),text].filter(Boolean).join(" ").trim());
        else setMessage("Не вдалося розпізнати мову. Спробуй ще раз, говорячи чіткіше.");
      }catch(err){
        setMessage(err instanceof Error?err.message:"Помилка транскрибування.");
      }finally{
        setTranscribing(false);
      }
    };

    recorder.start(1000);
    setListening(true);
  }catch{
    setListening(false);
    setMessage("Не вдалося отримати доступ до мікрофона. Дозволь доступ у Налаштування → Safari → Мікрофон.");
  }
 }

 function stopVoiceRecording(){mediaRecorderRef.current?.stop?.()}

 async function addPhotos(files:File[]){
  const revision=jobRevision.current;
  setPhotoBusy(true);setMessage("");
  try{
    if(photos.length+files.length>4)throw new Error("Можна додати до 4 фото.");
    const prepared=await Promise.all(files.map(prepareJobPhoto));
    if(revision===jobRevision.current)setPhotos(p=>[...p,...prepared]);
  }catch(error){setMessage(error instanceof Error?error.message:"Не вдалося додати фото.")}
  finally{setPhotoBusy(false)}
 }

 async function generate(measurementNotes?:string){
  const revision=jobRevision.current;
  if(!prompt.trim()&&!photos.length){setMessage("Спочатку опиши роботу.");return}
  setThinking(true);setMessage("");
  try{
    const response=await fetch("/api/parse-estimate",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:prompt,prices,photos:photos.map(p=>p.dataUrl),measurementNotes:measurementNotes||""})
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data?.error||"AI request failed.");

    if(revision!==jobRevision.current)return;
    const pending=Array.isArray(data.questions)?data.questions:[];
    setQuestions(pending);
    if(pending.length){setMessage("Додай відповіді до опису голосом або текстом і натисни ще раз. Попередній кошторис поки не змінено.");return}
    const aiItems=(data.items||[]) as AIItem[];
    const items:Item[]=aiItems.map(ai=>{
      const service=prices.find(p=>p.id===ai.serviceId);
      return{
        id:crypto.randomUUID(),
        serviceId:ai.serviceId,
        description:ai.description,
        quantity:Number(ai.quantity)||1,
        unit:ai.unit,
        unitPrice:typeof ai.explicitRate==="number"&&Number.isFinite(ai.explicitRate)&&ai.explicitRate>=0?ai.explicitRate:service?.rate||0,
        materialRate:service?.materialRate||0,
        finishRate:(ai as any).customerSupplied===true?0:(service?.finishRate||0),
        note:ai.note||undefined,
        confidence:ai.confidence
      };
    });

    setCur(c=>({...c,items,preliminary:Boolean(measurementNotes),measurementNotes:measurementNotes||undefined}));
    const custom=items.filter(i=>i.unitPrice===0).length;
    setMessage(custom?`${custom} робіт не знайдено в бібліотеці цін — перевір їх вручну.`:"AI розібрав опис. Перевір позиції та ціни.");
  }catch(error){
    setMessage(error instanceof Error?error.message:"AI error.");
  }finally{
    setThinking(false);
  }
 }

 const update=(id:string,p:Partial<Item>)=>setCur(c=>({...c,items:c.items.map(i=>i.id===id?{...i,...p}:i)}));
 const remove=(id:string)=>setCur(c=>({...c,items:c.items.filter(i=>i.id!==id)}));
 const add=()=>setCur(c=>({...c,items:[...c.items,{id:crypto.randomUUID(),serviceId:"CUSTOM",description:"",quantity:1,unit:"each",unitPrice:0}]}));
 const save=()=>{
   if(!cur.items.length){setMessage("Немає позицій для збереження.");return}
   if(cur.items.some(i=>!i.description.trim()||i.quantity<=0||i.unitPrice<0)){setMessage("Перевір назву, кількість і ціну кожної позиції.");return}
   const next=[cur,...all.filter(e=>e.id!==cur.id)];saveAll(next);setScreen("saved");
 };

 const statusLabel=(s?:EstimateStatus)=>({draft:"Чернетка",sent:"Надіслано",viewed:"Переглянуто",accepted:"Прийнято"}[s||"draft"]);

 const shareEstimate=async()=>{
   if(!user){setMessage("Увійди в акаунт, щоб надіслати посилання клієнту.");return}
   if(!cur.items.length){setMessage("Немає позицій для збереження.");return}
   if(cur.items.some(i=>!i.description.trim()||i.quantity<=0||i.unitPrice<0)){setMessage("Перевір назву, кількість і ціну кожної позиції.");return}

   const token=cur.shareToken||crypto.randomUUID();
   const updated:Estimate={...cur,shareToken:token,status:cur.status==="accepted"?cur.status:"sent"};
   setCur(updated);
   const next=[updated,...all.filter(e=>e.id!==updated.id)];
   await saveAll(next);

   const link=`${window.location.origin}/e/${token}`;
   let copied=false;
   try{
     await navigator.clipboard.writeText(link);
     copied=true;
   }catch{}

   setMessage(copied?`Посилання для клієнта скопійовано: ${link}`:`Посилання для клієнта: ${link}`);

   const nav=navigator as Navigator&{share?:(data:{title?:string;text?:string;url?:string})=>Promise<void>};
   if(nav.share){
     try{
       await nav.share({title:updated.project||"Estimate",text:`Кошторис для ${updated.client||"клієнта"}`,url:link});
     }catch{}
   }
 };

 const duplicate=(estimate:Estimate)=>{
   const copy:Estimate={
     ...estimate,
     id:crypto.randomUUID(),
     createdAt:new Date().toISOString(),
     shareToken:undefined,
     status:"draft"
   };
   setCur(copy);
   setScreen("new");
 };


 const printEstimate=()=>{
   const printWindow=window.open("","_blank");

   if(!printWindow){
     alert("Safari заблокував нове вікно. Дозвольте pop-ups і спробуйте ще раз.");
     return;
   }

   const esc=(value:unknown)=>String(value??"")
     .replace(/&/g,"&amp;")
     .replace(/</g,"&lt;")
     .replace(/>/g,"&gt;")
     .replace(/"/g,"&quot;")
     .replace(/'/g,"&#039;");

   const rows=cur.items.map(item=>`
     <tr>
       <td>
         <strong>${esc(item.description)}</strong>
         ${item.note?`<div class="note">${esc(item.note)}</div>`:""}
       </td>
       <td>${esc(item.quantity)} ${esc(unitLabel(item.unit))}</td>
       <td>${esc(money(item.unitPrice))}${itemMaterialRate(item)>0?` + ${esc(money(itemMaterialRate(item)))} mat.`:""}${estIncludeFinish&&itemFinishRate(item)>0?` + ${esc(money(itemFinishRate(item)))} finish`:""}</td>
       <td>${esc(money(itemTotal(item,estIncludeFinish)))}</td>
     </tr>
   `).join("");

   const html=`
   <!doctype html>
   <html>
   <head>
     <meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${esc(cur.project||"Estimate")}</title>
     <style>
       body{
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         color:#101828;
         margin:0;
         padding:24px;
       }
       h1{margin:0 0 8px}
       .meta{line-height:1.6;margin-bottom:22px}
       table{width:100%;border-collapse:collapse}
       th,td{
         border-bottom:1px solid #d0d5dd;
         padding:10px 5px;
         text-align:left;
         vertical-align:top;
       }
       th{font-size:12px;color:#475467}
       td:nth-child(2),td:nth-child(3),td:nth-child(4){white-space:nowrap}
       .note{font-size:11px;color:#667085;margin-top:4px}
       .totals{width:290px;margin:24px 0 0 auto}
       .totals div{display:flex;justify-content:space-between;padding:6px 0}
       .grand{
         border-top:2px solid #101828;
         margin-top:6px;
         padding-top:12px!important;
         font-size:20px;
         font-weight:800;
       }
       @media(max-width:600px){
         body{padding:14px}
         table{font-size:11px}
         th,td{padding:8px 3px}
         .totals{width:100%}
       }
       @media print{body{padding:0}}
     </style>
   </head>
   <body>
     <h1>${esc(cur.project||"Estimate")}</h1>
     ${cur.preliminary?`<p><strong>${esc(PRELIMINARY_NOTE)}</strong></p><p style="white-space:pre-wrap">${esc(cur.measurementNotes)}</p>`:""}

     <div class="meta">
       ${cur.client?`<div><strong>Client:</strong> ${esc(cur.client)}</div>`:""}
       ${cur.address?`<div><strong>Address:</strong> ${esc(cur.address)}</div>`:""}
     </div>

     <table>
       <thead>
         <tr>
           <th>Description</th>
           <th>Quantity</th>
           <th>Rate</th>
           <th>Total</th>
         </tr>
       </thead>
       <tbody>${rows}</tbody>
     </table>

     <div class="totals">
       ${estTotals.materials>0||estTotals.finish>0?`<div><span>Labor</span><span>${esc(money(estTotals.labor))}</span></div><div><span>Materials</span><span>${esc(money(estTotals.materials))}</span></div>${estTotals.finish>0?`<div><span>Finish allowance (basic grade)</span><span>${esc(money(estTotals.finish))}</span></div>`:""}`:""}
       <div><span>Subtotal</span><span>${esc(money(subtotal))}</span></div>
       <div><span>Discount</span><span>−${esc(money(discount))}</span></div>
       <div><span>Tax</span><span>${esc(money(tax))}</span></div>
       <div class="grand"><span>Total</span><span>${esc(money(total))}</span></div>
       <div><strong>Required deposit</strong><strong>${esc(money(deposit))}</strong></div>
     </div>

     <script>
       window.addEventListener("load",function(){
         setTimeout(function(){window.print();},500);
       });
     </script>
   </body>
   </html>`;

   printWindow.document.open();
   printWindow.document.write(html);
   printWindow.document.close();
 };


 if(recoveryMode){
   return <div className="shell">
     <header>
       <div>
         <strong>QuoteCraft AI</strong>
         <small>Password recovery</small>
       </div>
       <span className="mark">Q⚡</span>
     </header>

     <main>
       <section className="panel">
         <span className="eyebrow">NEW PASSWORD</span>
         <h1>Створи новий пароль</h1>

         <label>
           New password
           <input
             type="password"
             autoComplete="new-password"
             value={newPassword}
             onChange={e=>setNewPassword(e.target.value)}
             placeholder="Minimum 6 characters"
           />
         </label>

         {message&&<div className="statusMessage">{message}</div>}

         <button
           className="primary full"
           onClick={updatePassword}
           disabled={authLoading}
         >
           {authLoading?"Please wait…":"Save new password"}
         </button>
       </section>
     </main>
   </div>;
 }

 if(authLoading&&!user){
 return <div className="shell">
     <main>
       <section className="panel">
         <h1>QuoteCraft AI</h1>
         <p className="muted">Завантаження акаунта…</p>
       </section>
     </main>
   </div>;
 }

 if(!user){
   return <div className="shell">
     <header>
       <div>
         <strong>QuoteCraft AI</strong>
         <small>Cloud estimates</small>
       </div>
       <span className="mark">Q⚡</span>
     </header>

     <main>
       <section className="panel">
         <span className="eyebrow">ACCOUNT</span>
         <h1>Увійди у свій естіматор</h1>
         <p className="muted">
           Використовуй однаковий email і пароль на Mac та iPhone,
           щоб бачити ті самі estimates.
         </p>

         <div className="grid">
           <label className="wide">
             Email
             <input
               type="email"
               autoComplete="email"
               value={email}
               onChange={e=>setEmail(e.target.value)}
               placeholder="your@email.com"
             />
           </label>

           <label className="wide">
             Password
             <input
               type="password"
               autoComplete="current-password"
               value={password}
               onChange={e=>setPassword(e.target.value)}
               placeholder="Minimum 6 characters"
             />
           </label>
         </div>

         {message&&<div className="statusMessage">{message}</div>}

         <div className="actions">
           <button
             className="secondary"
             onClick={signUp}
             disabled={authLoading}
           >
             Create account
           </button>

           <button
             className="primary"
             onClick={signIn}
             disabled={authLoading}
           >
             {authLoading?"Please wait…":"Sign in"}
           </button>
         </div>

         <button
           className="secondary full"
           onClick={resetPassword}
           disabled={authLoading}
         >
           Forgot password
         </button>
       </section>
     </main>
   </div>;
 }

 return <div className="shell">
  <header><div><strong>QuoteCraft AI</strong><small>Real AI estimate parsing</small></div><span className="mark">Q⚡</span></header>
  <main>
   {screen==="home"&&<>
    <section className="hero"><span>AI VERSION 1.0</span><h1>Скажи, що потрібно зробити.</h1><p>AI розділить роботи, визначить кількість та одиниці. Ціни підставляються тільки з твоєї бібліотеки.</p><button className="primary huge" onClick={start}>＋ New estimate</button><div className="actions" style={{marginTop:10}}><button className="secondary" onClick={()=>setScreen("calc")}>🧮 Calculator (labor + materials)</button></div></section>
    <section className="metrics"><article><span>Estimates</span><b>{all.length}</b></article><article><span>Quoted value</span><b>{money(all.reduce((s,e)=>s+value(e),0))}</b></article></section>
    <section className="panel"><div className="head"><h2>Recent estimates</h2><button onClick={()=>setScreen("saved")}>View all</button></div>{all.length===0?<p className="empty">Ще немає кошторисів.</p>:all.slice(0,3).map(e=><button className="estimate" key={e.id} onClick={()=>{setCur(e);setScreen("new")}}><span><b>{e.client||"Unnamed client"}</b><small>{e.project||"Estimate"}</small></span><strong>{money(value(e))}</strong></button>)}</section>
   </>}

   {screen==="new"&&<>
    <div className="screenbar noPrint"><button onClick={()=>setScreen("home")}>← Back</button><b>New estimate{cur.status&&cur.status!=="draft"&&<span className={`badge badge-${cur.status}`}>{statusLabel(cur.status)}</span>}</b><button onClick={start}>Clear</button></div>
    <section className="assistant noPrint">
      <div className="assisttitle"><span>✨</span><div><b>Опиши роботу простою мовою</b><small>Українська, English або змішано</small></div></div>
      <textarea disabled={thinking} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Замінити кран на кухні, пофарбувати одну стіну, замінити вентилятор і покласти ламінат 35 square feet."/>
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void addPhotos(files)}}/>
      <div className="jobPhotos">{photos.map(p=><figure key={p.id}>
        <img src={p.dataUrl} alt={p.name}/><button type="button" disabled={thinking} aria-label={`Видалити ${p.name}`} onClick={()=>setPhotos(v=>v.filter(x=>x.id!==p.id))}>×</button>
      </figure>)}</div>
      {questions.length>0&&<div className="statusMessage" role="status"><b>Потрібно уточнити</b><ul>{questions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>}
      {message&&<div className="statusMessage" role="status">{message}</div>}
      <div className="actions">
       <button className="secondary" disabled={photoBusy||thinking||photos.length>=4} onClick={()=>photoInput.current?.click()}>{photoBusy?"Готую фото…":"📷 Додати фото"}</button>
       {!listening?<button className="secondary" onClick={startVoice} disabled={transcribing||thinking}>{transcribing?"⏳ Розпізнаю…":"🎤 Voice"}</button>:<button className={mediaRecorderRef.current?"voice recording":"voice listening"} onClick={stopVoice}>{mediaRecorderRef.current?"⏹ Стоп і надіслати":"⏹ Stop"}</button>}
       <button className="primary" onClick={()=>generate()} disabled={listening||thinking||transcribing||photoBusy}>{thinking?"AI is analyzing…":"Generate estimate"}</button>
      </div>
      {photos.length>0&&<PhotoMeasurements key={cur.id+prompt+photos.map(p=>p.id).join("|")} text={prompt} photos={photos.map(p=>p.dataUrl)} disabled={thinking||listening||transcribing||photoBusy} onApprove={notes=>void generate(notes)}/>}
      <p className="recHint">До 4 фото. Фото надсилаються на аналіз разом з описом і не зберігаються в кошторисі. Запис — до 90 секунд; далі можна додиктувати.</p>
      {transcribing&&<div className="recHint">Розпізнаю голос… це займає кілька секунд.</div>}
    </section>

    <section className="panel grid noPrint"><label>Client<input value={cur.client} onChange={e=>setCur({...cur,client:e.target.value})}/></label><label>Project<input value={cur.project} onChange={e=>setCur({...cur,project:e.target.value})}/></label><label className="wide">Address<input value={cur.address} onChange={e=>setCur({...cur,address:e.target.value})}/></label></section>

    {cur.preliminary&&<section className="panel"><b>Попередній кошторис — потрібні заміри на обʼєкті</b><p>{PRELIMINARY_NOTE}</p><details><summary>Підтверджені приблизні розміри</summary><p style={{whiteSpace:"pre-wrap"}}>{cur.measurementNotes}</p></details></section>}
    <section className="panel"><div className="head"><h2>Scope & pricing</h2><button className="add noPrint" onClick={add}>＋ Add item</button></div>
      <ServicePicker prices={prices} onSelect={p=>setCur(c=>({...c,items:[...c.items,{id:crypto.randomUUID(),serviceId:p.id,description:p.name,quantity:1,unit:p.unit,unitPrice:p.rate,materialRate:p.materialRate||0,finishRate:p.finishRate||0}]}))}/>
      {cur.items.length===0?<p className="empty">AI-позиції з’являться тут.</p>:cur.items.map(i=><article className="item" key={i.id}>
       <div className="itemtop"><input value={i.description} onChange={e=>update(i.id,{description:e.target.value})}/><button className="remove noPrint" onClick={()=>remove(i.id)}>×</button></div>
       {prices.find(p=>p.id===i.serviceId)&&<p className="muted noPrint">Діапазон у Prices: ${bounds(prices.find(p=>p.id===i.serviceId)!).min}–${bounds(prices.find(p=>p.id===i.serviceId)!).max} / {unitLabel(i.unit)}. Нижче — вибрана ціна для цього кошторису.</p>}
       {i.note&&<div className="itemNote">ℹ {i.note}</div>}
       {typeof i.confidence==="number"&&i.confidence<.7&&<div className="itemWarning">⚠ Low confidence — verify this item.</div>}
       <div className="itemgrid">
        <label>Quantity<input type="number" min="0" step="0.01" value={i.quantity} onChange={e=>update(i.id,{quantity:Number(e.target.value)})}/></label>
        <label>Unit<select value={i.unit} onChange={e=>update(i.id,{unit:e.target.value as Unit})}><option value="each">each</option><option value="sqft">sq ft</option><option value="hour">hour</option><option value="linear_ft">linear ft</option><option value="room">room</option></select></label>
        <label>Праця, $/од<input type="number" min="0" step="0.01" value={i.unitPrice} onChange={e=>update(i.id,{unitPrice:Number(e.target.value)})}/></label>
        <label>Матеріали, $/од<input type="number" min="0" step="0.01" value={itemMaterialRate(i)} onChange={e=>update(i.id,{materialRate:Math.max(0,Number(e.target.value)||0)})}/></label>
        <label>Оздоблення, $/од<input type="number" min="0" step="0.01" value={itemFinishRate(i)} onChange={e=>update(i.id,{finishRate:Math.max(0,Number(e.target.value)||0)})}/></label>
        <div className="linetotal"><span>Total</span><b>{money(itemTotal(i,estIncludeFinish))}</b></div>
       </div><small>{i.quantity} {unitLabel(i.unit)} × ({money(i.unitPrice)} праця{itemMaterialRate(i)>0?` + ${money(itemMaterialRate(i))} матеріали`:""}{estIncludeFinish&&itemFinishRate(i)>0?` + ${money(itemFinishRate(i))} оздоблення`:""})</small>
      </article>)}
    </section>

    <section className="panel grid3 noPrint"><label>Discount, $<input type="number" value={cur.discount} onChange={e=>setCur({...cur,discount:Number(e.target.value)})}/></label><label>Tax, %<input type="number" value={cur.tax} onChange={e=>setCur({...cur,tax:Number(e.target.value)})}/></label><label>Deposit, %<input type="number" value={cur.deposit} onChange={e=>setCur({...cur,deposit:Number(e.target.value)})}/></label></section>
    <label className="noPrint" style={{display:"flex",gap:8,alignItems:"center",margin:"8px 0"}}><input type="checkbox" checked={estIncludeFinish} onChange={e=>setCur({...cur,includeFinish:e.target.checked})}/>Включити базове оздоблення (плитка, прилади, світильники за цінами Home Depot / Floor &amp; Decor)</label>
    <section className="total">{(estTotals.materials>0||estTotals.finish>0)&&<><div><span>Праця</span><span>{money(estTotals.labor)}</span></div><div><span>Матеріали</span><span>{money(estTotals.materials)}</span></div>{estTotals.finish>0&&<div><span>Оздоблення (базове)</span><span>{money(estTotals.finish)}</span></div>}</>}<div><span>Subtotal</span><span>{money(subtotal)}</span></div><div><span>Discount</span><span>−{money(discount)}</span></div><div><span>Tax</span><span>{money(tax)}</span></div><div className="grand"><span>Total</span><b>{money(total)}</b></div><div><span>Required deposit</span><b>{money(deposit)}</b></div></section>
    {user&&<div className="shareRow noPrint"><button className="secondary" onClick={shareEstimate}>🔗 Copy client link</button></div>}
    <div className="actions noPrint"><button className="secondary" onClick={printEstimate}>PDF / Print</button><button className="primary" onClick={save}>Save estimate</button></div>
   </>}

   {screen==="calc"&&<>
    <div className="screenbar noPrint"><button onClick={()=>setScreen("home")}>← Back</button><b>Calculator</b><button onClick={clearCalc}>Clear</button></div>
    <section className="assistant noPrint">
      <div className="assisttitle"><span>🧮</span><div><b>Опиши роботу простою мовою</b><small>Українська, English або змішано — порахує labor, materials і supplies</small></div></div>
      <textarea value={calcPrompt} onChange={e=>setCalcPrompt(e.target.value)} placeholder="Покласти ламінат 1350 sqft, встановити плінтус і shoe molding 310 linear ft, пофарбувати кімнату 25 на 18 висота 8 футів."/>
      {calcMessage&&<div className="statusMessage">{calcMessage}</div>}
      <div className="actions">
       {!calcListening?<button className="secondary" onClick={startCalcVoice} disabled={calcTranscribing}>{calcTranscribing?"⏳ Розпізнаю…":"🎤 Voice"}</button>:<button className={calcMediaRecorderRef.current?"voice recording":"voice listening"} onClick={stopCalcVoice}>{calcMediaRecorderRef.current?"⏹ Стоп і надіслати":"⏹ Stop"}</button>}
       <button className="primary" onClick={generateCalc} disabled={calcListening||calcThinking||calcTranscribing}>{calcThinking?"AI is analyzing…":"Розрахувати"}</button>
      </div>
      {calcTranscribing&&<div className="recHint">Розпізнаю голос… це займає кілька секунд.</div>}
    </section>

    <section className="panel grid noPrint"><label>Client<input value={calcClient} onChange={e=>setCalcClient(e.target.value)}/></label><label>Project<input value={calcProject} onChange={e=>setCalcProject(e.target.value)}/></label><label>Location multiplier<input type="number" min="0.5" max="3" step="0.01" value={calcLocationMultiplier} onChange={e=>setCalcLocationMultiplier(Number(e.target.value)||1)}/></label><label>Знижка на роботу<select value={calcDiscountType} onChange={e=>setCalcDiscountType(e.target.value as "percent"|"amount")}><option value="percent">відсоток, %</option><option value="amount">сума, $</option></select></label><label>{calcDiscountType==="percent"?"Знижка, %":"Знижка, $"}<input type="number" min="0" step={calcDiscountType==="percent"?"1":"10"} value={calcDiscountValue} onChange={e=>setCalcDiscountValue(Math.max(0,Number(e.target.value)||0))}/></label></section>

    <section className="panel"><div className="head"><h2>Line items</h2><button className="add noPrint" onClick={addCalcItem}>＋ Add item</button></div>
      {calcItems.length===0?<p className="empty">AI-позиції з'являться тут.</p>:calcItems.map(li=>{
        const c=computeCalcLine(li,calcLocationMultiplier,calcIncludeFinish);
        return <article className="item" key={li.id}>
         <div className="itemtop">
          <select value={li.taskId} onChange={e=>updateCalcItem(li.id,{taskId:e.target.value})}>
           {!li.taskId&&<option value="">— Select task —</option>}
           {calcCategories.map(cat=><optgroup label={cat} key={cat}>{calcTasks.filter(t=>t.category===cat).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</optgroup>)}
          </select>
          <button className="remove noPrint" onClick={()=>removeCalcItem(li.id)}>×</button>
         </div>
         {li.note&&<div className="itemNote">ℹ {li.note}</div>}
         {typeof li.confidence==="number"&&li.confidence<.7&&<div className="itemWarning">⚠ Low confidence — verify this item.</div>}
         <div className="itemgrid">
          <label>Quantity<input type="number" min="0" step="0.01" value={li.quantity} onChange={e=>updateCalcItem(li.id,{quantity:Number(e.target.value)})}/></label>
          <label>Unit<input value={unitLabel(li.unit)} disabled/></label>
          <label>Difficulty<select value={li.difficulty} onChange={e=>updateCalcItem(li.id,{difficulty:e.target.value as CalcDifficulty})}><option value="basic">Basic</option><option value="standard">Standard</option><option value="difficult">Difficult</option></select></label>
          {/* Власні ставки прямо в кошторисі — діють лише на цей рядок, прайс не змінюють.
              Ввів свою ціну праці → складність Standard і без мінімальної ціни: рахується рівно qty × ставка. */}
          <label>Праця, $/од<input type="number" min="0" step="0.01" value={li.laborRate} onChange={e=>updateCalcItem(li.id,{laborRate:Math.max(0,Number(e.target.value)||0),difficulty:"standard",minPrice:0,laborOwn:true})}/></label>
          <label>Матеріали, $/од<input type="number" min="0" step="0.01" value={li.materialRate} onChange={e=>updateCalcItem(li.id,{materialRate:Math.max(0,Number(e.target.value)||0),minPrice:0})}/></label>
          <label>Оздоблення, $/од<input type="number" min="0" step="0.01" value={li.finishRate||0} onChange={e=>updateCalcItem(li.id,{finishRate:Math.max(0,Number(e.target.value)||0),finishOwn:true,minPrice:0})}/></label>
          <div className="linetotal"><span>{li.optional?"Опційно":"Total"}</span><b>{money(c.lineTotal)}</b></div>
          <label className="noPrint" style={{display:"flex",gap:6,alignItems:"center",gridColumn:"1/-1",fontWeight:600}}><input type="checkbox" style={{width:"auto"}} checked={!!li.optional} onChange={e=>updateCalcItem(li.id,{optional:e.target.checked})}/>Опційно — показати окремо, не додавати в суму</label>
         </div>
         <small>{li.optional&&"◇ опційно, не в сумі · "}{li.laborOwn&&"✎ своя ставка · "}Праця {money(c.labor)} · Матеріали {money(c.materials)}{c.finish>0?<> · Оздоблення {money(c.finish)}</>:null}{c.supplies>0?<> · Supplies {money(c.supplies)}</>:null} · Range {money(c.low)}–{money(c.high)}</small>
        </article>;
      })}
    </section>

    <section className="panel"><label>Notes &amp; exclusions<textarea ref={notesRef} rows={8} value={calcNotes} onChange={e=>setCalcNotes(e.target.value)}/></label>
     <div className="noPrint" style={{marginTop:10}}>
      <small className="muted">Шаблони — натисни, щоб додати в кінець нотаток:</small>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
       {noteTemplates.map(t=><span key={t.id} style={{display:"inline-flex",alignItems:"center",background:"#eef2f7",borderRadius:10}}>
        <button type="button" className="secondary" style={{padding:"7px 10px"}} onClick={()=>insertNoteTemplate(t)} title={t.text}>＋ {t.name}</button>
        <button type="button" aria-label="Видалити шаблон" style={{background:"transparent",color:"#b42318",padding:"0 8px"}} onClick={()=>{if(confirm(`Видалити шаблон «${t.name}»?`))removeNoteTemplate(t.id)}}>×</button>
       </span>)}
      </div>
      <div style={{display:"flex",gap:6,marginTop:8}}>
       <input placeholder="Назва нового шаблону" value={noteTplName} onChange={e=>setNoteTplName(e.target.value)}/>
       <button type="button" className="secondary" style={{whiteSpace:"nowrap"}} onClick={addNoteTemplate}>Зберегти як шаблон</button>
      </div>
      <small className="muted">Виділи абзац у нотатках — збережеться тільки він; без виділення — весь текст.</small>
     </div>{calcNotes!==DEFAULT_CALC_NOTES&&<button className="secondary full noPrint" onClick={()=>setCalcNotes(DEFAULT_CALC_NOTES)}>Повернути стандартний текст умов</button>}</section>

    <label className="noPrint" style={{display:"flex",gap:8,alignItems:"center",margin:"8px 0"}}><input type="checkbox" checked={calcIncludeFinish} onChange={e=>setCalcIncludeFinish(e.target.checked)}/>Включити базове оздоблення (плитка, прилади, світильники за цінами Home Depot / Floor &amp; Decor)</label>
    <section className="total">
     <div><span>Labor</span><span>{money(calcTotalsValue.labor)}</span></div>
     <div><span>Materials</span><span>{money(calcTotalsValue.materials)}</span></div>
     {calcTotalsValue.finish>0&&<div><span>Finish allowance (basic grade)</span><span>{money(calcTotalsValue.finish)}</span></div>}
     {calcTotalsValue.supplies>0&&<div><span>Supplies</span><span>{money(calcTotalsValue.supplies)}</span></div>}
     <div className={calcDiscount>0?undefined:"grand"}><span>Subtotal</span><b>{money(calcTotalsValue.lineTotal)}</b></div>
     {calcDiscount>0&&<><div><span>{calcDiscountLabel}</span><span>−{money(calcDiscount)}</span></div><div className="grand"><span>Total</span><b>{money(calcGrandTotal)}</b></div></>}
     <div><span>Estimated range</span><b>{money(Math.max(0,calcTotalsValue.low-calcDiscount))} – {money(Math.max(0,calcTotalsValue.high-calcDiscount))}</b></div>
     {calcOptionalTotal>0&&<div><span>Опційні позиції (не в сумі)</span><span>+{money(calcOptionalTotal)}</span></div>}
    </section>

    <div className="actions noPrint"><button onClick={downloadCalcPdf} disabled={calcPdfBusy}>{calcPdfBusy?"Готую PDF…":"Завантажити PDF"}</button><button className="secondary" onClick={shareCalcPdf} disabled={calcPdfBusy}>Надіслати PDF</button><button className="secondary" onClick={downloadShoppingPdf} disabled={calcPdfBusy}>Список закупівлі</button></div>
    <div className="actions noPrint" style={{marginTop:8}}><button className="secondary" onClick={printCalcEstimate}>Друк</button><button className="secondary" onClick={copyCalcAsText}>Copy as text</button></div>
    <p className="muted noPrint" style={{marginTop:8}}>Ставки праці й матеріалів — у вкладці <b>Prices</b>; калькулятор і кошториси рахують за однією таблицею.</p>
   </>}

   {screen==="saved"&&<section className="panel"><div className="head"><h1>My estimates</h1><button className="add" onClick={start}>＋ New</button></div>{all.length===0?<p className="empty">Немає збережених кошторисів.</p>:all.map(e=><article className="saved" key={e.id}><button onClick={()=>{setCur(e);setScreen("new")}}><b>{e.client||"Unnamed client"}<span className={`badge badge-${e.status||"draft"}`}>{statusLabel(e.status)}</span></b><small>{e.project||"Estimate"}</small></button><strong>{money(value(e))}</strong><button className="dup" onClick={()=>duplicate(e)} title="Duplicate">⧉</button><button className="delete" onClick={()=>deleteEstimate(e.id)}>Delete</button></article>)}</section>}

   {<section hidden={screen!=="prices"} className="panel"><span className="eyebrow">PRICE LIBRARY</span><h1>Твої ціни</h1><p className="muted">AI визначає роботу, але не вигадує ціну. Ставка береться звідси.</p><PriceEditor key={user?.id||"guest"} prices={prices} onSave={savePrices}/>

<div style={{marginTop:24,paddingTop:20,borderTop:"1px solid #d0d5dd"}}>
  <span className="eyebrow">ACCOUNT</span>
  <h2>Change password</h2>

  <label>
    New password
    <input
      type="password"
      autoComplete="new-password"
      value={newPassword}
      onChange={e=>setNewPassword(e.target.value)}
      placeholder="Minimum 6 characters"
    />
  </label>

  <button
    className="primary full"
    onClick={updatePassword}
    disabled={authLoading}
  >
    {authLoading?"Please wait…":"Save new password"}
  </button>

  <button
    className="secondary full"
    onClick={signOut}
    style={{marginTop:10}}
  >
    Sign out
  </button>
</div>
</section>}
  </main>
  <nav className="noPrint"><button className={screen==="home"?"active":""} onClick={()=>setScreen("home")}>⌂<span>Home</span></button><button className={screen==="calc"?"active":""} onClick={()=>setScreen("calc")}>🧮<span>Calculator</span></button><button className={screen==="saved"?"active":""} onClick={()=>setScreen("saved")}>▣<span>Estimates</span></button><button className={screen==="prices"?"active":""} onClick={()=>setScreen("prices")}>⚙<span>Prices</span></button></nav>
 </div>
}
