"use client";
import {useEffect,useState} from "react";

// ⚙ Налаштування (адмін) → 💬 Відгуки користувачів
export default function FeedbackAdmin(){
  const [items,setItems]=useState<any[]|null>(null);
  async function load(){const r=await fetch("/api/feedback");if(r.ok)setItems((await r.json()).items)}
  useEffect(()=>{void load()},[]);
  if(!items)return null;
  const mark=async(id:string,status:string)=>{await fetch("/api/feedback",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});void load()};
  const fresh=items.filter(i=>i.status!=="done").length;
  return <div style={{marginTop:20}}>
    <h2>💬 Відгуки користувачів{fresh?` · ${fresh} нових`:""}</h2>
    {!items.length&&<p className="muted" style={{fontSize:14}}>Поки немає.</p>}
    {items.map(i=><div key={i.id} data-notr style={{padding:10,borderRadius:12,border:"1px solid #eaecf0",marginBottom:6,opacity:i.status==="done"?.55:1}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:13}}><b>{i.company||i.email}</b><span className="muted">{new Date(i.created_at).toLocaleString()}{i.screen?` · ${i.screen}`:""}</span></div>
      <p style={{margin:"6px 0",whiteSpace:"pre-wrap",fontSize:15}}>{i.text}</p>
      <button className="secondary" onClick={()=>mark(i.id,i.status==="done"?"new":"done")} style={{padding:"6px 10px",fontSize:13}}>{i.status==="done"?"↩ Нове":"✓ Розібрано"}</button>
    </div>)}
  </div>;
}
