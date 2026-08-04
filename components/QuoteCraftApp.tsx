"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import type {Estimate,Item,PriceRule,Unit} from "@/lib/types";
import {defaults} from "@/lib/defaults";
import {supabase} from "@/lib/supabase";
import type {User} from "@supabase/supabase-js";

const EK="qc-estimates-v1",PK="qc-prices-v1";
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const fresh=():Estimate=>({id:crypto.randomUUID(),client:"",project:"",address:"",items:[],discount:0,tax:0,deposit:25,createdAt:new Date().toISOString()});
const load=<T,>(k:string,f:T):T=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(f))}catch{return f}};
const unitLabel=(u:Unit)=>({each:"each",sqft:"sq ft",hour:"hour",linear_ft:"linear ft",room:"room"}[u]);

type AIItem={
  serviceId:string;
  description:string;
  quantity:number;
  unit:Unit;
  note:string|null;
  confidence:number;
};

export default function QuoteCraftApp(){
 const [screen,setScreen]=useState<"home"|"new"|"saved"|"prices">("home");
 const [all,setAll]=useState<Estimate[]>([]);
 const [prices,setPrices]=useState<PriceRule[]>(defaults);
 const [cur,setCur]=useState<Estimate>(fresh());
 const [prompt,setPrompt]=useState("");
 const [thinking,setThinking]=useState(false);
 const [listening,setListening]=useState(false);
 const [message,setMessage]=useState("");
 const [user,setUser]=useState<User|null>(null);
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [authLoading,setAuthLoading]=useState(true);
 const [recoveryMode,setRecoveryMode]=useState(false);
 const [newPassword,setNewPassword]=useState("");
 const recognitionRef=useRef<any>(null);
 const baseRef=useRef("");
 const finalRef=useRef("");

 useEffect(()=>{setAll(load(EK,[]));setPrices(load(PK,defaults))},[]);

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
     setAuthLoading(false);
   };

   loadCloudEstimates();

   return()=>{
     active=false;
   };
 },[user]);

 const subtotal=useMemo(()=>cur.items.reduce((s,i)=>s+i.quantity*i.unitPrice,0),[cur.items]);
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
     updated_at:new Date().toISOString()
   }));

   const {error}=await supabase
     .from("estimates")
     .upsert(rows,{onConflict:"id"});

   if(error){
     setMessage("Кошторис збережено на пристрої, але не в хмарі: "+error.message);
   }
 };
 const savePrices=(x:PriceRule[])=>{setPrices(x);localStorage.setItem(PK,JSON.stringify(x))};
 const value=(e:Estimate)=>e.items.reduce((s,i)=>s+i.quantity*i.unitPrice,0);


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
       redirectTo:"https://quotecraftai-app.vercel.app"
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
  recognitionRef.current?.abort?.();
  setCur(fresh());setPrompt("");setMessage("");setListening(false);setScreen("new");
 }

 function startVoice(){
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

 function stopVoice(){recognitionRef.current?.stop?.();setListening(false)}

 async function generate(){
  if(!prompt.trim()){setMessage("Спочатку опиши роботу.");return}
  setThinking(true);setMessage("");
  try{
    const response=await fetch("/api/parse-estimate",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text:prompt,prices})
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data?.error||"AI request failed.");

    const aiItems=(data.items||[]) as AIItem[];
    const items:Item[]=aiItems.map(ai=>{
      const service=prices.find(p=>p.id===ai.serviceId);
      return{
        id:crypto.randomUUID(),
        serviceId:ai.serviceId,
        description:ai.description,
        quantity:Number(ai.quantity)||1,
        unit:ai.unit,
        unitPrice:service?.rate||0,
        note:ai.note||undefined,
        confidence:ai.confidence
      };
    });

    setCur(c=>({...c,items}));
    const custom=items.filter(i=>i.serviceId==="CUSTOM").length;
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
       <td>${esc(money(item.unitPrice))}</td>
       <td>${esc(money(item.quantity*item.unitPrice))}</td>
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


 if(authLoading&&!user){
  
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
    <section className="hero"><span>AI VERSION 1.0</span><h1>Скажи, що потрібно зробити.</h1><p>AI розділить роботи, визначить кількість та одиниці. Ціни підставляються тільки з твоєї бібліотеки.</p><button className="primary huge" onClick={start}>＋ New estimate</button></section>
    <section className="metrics"><article><span>Estimates</span><b>{all.length}</b></article><article><span>Quoted value</span><b>{money(all.reduce((s,e)=>s+value(e),0))}</b></article></section>
    <section className="panel"><div className="head"><h2>Recent estimates</h2><button onClick={()=>setScreen("saved")}>View all</button></div>{all.length===0?<p className="empty">Ще немає кошторисів.</p>:all.slice(0,3).map(e=><button className="estimate" key={e.id} onClick={()=>{setCur(e);setScreen("new")}}><span><b>{e.client||"Unnamed client"}</b><small>{e.project||"Estimate"}</small></span><strong>{money(value(e))}</strong></button>)}</section>
   </>}

   {screen==="new"&&<>
    <div className="screenbar noPrint"><button onClick={()=>setScreen("home")}>← Back</button><b>New estimate</b><button onClick={start}>Clear</button></div>
    <section className="assistant noPrint">
      <div className="assisttitle"><span>✨</span><div><b>Опиши роботу простою мовою</b><small>Українська, English або змішано</small></div></div>
      <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Замінити кран на кухні, пофарбувати одну стіну, замінити вентилятор і покласти ламінат 35 square feet."/>
      {message&&<div className="statusMessage">{message}</div>}
      <div className="actions">
       {!listening?<button className="secondary" onClick={startVoice}>🎤 Voice</button>:<button className="voice listening" onClick={stopVoice}>⏹ Stop</button>}
       <button className="primary" onClick={generate} disabled={listening||thinking}>{thinking?"AI is analyzing…":"Generate estimate"}</button>
      </div>
    </section>

    <section className="panel grid noPrint"><label>Client<input value={cur.client} onChange={e=>setCur({...cur,client:e.target.value})}/></label><label>Project<input value={cur.project} onChange={e=>setCur({...cur,project:e.target.value})}/></label><label className="wide">Address<input value={cur.address} onChange={e=>setCur({...cur,address:e.target.value})}/></label></section>

    <section className="panel"><div className="head"><h2>Scope & pricing</h2><button className="add noPrint" onClick={add}>＋ Add item</button></div>
      {cur.items.length===0?<p className="empty">AI-позиції з’являться тут.</p>:cur.items.map(i=><article className="item" key={i.id}>
       <div className="itemtop"><input value={i.description} onChange={e=>update(i.id,{description:e.target.value})}/><button className="remove noPrint" onClick={()=>remove(i.id)}>×</button></div>
       {i.note&&<div className="itemNote">ℹ {i.note}</div>}
       {typeof i.confidence==="number"&&i.confidence<.7&&<div className="itemWarning">⚠ Low confidence — verify this item.</div>}
       <div className="itemgrid">
        <label>Quantity<input type="number" min="0" step="0.01" value={i.quantity} onChange={e=>update(i.id,{quantity:Number(e.target.value)})}/></label>
        <label>Unit<select value={i.unit} onChange={e=>update(i.id,{unit:e.target.value as Unit})}><option value="each">each</option><option value="sqft">sq ft</option><option value="hour">hour</option><option value="linear_ft">linear ft</option><option value="room">room</option></select></label>
        <label>Rate<input type="number" min="0" step="0.01" value={i.unitPrice} onChange={e=>update(i.id,{unitPrice:Number(e.target.value)})}/></label>
        <div className="linetotal"><span>Total</span><b>{money(i.quantity*i.unitPrice)}</b></div>
       </div><small>{i.quantity} {unitLabel(i.unit)} × {money(i.unitPrice)}</small>
      </article>)}
    </section>

    <section className="panel grid3 noPrint"><label>Discount, $<input type="number" value={cur.discount} onChange={e=>setCur({...cur,discount:Number(e.target.value)})}/></label><label>Tax, %<input type="number" value={cur.tax} onChange={e=>setCur({...cur,tax:Number(e.target.value)})}/></label><label>Deposit, %<input type="number" value={cur.deposit} onChange={e=>setCur({...cur,deposit:Number(e.target.value)})}/></label></section>
    <section className="total"><div><span>Subtotal</span><span>{money(subtotal)}</span></div><div><span>Discount</span><span>−{money(discount)}</span></div><div><span>Tax</span><span>{money(tax)}</span></div><div className="grand"><span>Total</span><b>{money(total)}</b></div><div><span>Required deposit</span><b>{money(deposit)}</b></div></section>
    <div className="actions noPrint"><button className="secondary" onClick={printEstimate}>PDF / Print</button><button className="primary" onClick={save}>Save estimate</button></div>
   </>}

   {screen==="saved"&&<section className="panel"><div className="head"><h1>My estimates</h1><button className="add" onClick={start}>＋ New</button></div>{all.length===0?<p className="empty">Немає збережених кошторисів.</p>:all.map(e=><article className="saved" key={e.id}><button onClick={()=>{setCur(e);setScreen("new")}}><b>{e.client||"Unnamed client"}</b><small>{e.project||"Estimate"}</small></button><strong>{money(value(e))}</strong><button className="delete" onClick={()=>saveAll(all.filter(x=>x.id!==e.id))}>Delete</button></article>)}</section>}

   {screen==="prices"&&<section className="panel"><span className="eyebrow">PRICE LIBRARY</span><h1>Твої ціни</h1><p className="muted">AI визначає роботу, але не вигадує ціну. Ставка береться звідси.</p>{prices.map(r=><article className="price" key={r.id}><div><b>{r.name}</b><small>{unitLabel(r.unit)}</small></div><label>Rate<input type="number" min="0" step="0.01" value={r.rate} onChange={e=>savePrices(prices.map(x=>x.id===r.id?{...x,rate:Number(e.target.value)}:x))}/></label></article>)}<button className="secondary full" onClick={()=>savePrices(defaults)}>Reset default prices</button></section>}
  </main>
  <nav className="noPrint"><button className={screen==="home"?"active":""} onClick={()=>setScreen("home")}>⌂<span>Home</span></button><button className={screen==="saved"?"active":""} onClick={()=>setScreen("saved")}>▣<span>Estimates</span></button><button className={screen==="prices"?"active":""} onClick={()=>setScreen("prices")}>⚙<span>Prices</span></button></nav>
 </div>
}
