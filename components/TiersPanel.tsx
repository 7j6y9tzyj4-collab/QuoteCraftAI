"use client";
import type {CalcItem} from "@/lib/calcTypes";
import {DEFAULT_TIERS,tierSummary,type Tiers} from "@/lib/tiers";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
const MEDAL=["🥉","🥈","🥇"];

// Калькулятор: увімкнути три варіанти й налаштувати назви / коефіцієнт матеріалів.
export default function TiersPanel({tiers,setTiers,items,loc,includeFinish,discountType,discountValue,depositPct}:{
  tiers?:Tiers;setTiers:(t:Tiers|undefined)=>void;items:CalcItem[];loc:number;includeFinish:boolean;discountType:"percent"|"amount";discountValue:number;depositPct:number;
}){
  const on=!!tiers?.enabled;
  const t=tiers||DEFAULT_TIERS;
  const set=(patch:Partial<Tiers>)=>setTiers({...t,...patch});
  return <section className="panel noPrint">
    <label style={{display:"flex",gap:8,alignItems:"center",fontSize:15}}>
      <input type="checkbox" style={{width:"auto"}} checked={on} onChange={e=>setTiers(e.target.checked?{...t,enabled:true}:(tiers?{...tiers,enabled:false}:undefined))}/>
      <b>🥉🥈🥇 Три варіанти для клієнта (Good / Better / Best)</b>
    </label>
    {on&&<>
      <p className="muted" style={{fontSize:13,margin:"6px 0 0"}}>Праця однакова, матеріали й оздоблення множаться на коефіцієнт. Окремі рядки можна включити лише в деякі варіанти — кнопки 🥉🥈🥇 у кожному рядку. Клієнт за посиланням обирає один і тисне Accept.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginTop:10}}>
        {[0,1,2].map(i=>{
          const s=tierSummary(items,t,i,{loc,includeFinish,discountType,discountValue,depositPct});
          return <div key={i} style={{padding:10,borderRadius:14,border:`2px solid ${t.chosen===i?"#12b76a":i===1?"#2f6df6":"#e4e7ec"}`,background:"#fff"}}>
            <div style={{fontSize:20}}>{MEDAL[i]}{t.chosen===i&&<small style={{color:"#067647",fontSize:12}}> ✓ обрав клієнт</small>}</div>
            <input value={t.names[i]} onChange={e=>{const n=[...t.names] as Tiers["names"];n[i]=e.target.value;set({names:n})}} style={{marginTop:4,padding:8}}/>
            <label style={{marginTop:6,display:"block"}}>Матеріали ×<input type="number" min="0.1" step="0.1" value={t.mult[i]} onChange={e=>{const m=[...t.mult] as Tiers["mult"];m[i]=Math.max(0.1,Number(e.target.value)||1);set({mult:m})}} style={{padding:8}}/></label>
            <b style={{display:"block",marginTop:6,fontSize:17}}>{money(s.total)}</b>
            <small className="muted">{s.items.filter(x=>!x.optional).length} рядків</small>
          </div>;
        })}
      </div>
    </>}
  </section>;
}

// кнопки 🥉🥈🥇 у рядку: у яких варіантах є ця позиція
export function TierToggles({li,onChange}:{li:CalcItem;onChange:(tiers:number[]|undefined)=>void}){
  const cur=li.tiers||[0,1,2];
  return <div className="noPrint" style={{display:"flex",gap:6,alignItems:"center",gridColumn:"1/-1",fontSize:13}}>
    <span className="muted">У варіантах:</span>
    {[0,1,2].map(i=>{const has=cur.includes(i);return <button key={i} type="button" onClick={()=>{const n=has?cur.filter(x=>x!==i):[...cur,i].sort();onChange(n.length===3?undefined:n.length?n:cur)}}
      style={{padding:"4px 10px",borderRadius:10,background:has?"#2f6df6":"#eef2f7",color:has?"#fff":"#98a2b3",fontSize:16}}>{MEDAL[i]}</button>})}
  </div>;
}
