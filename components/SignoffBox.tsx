"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import type {Statement} from "@/lib/statement";
import {getSignoff,signoffLink,signoffText,type SignoffRow} from "@/lib/signoffLink";

// ✍️ Здача роботи: посилання клієнту на підпис пальцем (з доробками), статус підпису.
export default function SignoffBox({user,st,phone}:{user:User|null;st:Statement;phone?:string}){
  const [row,setRow]=useState<SignoffRow|null>(null);const [text,setText]=useState("");const [busy,setBusy]=useState(false);const [msg,setMsg]=useState("");
  useEffect(()=>{if(user)getSignoff(user,st.id).then(setRow).catch(()=>{})},[user,st.id]);
  if(!user)return null;
  const tel=(phone||"").replace(/[^\d+]/g,"");
  async function make(){setBusy(true);setMsg("");try{const l=await signoffLink(user!,st);setText(signoffText(st,l));setRow(await getSignoff(user!,st.id))}catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  if(row?.status==="accepted")return <div style={{marginTop:12,padding:12,borderRadius:12,background:"#ecfdf3",border:"1px solid #abefc6"}}>
    <b style={{color:"#067647"}}>✍️ Клієнт підписав здачу</b> — {row.accepted_name}, {row.accepted_at?new Date(row.accepted_at).toLocaleDateString():""}
    {Array.isArray(row.data?.items)&&row.data.items.some((i:any)=>!i.done)&&<small style={{display:"block",color:"#b54708"}}>На момент підпису лишалось доробок: {row.data.items.filter((i:any)=>!i.done).length}</small>}
    <a href={`/q/${row.token}`} target="_blank" rel="noreferrer" style={{display:"block",marginTop:4,fontSize:14}}>Відкрити підписаний документ</a>
  </div>;
  return <div style={{marginTop:12}}>
    {!text?<>
      <button className="primary" onClick={make} disabled={busy} style={{width:"100%"}}>{busy?"…":"✍️ Відправити клієнту на підпис здачі"}</button>
      <small className="muted" style={{display:"block",marginTop:4}}>Клієнт бачить список доробок (зроблені ✅ і ті, що ще будуть) і підписує пальцем, що роботу прийнято.{row?" · посилання вже надсилали, "+(row.status==="viewed"?"клієнт відкривав":"ще не відкривали"):""}</small>
    </>:<>
      <textarea data-notr value={text} onChange={e=>setText(e.target.value)} style={{minHeight:120,fontSize:15}}/>
      <div style={{display:"grid",gridTemplateColumns:tel?"1fr 1fr 1fr":"1fr 1fr",gap:8,marginTop:8}}>
        {tel&&<a className="primary" href={`sms:${tel}&body=${encodeURIComponent(text)}`} style={{textAlign:"center",padding:"12px 8px",borderRadius:13,textDecoration:"none"}}>💬 SMS</a>}
        <button className={tel?"secondary":"primary"} onClick={async()=>{try{if(navigator.share)await navigator.share({text});else{await navigator.clipboard.writeText(text);setMsg("Скопійовано ✓")}}catch{}}}>📤 Поділитися</button>
        <button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(text);setMsg("Скопійовано ✓")}catch{}}}>📋 Копіювати</button>
      </div>
    </>}
    {msg&&<small className="muted">{msg}</small>}
  </div>;
}
