"use client";
import {useEffect,useRef,useState} from "react";
import type {PriceRule} from "@/lib/types";
import {chicagoPrices,applyChicagoPrices} from "@/lib/chicagoPrices";
import {categories,categoryOf,bounds,validPrice,matches} from "@/lib/priceCatalog";
import {defaults} from "@/lib/defaults";
import {raisePrices} from "@/lib/priceHistory";

// знімок цін перед «Підняти на X%» — щоб можна було відкотити
const SNAP="qc_prices_before_raise";
type Snap={date:string;pct:number;prices:PriceRule[]};
const readSnap=():Snap|null=>{try{const v=JSON.parse(localStorage.getItem(SNAP)||"null");return v&&Array.isArray(v.prices)?v:null}catch{return null}};

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
 const [pct,setPct]=useState(5);
 const [withMat,setWithMat]=useState(false);
 const [preview,setPreview]=useState<PriceRule[]|null>(null);
 const [snap,setSnap]=useState<Snap|null>(null);
 useEffect(()=>{setSnap(readSnap())},[]);
 function applyRaise(){
  if(!preview)return;
  const s:Snap={date:new Date().toISOString(),pct,prices:copy(prices)};
  try{localStorage.setItem(SNAP,JSON.stringify(s))}catch{/* без відкату на цьому пристрої */}
  setSnap(s);replace(preview);setPreview(null);
  setStatus(`Ціни підняті на ${pct}% у формі. Натисни «Зберегти ціни», щоб застосувати.`);
 }
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
  <details style={{margin:"10px 0"}} open={!!preview}>
   <summary><b>⬆ Підняти всі ціни на X%</b></summary>
   <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"end",marginTop:8}}>
    <label style={{width:110}}>На скільки, %<input type="number" step="0.5" value={pct} onChange={e=>{setPct(Number(e.target.value)||0);setPreview(null)}}/></label>
    <label style={{display:"flex",gap:6,alignItems:"center"}}><input type="checkbox" style={{width:"auto"}} checked={withMat} onChange={e=>{setWithMat(e.target.checked);setPreview(null)}}/>і матеріали</label>
    <button className="secondary" disabled={saving||!pct} onClick={()=>setPreview(raisePrices(draft,pct,withMat))}>Переглянути</button>
   </div>
   {preview&&<div className="statusMessage" style={{marginTop:8}}>
    <p>Праця{withMat?" і матеріали":""} {pct>0?"+":""}{pct}% для {preview.filter((p,i)=>p.rate!==draft[i].rate||(p.materialRate||0)!==(draft[i].materialRate||0)).length} позицій. Наприклад:</p>
    <ul style={{margin:"6px 0",paddingLeft:18}}>{preview.map((p,i)=>({p,o:draft[i]})).filter(x=>x.p.rate!==x.o.rate).slice(0,6).map(x=><li key={x.p.id} style={{fontSize:14}}>{x.p.name}: ${x.o.rate} → <b>${x.p.rate}</b>/{x.p.unit}</li>)}</ul>
    <small className="muted">Округлення: від $20 — до долара, $5–20 — до 50¢. Старі ціни запам'ятаю — можна буде відкотити.</small>
    <div className="actions" style={{marginTop:8}}><button className="primary" onClick={applyRaise}>Застосувати</button><button className="secondary" onClick={()=>setPreview(null)}>Скасувати</button></div>
   </div>}
   {snap&&!preview&&<button className="secondary full" style={{marginTop:8}} disabled={saving} onClick={()=>{if(confirm(`Повернути ціни, які були до підвищення на ${snap.pct}% (${new Date(snap.date).toLocaleDateString("uk-UA")})? Потім натисни «Зберегти ціни».`)){replace(snap.prices);setStatus("Повернуто ціни до підвищення. Натисни «Зберегти ціни».")}}}>↩ Відкотити підвищення на {snap.pct}% від {new Date(snap.date).toLocaleDateString("uk-UA")}</button>}
  </details>
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
   return rows.length>0&&<section key={c}><h3>{c} · {rows.length}</h3>{rows.map(r=><article className="price" key={r.id}><div><b>{r.name}</b><small style={{display:"block"}}>{r.aliases.find(a=>/[а-яіїєґ]/i.test(a))} · {r.unit}</small><b>${bounds(r).min}–${bounds(r).max}</b>{((r.materialRate??0)>0||(r.finishRate??0)>0)&&<small> · праця {r.rate} + матеріали {r.materialRate||0}{(r.finishRate??0)>0?` + оздоблення ${r.finishRate}`:""} = {Math.round((r.rate+(r.materialRate||0)+(r.finishRate||0))*100)/100}/{r.unit}</small>}
   {(r.materialNote||r.finishNote)&&<details><summary style={{fontSize:13}}>З чого складаються матеріали</summary>{r.materialNote&&<small style={{display:"block"}}>Матеріали: {r.materialNote}</small>}{r.finishNote&&<small style={{display:"block"}}>Оздоблення: {r.finishNote}</small>}</details>}
   <label>Категорія<select disabled={saving} value={categoryOf(r)} onChange={e=>replace(draft.map(p=>p.id===r.id?{...p,category:e.target.value}:p))}>{Array.from(new Set([...categories,categoryOf(r)])).map(c=><option key={c}>{c}</option>)}</select></label>
   {chicagoPrices[r.id]?<small style={{display:"block"}}><a href={chicagoPrices[r.id].url} target="_blank" rel="noreferrer">{chicagoPrices[r.id].source}</a> · прайс джерела: ${chicagoPrices[r.id].low}–${chicagoPrices[r.id].high}<br/>{chicagoPrices[r.id].scope}</small>:<small>Власна / базова ставка; ринкове джерело не перевірене.</small>}
   {!validPrice(r)&&<p role="alert">Потрібно: від ≤ вибрана ставка ≤ до.</p>}</div><div>
   {(["rateMin","rateMax","rate"] as const).map(field=><label key={field}>{field==="rateMin"?"Від, $":field==="rateMax"?"До, $":"Вибрана ставка, $"}<input aria-label={`${field}: ${r.name}`} type="number" min="0" step="0.01" disabled={saving} value={invalid.includes(r.id+field)?"":field==="rate"?r.rate:field==="rateMin"?bounds(r).min:bounds(r).max} onChange={e=>{
    const raw=e.target.value;const value=Number(raw);const key=r.id+field;
    setInvalid(v=>raw===""||!Number.isFinite(value)||value<0?[...v.filter(id=>id!==key),key]:v.filter(id=>id!==key));
    setDraft(v=>v.map(p=>p.id===r.id?{...p,rateMin:bounds(p).min,rateMax:bounds(p).max,[field]:value}:p));setDirty(true);setStatus("");
   }}/></label>)}
   <label>Матеріали, $/од<input aria-label={`materialRate: ${r.name}`} type="number" min="0" step="0.01" disabled={saving} value={r.materialRate??0} onChange={e=>{
    const value=Math.max(0,Number(e.target.value)||0);
    setDraft(v=>v.map(p=>p.id===r.id?{...p,materialRate:value,materialOwn:true}:p));setDirty(true);setStatus("");
   }}/></label>
   <label>Оздоблення, $/од<input aria-label={`finishRate: ${r.name}`} type="number" min="0" step="0.01" disabled={saving} value={r.finishRate??0} onChange={e=>{
    const value=Math.max(0,Number(e.target.value)||0);
    setDraft(v=>v.map(p=>p.id===r.id?{...p,finishRate:value,finishOwn:true}:p));setDirty(true);setStatus("");
   }}/></label>
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
