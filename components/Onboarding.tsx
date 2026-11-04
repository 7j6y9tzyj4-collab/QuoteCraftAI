"use client";
import {useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {cleanCompany,setCompany,type Company,EMPTY_COMPANY} from "@/lib/company";
import type {UiPrefs} from "@/lib/uiPrefs";

// 🚀 Старт для нового майстра: мова → профіль компанії → оплата/мінімум → перший естімейт.
// Показується, поки не заповнено назву компанії (і не натиснуто «Пропустити»).
const EXAMPLES={
  en:["Hall bathroom 5x8: remove tub, tile shower walls to the ceiling, new tile floor, new vanity and toilet (customer buys fixtures), paint walls.",
      "Kitchen backsplash 30 sq ft, replace kitchen faucet, install 4 recessed lights."],
  uk:["Ванна 5 на 8 футів: демонтаж ванни, плитка на стіни душу до стелі, нова плитка на підлогу, тумба й унітаз (клієнт купує), фарбування стін.",
      "Фартух на кухні 30 sq ft, замінити кухонний змішувач, встановити 4 точкові світильники."],
};
async function shrinkLogo(file:File):Promise<string>{
  const url=URL.createObjectURL(file);
  try{const img=await new Promise<HTMLImageElement>((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url});
    const sc=Math.min(1,400/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
    c.getContext("2d")!.drawImage(img,0,0,c.width,c.height);return c.toDataURL(file.type==="image/png"?"image/png":"image/jpeg",0.9)}finally{URL.revokeObjectURL(url)}
}

export default function Onboarding({user,ui,saveUi,onDone,onTry}:{user:User;ui:UiPrefs;saveUi:(u:UiPrefs)=>void;onDone:()=>void;onTry:(prompt:string)=>void}){
  const [step,setStep]=useState(0);
  const [c,setC]=useState<Company>({...EMPTY_COMPANY,email:user.email||""});
  const [zelle,setZelle]=useState("");const [minPrice,setMinPrice]=useState(300);
  const [busy,setBusy]=useState(false);const [err,setErr]=useState("");
  const en=ui.lang==="en";
  const T=(u:string,e:string)=>en?e:u;
  const set=(x:Partial<Company>)=>setC(v=>({...v,...x}));
  async function saveCompany(){
    if(!c.name.trim()||!c.owner.trim()){setErr(T("Впишіть назву компанії і своє ім'я.","Enter your company name and your first name."));return}
    setBusy(true);setErr("");
    const v=cleanCompany(c);
    const {error}=await supabase.from("user_settings").upsert({user_id:user.id,company:v,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    setBusy(false);if(error){setErr(error.message);return}
    setCompany(v);setStep(2);
  }
  async function savePay(){
    setBusy(true);setErr("");
    const {error}=await supabase.from("user_settings").upsert({user_id:user.id,zelle:zelle.trim()||null,min_job_price:Math.max(0,Number(minPrice)||0),updated_at:new Date().toISOString()},{onConflict:"user_id"});
    setBusy(false);if(error){setErr(error.message);return}
    setStep(3);
  }
  function finish(prompt?:string){saveUi({...ui,onboarded:true});onDone();if(prompt)onTry(prompt)}
  const pill=(on:boolean):React.CSSProperties=>({flex:1,padding:"14px 10px",borderRadius:14,fontWeight:800,fontSize:16,background:on?"#101828":"#eef2f7",color:on?"#fff":"#344054"});
  const dots=<div style={{display:"flex",gap:6,justifyContent:"center",margin:"4px 0 14px"}}>{[0,1,2,3].map(i=><span key={i} style={{width:i===step?22:8,height:8,borderRadius:4,background:i<=step?"#2f6df6":"#d0d5dd",transition:"width .2s"}}/>)}</div>;
  return <div data-notr style={{position:"fixed",inset:0,zIndex:200,background:"#f4f6f8",overflowY:"auto"}}>
    <div style={{maxWidth:560,margin:"0 auto",padding:"max(20px,env(safe-area-inset-top)) 16px 40px"}}>
      {dots}
      {step===0&&<section className="panel">
        <span className="eyebrow">QUOTECRAFT</span>
        <h1 style={{marginTop:6}}>{T("Вітаю! Налаштуймо програму за 2 хвилини","Welcome! Let's set you up in 2 minutes")}</h1>
        <p className="muted">{T("Естімейти голосом, посилання клієнту з кнопкою Accept, чеки й оплати по кожному проєкту.","Estimates by voice, a client link with an Accept button, receipts and payments for every job.")}</p>
        <h3>{T("Мова програми","App language")}</h3>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>saveUi({...ui,lang:"en"})} style={pill(en)}>🇺🇸 English</button>
          <button onClick={()=>{if(en){saveUi({...ui,lang:"uk"});setTimeout(()=>location.reload(),300)}}} style={pill(!en)}>🇺🇦 Українська</button>
        </div>
        <button className="primary huge" style={{marginTop:16,width:"100%"}} onClick={()=>setStep(1)}>{T("Почати →","Start →")}</button>
        <button className="secondary" style={{marginTop:8,width:"100%"}} onClick={()=>finish()}>{T("Пропустити, налаштую пізніше","Skip, I'll set up later")}</button>
      </section>}

      {step===1&&<section className="panel">
        <span className="eyebrow">{T("КРОК 1 З 3","STEP 1 OF 3")}</span>
        <h2 style={{marginTop:6}}>🏢 {T("Ваша компанія","Your company")}</h2>
        <p className="muted" style={{fontSize:14}}>{T("Це бачать клієнти на естімейтах, рахунках і в повідомленнях.","Clients see this on estimates, invoices and messages.")}</p>
        <div className="grid">
          <label>{T("Назва компанії *","Company name *")}<input value={c.name} onChange={e=>set({name:e.target.value})} placeholder="ABC Remodeling LLC"/></label>
          <label>{T("Ваше ім'я *","Your first name *")}<input value={c.owner} onChange={e=>set({owner:e.target.value})} placeholder="John"/></label>
          <label>{T("Телефон","Phone")}<input type="tel" value={c.phone} onChange={e=>set({phone:e.target.value})} placeholder="(555) 123-4567"/></label>
          <label>Email<input type="email" value={c.email} onChange={e=>set({email:e.target.value})}/></label>
          <label className="wide">{T("Місто, штат","City, State")}<input value={c.address} onChange={e=>set({address:e.target.value})} placeholder="Chicago, IL"/></label>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center",marginTop:10}}>
          {c.logo&&<img src={c.logo} alt="" style={{height:48,maxWidth:160,objectFit:"contain"}}/>}
          <label style={{padding:"10px 14px",borderRadius:13,fontWeight:800,cursor:"pointer",background:"#eef2f7",color:"#344054",fontSize:14}}>{c.logo?T("Змінити логотип","Change logo"):T("＋ Логотип (необов'язково)","＋ Logo (optional)")}
            <input type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value="";if(f)try{set({logo:await shrinkLogo(f)})}catch{}}}/></label>
        </div>
        {err&&<p style={{color:"#b42318",fontSize:14}}>{err}</p>}
        <div className="actions" style={{marginTop:14}}><button className="secondary" onClick={()=>setStep(0)}>←</button><button className="primary" disabled={busy} onClick={saveCompany}>{busy?"…":T("Далі →","Next →")}</button></div>
      </section>}

      {step===2&&<section className="panel">
        <span className="eyebrow">{T("КРОК 2 З 3","STEP 2 OF 3")}</span>
        <h2 style={{marginTop:6}}>💵 {T("Оплата і ціни","Payments & prices")}</h2>
        <label>{T("Zelle для завдатку (телефон або email, необов'язково)","Zelle for deposits (phone or email, optional)")}<input value={zelle} onChange={e=>setZelle(e.target.value)} placeholder="(555) 123-4567"/></label>
        <p className="muted" style={{fontSize:13,margin:"4px 0 12px"}}>{T("Клієнт побачить його після «Accept».","The client sees it after tapping Accept.")}</p>
        <label>{T("Мінімальна ціна роботи, $","Minimum job price, $")}<input type="number" min={0} step={50} value={minPrice} onChange={e=>setMinPrice(Number(e.target.value))}/></label>
        <p className="muted" style={{fontSize:13,margin:"4px 0 12px"}}>{T("Програма попередить, якщо естімейт менший.","The app warns you when an estimate is below it.")}</p>
        <div style={{padding:12,borderRadius:12,background:"#eef4ff",fontSize:14,lineHeight:1.5}}>
          {T("📋 Прайс уже заповнено типовими цінами для Чикаго (праця, матеріали, оздоблення). AI бере ціни тільки звідти. Свої ставки можна змінити будь-коли у вкладці Prices.","📋 Your price list is pre-filled with typical Chicago-area prices (labor, materials, finishes). The AI only uses prices from it. Change any rate anytime in the Prices tab.")}
        </div>
        {err&&<p style={{color:"#b42318",fontSize:14}}>{err}</p>}
        <div className="actions" style={{marginTop:14}}><button className="secondary" onClick={()=>setStep(1)}>←</button><button className="primary" disabled={busy} onClick={savePay}>{busy?"…":T("Далі →","Next →")}</button></div>
      </section>}

      {step===3&&<section className="panel">
        <span className="eyebrow">{T("КРОК 3 З 3","STEP 3 OF 3")}</span>
        <h2 style={{marginTop:6}}>🧮 {T("Перший естімейт","Your first estimate")}</h2>
        <p className="muted" style={{fontSize:14}}>{T("Натисніть приклад — AI розкладе роботу на рядки з цінами за ~10 секунд. Потім спробуйте своїми словами або голосом 🎙.","Tap an example — the AI breaks the job into priced lines in ~10 seconds. Then try your own words or voice 🎙.")}</p>
        {(en?EXAMPLES.en:EXAMPLES.uk).map((p,i)=><button key={i} className="estimate" onClick={()=>finish(p)} style={{textAlign:"left",display:"block",width:"100%"}}><b>{i===0?"🛁 ":"🍳 "}{T("Спробувати","Try it")}</b><small>{p}</small></button>)}
        <button className="secondary" style={{marginTop:10,width:"100%"}} onClick={()=>finish()}>{T("Готово, почну сам","Done, I'll start on my own")}</button>
        <p className="muted" style={{fontSize:13,marginTop:10}}>{T("❓ вгорі — довідка по будь-якій функції.","❓ at the top — help for any feature.")}</p>
      </section>}
    </div>
  </div>;
}
