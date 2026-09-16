"use client";
import {useEffect,useRef,useState} from "react";
import type {PriceRule} from "@/lib/types";
import {chicagoPrices,applyChicagoPrices} from "@/lib/chicagoPrices";
import {categories,categoryOf,bounds,validPrice,matches} from "@/lib/priceCatalog";
import {defaults} from "@/lib/defaults";

type Props={prices:PriceRule[];onSave:(prices:PriceRule[])=>Promise<string>};
const copy=(prices:PriceRule[])=>prices.map(p=>({...p,aliases:[...p.aliases]}));
const recommended=new Set(["bathroom_mirror_install_each","vanity_light_install_each","light_fixture_replace"]);

export default function PriceEditor({prices,onSave}:Props){
 const [query,setQuery]=useState("");
 const [category,setCategory]=useState("");
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
  if(invalid.length||draft.some(p=>!validPrice(p))){
   setStatus("Перевір ціни: 0 ≤ від ≤ вибрана ставка ≤ до. Перевір також приховані пошуком позиції.");return;
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
  <details><summary>Звідки беруться ціни</summary><p>Базове джерело — Homewyse.com (національні середні), кожна позиція звірена з чикагським джерелом: Angi Chicago, Homeyou Chicago, Contractor+ Chicago, iConduit Electric, Plumbing Price Guide Chicago та інші. Джерело, діапазон і дату перевірки видно під кожною позицією окремо.</p><p>Частину позицій раніше звірено з прайсами місцевих handyman-компаній (Homer Fixed It, 5 Talents Renovations) — це окремі пропозиції, а не статистика всього ринку. Там, де чикагської ціни саме по цій роботі не опубліковано, у джерелі це прямо сказано, а ставку пораховано з місцевої погодинної.</p><p>Оновлення не автоматичне. У Homer мінімальний виїзд $250 — це умова тієї компанії, не доплата до кожної позиції нашого кошторису; свої умови виїзду враховуй окремо.</p></details>
  <button className="secondary full" disabled={saving} onClick={()=>replace(applyChicagoPrices(draft))}>Застосувати перевірені ставки Чикаго ({Object.values(chicagoPrices).filter(r=>!r.keepOwnRate).length} позицій)</button>
  <div className="actions">
   <button className="secondary" disabled={saving} onClick={()=>replace(draft.map(p=>recommended.has(p.id)?{...p,rate:defaults.find(d=>d.id===p.id)!.rate,rateMin:undefined,rateMax:undefined}:p))}>Застосувати $75 / $125</button>
   <button className="primary" disabled={saving||!dirty||invalid.length>0} onClick={save}>{saving?"Зберігаю…":"Зберегти ціни"}</button>
  </div>
  <p role="status" aria-live="polite">{status||(dirty?"Є незбережені зміни.":"Показано збережені ціни.")}</p>
  <p className="muted">Діапазон — твій орієнтир за одиницю роботи. «Вибрана ставка» використовується у новому кошторисі. Старі ставки без діапазону показані як від = до.</p>
  <div className="grid"><label>Пошук роботи<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Фарбування, paint, розетка…"/></label><label>Категорія<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Усі категорії</option>{Array.from(new Set([...categories,...draft.map(categoryOf)])).map(c=><option key={c}>{c}</option>)}</select></label></div>
  {!draft.some(r=>(!category||categoryOf(r)===category)&&matches(r,query))&&<p>Нічого не знайдено. Зміни пошук або категорію.</p>}
  {Array.from(new Set([...categories,...draft.map(categoryOf)])).filter(c=>!category||c===category).map(c=>{
   const rows=draft.filter(r=>categoryOf(r)===c&&matches(r,query));
   return rows.length>0&&<section key={c}><h3>{c} · {rows.length}</h3>{rows.map(r=><article className="price" key={r.id}><div><b>{r.name}</b><small style={{display:"block"}}>{r.aliases.find(a=>/[а-яіїєґ]/i.test(a))} · {r.unit}</small><b>${bounds(r).min}–${bounds(r).max}</b>
   <label>Категорія<select disabled={saving} value={categoryOf(r)} onChange={e=>replace(draft.map(p=>p.id===r.id?{...p,category:e.target.value}:p))}>{Array.from(new Set([...categories,categoryOf(r)])).map(c=><option key={c}>{c}</option>)}</select></label>
   {chicagoPrices[r.id]?<small style={{display:"block"}}><a href={chicagoPrices[r.id].url} target="_blank" rel="noreferrer">{chicagoPrices[r.id].source}</a> · прайс джерела: ${chicagoPrices[r.id].low}–${chicagoPrices[r.id].high}<br/>{chicagoPrices[r.id].scope}</small>:<small>Власна / базова ставка; ринкове джерело не перевірене.</small>}
   {!validPrice(r)&&<p role="alert">Потрібно: від ≤ вибрана ставка ≤ до.</p>}</div><div>
   {(["rateMin","rateMax","rate"] as const).map(field=><label key={field}>{field==="rateMin"?"Від, $":field==="rateMax"?"До, $":"Вибрана ставка, $"}<input aria-label={`${field}: ${r.name}`} type="number" min="0" step="0.01" disabled={saving} value={invalid.includes(r.id+field)?"":field==="rate"?r.rate:field==="rateMin"?bounds(r).min:bounds(r).max} onChange={e=>{
    const raw=e.target.value;const value=Number(raw);const key=r.id+field;
    setInvalid(v=>raw===""||!Number.isFinite(value)||value<0?[...v.filter(id=>id!==key),key]:v.filter(id=>id!==key));
    setDraft(v=>v.map(p=>p.id===r.id?{...p,rateMin:bounds(p).min,rateMax:bounds(p).max,[field]:value}:p));setDirty(true);setStatus("");
   }}/></label>)}
   </div></article>)}</section>;
  })}
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
