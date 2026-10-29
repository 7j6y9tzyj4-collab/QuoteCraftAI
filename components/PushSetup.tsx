"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";

// 🔔 Увімкнути push-сповіщення на цьому телефоні (Андрій додав години/чек/фото, клієнт прийняв естімейт).
// iPhone: працює лише з іконки на головному екрані (Safari → Поділитися → «На початковий екран»).
type St="loading"|"unsupported"|"need-home"|"off"|"denied"|"on";
const b64=(s:string)=>{const p="=".repeat((4-s.length%4)%4);const r=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(r,c=>c.charCodeAt(0))};
const isIOS=()=>typeof navigator!=="undefined"&&/iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone=()=>typeof window!=="undefined"&&(window.matchMedia?.("(display-mode: standalone)").matches||(navigator as any).standalone===true);

export async function registerSW(){
  if(typeof navigator==="undefined"||!("serviceWorker" in navigator))return null;
  try{return await navigator.serviceWorker.register("/sw.js")}catch{return null}
}
async function authHeader(){const {data:{session}}=await supabase.auth.getSession();return session?{Authorization:`Bearer ${session.access_token}`}:null}

export default function PushSetup({user,compact}:{user:User|null;compact?:boolean}){
  const [st,setSt]=useState<St>("loading");
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const [hidden,setHidden]=useState(false);
  useEffect(()=>{(async()=>{
    try{if(compact&&localStorage.getItem("qc_push_hide")==="1")setHidden(true)}catch{}
    if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){setSt(isIOS()&&!standalone()?"need-home":"unsupported");return}
    if(Notification.permission==="denied"){setSt("denied");return}
    const reg=await registerSW();const sub=await reg?.pushManager.getSubscription();
    if(sub&&Notification.permission==="granted"){
      setSt("on");
      // оновити підписку на сервері (раптом змінилась або це новий вхід)
      const h=await authHeader();if(h)fetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({sub:sub.toJSON()})}).catch(()=>{});
    }else setSt("off");
  })()},[user?.id,compact]);

  async function enable(){
    setBusy(true);setMsg("");
    try{
      const perm=await Notification.requestPermission();
      if(perm!=="granted"){setSt(perm==="denied"?"denied":"off");return}
      const reg=await registerSW();if(!reg)throw new Error("Не вдалося запустити");
      await navigator.serviceWorker.ready;
      const {publicKey,error}=await (await fetch("/api/push")).json();if(!publicKey)throw new Error(error||"Немає ключа");
      const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(publicKey)});
      const h=await authHeader();if(!h)throw new Error("Увійди в QuoteCraft");
      const r=await fetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({sub:sub.toJSON()})});
      if(!r.ok)throw new Error((await r.json()).error||"Помилка");
      setSt("on");setMsg("Готово ✓ Натисни «Тест», щоб перевірити.");
    }catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  async function test(){
    setBusy(true);setMsg("");
    try{const h=await authHeader();const r=await fetch("/api/push",{method:"POST",headers:{"Content-Type":"application/json",...(h||{})},body:JSON.stringify({test:true})});const j=await r.json();setMsg(j.ok?"Надіслано — має прийти за кілька секунд.":"Не дійшло. Вимкни й увімкни ще раз.")}
    catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  async function disable(){
    setBusy(true);
    try{const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription();
      if(sub){const h=await authHeader();if(h)await fetch("/api/push",{method:"DELETE",headers:{"Content-Type":"application/json",...h},body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}
      setSt("off");setMsg("Вимкнено на цьому телефоні.")}finally{setBusy(false)}
  }

  if(!user||st==="loading")return null;
  if(compact&&(st==="on"||st==="unsupported"||hidden))return null;
  const box:React.CSSProperties={background:"#fff",border:"1px solid #e4e7ec",borderRadius:16,padding:14,marginBottom:13};
  const hide=()=>{setHidden(true);try{localStorage.setItem("qc_push_hide","1")}catch{}};
  return <div style={box} className="noPrint">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
      <b>🔔 Сповіщення на телефон</b>
      {compact&&<button onClick={hide} style={{background:"transparent",color:"#667085",fontSize:13}}>сховати</button>}
    </div>
    <p className="muted" style={{fontSize:14,margin:"6px 0 10px"}}>Прийде, коли Андрій запише години, додасть чек чи фото, і коли клієнт прийме естімейт.</p>
    {st==="need-home"&&<div style={{fontSize:14,lineHeight:1.5}}>
      На iPhone сповіщення працюють тільки з іконки QuoteCraft на головному екрані:<br/>
      1. Відкрий цю сторінку в <b>Safari</b> → кнопка <b>Поділитися</b> (квадрат зі стрілкою).<br/>
      2. <b>«На початковий екран»</b> → Додати.<br/>
      3. Відкрий QuoteCraft з іконки → тут з'явиться кнопка «Увімкнути».
    </div>}
    {st==="unsupported"&&<p style={{fontSize:14}}>Цей браузер не підтримує сповіщення.</p>}
    {st==="denied"&&<p style={{fontSize:14}}>Сповіщення заборонені. iPhone: Параметри → Сповіщення → QuoteCraft → Дозволити.</p>}
    {st==="off"&&<button className="primary" disabled={busy} onClick={enable} style={{width:"100%"}}>{busy?"Вмикаю…":"🔔 Увімкнути на цьому телефоні"}</button>}
    {st==="on"&&<div className="actions"><span style={{color:"#067647",fontWeight:700}}>✓ Увімкнено</span><button className="secondary" disabled={busy} onClick={test}>Тест</button><button className="secondary" disabled={busy} onClick={disable}>Вимкнути</button></div>}
    {msg&&<p className="muted" style={{fontSize:14,margin:"8px 0 0"}}>{msg}</p>}
  </div>;
}
