"use client";
import {useEffect,useRef,useState} from "react";
import type {PriceRule} from "@/lib/types";
import {defaults} from "@/lib/defaults";

type Props={prices:PriceRule[];onSave:(prices:PriceRule[])=>Promise<string>};
const copy=(prices:PriceRule[])=>prices.map(p=>({...p,aliases:[...p.aliases]}));
const recommended=new Set(["bathroom_mirror_install_each","vanity_light_install_each","light_fixture_replace"]);

export default function PriceEditor({prices,onSave}:Props){
 const [draft,setDraft]=useState(()=>copy(prices));
 const [dirty,setDirty]=useState(false);
 const [saving,setSaving]=useState(false);
 const [status,setStatus]=useState("");
 const [resetOpen,setResetOpen]=useState(false);
 const [invalid,setInvalid]=useState<string[]>([]);
 const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 useEffect(()=>{if(!dirty&&!saving)setDraft(copy(prices))},[prices,dirty,saving]);
 useEffect(()=>{
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=""};
  if(dirty)window.addEventListener("beforeunload",warn);
  return()=>window.removeEventListener("beforeunload",warn);
 },[dirty]);
 function replace(next:PriceRule[]){setDraft(copy(next));setDirty(true);setStatus("");setInvalid([])}
 async function save(){
  if(saving)return;
  if(invalid.length||draft.some(p=>!Number.isFinite(p.rate)||p.rate<0)){
   setStatus("Заповни всі ціни: число від 0 і вище.");return;
  }
  setSaving(true);setStatus("");
  try{
   const message=await onSave(copy(draft));
   if(active.current){setStatus(message);setDirty(false)}
  }catch(error){if(active.current)setStatus(error instanceof Error?error.message:"Не вдалося зберегти. Спробуй ще раз.")}
  finally{if(active.current)setSaving(false)}
 }
 return <div>
  <p className="muted">Ставки для New estimate. Редагуй ціни й натисни «Зберегти ціни». Уже створені кошториси не перераховуються.</p>
  <p className="muted">Базові ставки: готове дзеркало — $75; звичайний світильник на готовому підключенні — $125. Нова проводка та складний монтаж рахуються окремо. Це узгоджені ставки, а не автоматична синхронізація з Homewyse.</p>
  <div className="actions">
   <button className="secondary" disabled={saving} onClick={()=>replace(draft.map(p=>recommended.has(p.id)?{...p,rate:defaults.find(d=>d.id===p.id)!.rate}:p))}>Застосувати $75 / $125</button>
   <button className="primary" disabled={saving||!dirty||invalid.length>0} onClick={save}>{saving?"Зберігаю…":"Зберегти ціни"}</button>
  </div>
  <p role="status" aria-live="polite">{status||(dirty?"Є незбережені зміни.":"Показано збережені ціни.")}</p>
  {draft.map(r=><article className="price" key={r.id}><div><b>{r.name}</b><small>{r.unit}</small></div><label>Ціна, $<input aria-label={`Ціна: ${r.name}`} type="number" min="0" step="0.01" disabled={saving} value={invalid.includes(r.id)?"":r.rate} onChange={e=>{
   const raw=e.target.value;const rate=Number(raw);
   setInvalid(v=>raw===""||!Number.isFinite(rate)||rate<0?[...v.filter(id=>id!==r.id),r.id]:v.filter(id=>id!==r.id));
   setDraft(v=>v.map(p=>p.id===r.id?{...p,rate}:p));setDirty(true);setStatus("");
  }}/></label></article>)}
  <div className="actions">
   <button className="primary" disabled={saving||!dirty||invalid.length>0} onClick={save}>{saving?"Зберігаю…":"Зберегти ціни"}</button>
   <button className="secondary" disabled={saving||!dirty} onClick={()=>{setDraft(copy(prices));setDirty(false);setInvalid([]);setStatus("")}}>Скасувати зміни</button>
   <button className="secondary" disabled={saving} onClick={()=>setResetOpen(true)}>Повернути заводські ціни</button>
  </div>
  {resetOpen&&<div className="statusMessage" role="group" aria-label="Повернення заводських цін">
   <p>Замінити всі ставки базовими? Потім натисни «Зберегти ціни», щоб застосувати їх до акаунта.</p>
   <div className="actions"><button className="secondary" onClick={()=>{replace(defaults);setResetOpen(false)}}>Так, повернути</button><button className="secondary" onClick={()=>setResetOpen(false)}>Залишити мої</button></div>
  </div>}
 </div>;
}
