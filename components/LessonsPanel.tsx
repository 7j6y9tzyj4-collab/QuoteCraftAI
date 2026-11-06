"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";

// ⚙ Налаштування → 🧠 Що програма запам'ятала з твоїх правок (видалити / виправити / дописати своє правило).
type L={id:string;text:string;count:number;source:string|null;example:string|null};
export default function LessonsPanel({user}:{user:User|null}){
  const [items,setItems]=useState<L[]|null>(null);const [add,setAdd]=useState("");const [edit,setEdit]=useState<{id:string;text:string}|null>(null);
  const call=async(body?:any)=>{const r=await fetch("/api/lessons",body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:undefined);if(r.ok)setItems((await r.json()).items)};
  useEffect(()=>{if(user)void call()},[user]);// eslint-disable-line react-hooks/exhaustive-deps
  if(!user||!items)return null;
  return <div style={{marginTop:20}}>
    <h2>🧠 Що програма запам'ятала</h2>
    <p className="muted" style={{fontSize:14,margin:"2px 0 8px"}}>Коли ти правиш естімейт через ✏️ і це твоя звичка (а не разова зміна), програма записує правило. Далі нові естімейти роблять так одразу, а 🔍 Перевірка нагадує, якщо забув. Число — скільки разів ти так робив.</p>
    {!items.length&&<p className="muted" style={{fontSize:14}}>Поки нічого. Правила з'являться після твоїх правок, або допиши своє нижче.</p>}
    {items.map(l=><div key={l.id} style={{padding:"8px 0",borderTop:"1px solid #eaecf0"}}>
      {edit?.id===l.id?<div style={{display:"flex",gap:6}}><input data-notr value={edit.text} onChange={e=>setEdit({id:l.id,text:e.target.value})} style={{flex:1}}/><button className="primary" onClick={async()=>{await call({action:"edit",id:l.id,text:edit.text});setEdit(null)}}>✓</button></div>
      :<div style={{display:"flex",gap:8,alignItems:"start"}}>
        <span data-notr style={{flex:1,fontSize:15}}>{l.text}{l.count>1&&<b style={{color:"#2f6df6"}}> ×{l.count}</b>}{l.source==="manual"&&<small className="muted"> · твоє</small>}{l.example&&l.source!=="manual"&&<small className="muted" style={{display:"block"}}>з правки: «{l.example}»</small>}</span>
        <button className="secondary" onClick={()=>setEdit({id:l.id,text:l.text})} style={{padding:"4px 8px",fontSize:13}}>✎</button>
        <button className="secondary" onClick={()=>{if(confirm("Забути це правило?"))void call({action:"delete",id:l.id})}} style={{padding:"4px 8px",fontSize:13,color:"#b42318"}}>×</button>
      </div>}
    </div>)}
    <div style={{display:"flex",gap:6,marginTop:8}}>
      <input value={add} onChange={e=>setAdd(e.target.value)} placeholder="Своє правило, напр.: у ванних завжди додавай захист підлоги" style={{flex:1}}/>
      <button className="primary" disabled={add.trim().length<6} onClick={async()=>{await call({action:"add",text:add});setAdd("")}}>＋</button>
    </div>
  </div>;
}
