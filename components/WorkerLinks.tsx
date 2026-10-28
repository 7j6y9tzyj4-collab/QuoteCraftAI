"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import type {Statement} from "@/lib/statement";

type Link={token:string;worker:string;rate:number;projects:string[];revoked:boolean};
const n=(s:string)=>String(s||"").trim().toLowerCase();

// Розрахунок → «👷 Посилання для помічника»: години, чеки й фото з його телефона, без цін клієнта.
export default function WorkerLinks({user,st}:{user:User|null;st:Statement}){
  const [links,setLinks]=useState<Link[]>([]);
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState("");
  const helpers=(st.crew||[]).filter(c=>!c.self&&c.name.trim());
  useEffect(()=>{if(!user)return;supabase.from("worker_links").select("token,worker,rate,projects,revoked").eq("user_id",user.id).then(({data}:{data:Link[]|null})=>setLinks(data||[]))},[user,st.id]);
  if(!user||!helpers.length)return null;
  async function share(name:string,rate:number){
    if(!user)return;setBusy(name);setMsg("");
    try{
      let l=links.find(x=>n(x.worker)===n(name)&&!x.revoked);
      if(l){
        if(!l.projects.includes(st.id)||l.rate!==rate){
          const projects=Array.from(new Set([...l.projects,st.id]));
          const {error}=await supabase.from("worker_links").update({projects,rate}).eq("token",l.token);if(error)throw error;
          l={...l,projects,rate};
        }
      }else{
        l={token:crypto.randomUUID(),worker:name.trim(),rate,projects:[st.id],revoked:false};
        const {error}=await supabase.from("worker_links").insert({...l,user_id:user.id});if(error)throw error;
      }
      setLinks(x=>[...x.filter(y=>y.token!==l!.token),l!]);
      const url=`${window.location.origin}/w/${l.token}`;
      const text=`${name}, твоє посилання для роботи (години, чеки, фото): ${url}\nЗбережи його на головний екран телефона.`;
      const nav=navigator as Navigator&{share?:(d:ShareData)=>Promise<void>};
      if(nav.share&&/iPhone|iPad|Android/i.test(navigator.userAgent)){try{await nav.share({text});setMsg("Посилання надіслано.");return}catch{}}
      try{await navigator.clipboard.writeText(text);setMsg("Скопійовано: "+url)}catch{setMsg(url)}
    }catch(e){setMsg("Не вдалося: "+(e instanceof Error?e.message:String(e))+(String(e).includes("worker_links")?" (таблиця worker_links)":""))}finally{setBusy("")}
  }
  async function unshare(l:Link){
    if(!confirm(`Забрати в ${l.worker} доступ до цього проєкту?`))return;
    const projects=l.projects.filter(p=>p!==st.id);
    await supabase.from("worker_links").update({projects}).eq("token",l.token);
    setLinks(x=>x.map(y=>y.token===l.token?{...y,projects}:y));
  }
  return <section className="panel">
    <div className="head"><h2>📲 Посилання для помічника</h2></div>
    <small className="muted">Помічник з телефона записує години, фотографує чеки (AI читає суму) і фото роботи. Бачить адресу, що робити, що купити, свої години й скільки йому винні. Ціни клієнта й твій заробіток — ні.</small>
    {helpers.map(c=>{const l=links.find(x=>n(x.worker)===n(c.name)&&!x.revoked);const on=!!l?.projects.includes(st.id);
      return <div key={c.id} style={{display:"flex",gap:6,alignItems:"center",marginTop:8,flexWrap:"wrap"}}>
        <b style={{flex:1}}>{c.name}{c.rate?` · $${c.rate}/год`:""}{on?<small style={{color:"#067647"}}> · ✓ має доступ</small>:null}</b>
        <button className="secondary" disabled={busy===c.name} onClick={()=>share(c.name,Number(c.rate)||0)}>{busy===c.name?"…":on?"🔗 Надіслати ще раз":"🔗 Дати посилання"}</button>
        {on&&l&&<button className="secondary" style={{color:"#b42318"}} onClick={()=>unshare(l)}>✕</button>}
      </div>})}
    {msg&&<p className="muted" style={{fontSize:13,wordBreak:"break-all"}}>{msg}</p>}
  </section>;
}
