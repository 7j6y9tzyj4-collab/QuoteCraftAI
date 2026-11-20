"use client";
// 🛒 Найближчі магазини до об'єкта: натиснув — Карти шукають цей магазин біля адреси проєкту і ведуть туди.
export const STORES=["Home Depot","Menards","Lowe's","Sherwin-Williams","Floor & Decor"];
export const storeHref=(store:string,address:string)=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store} near ${address}`)}`;
export default function StoreLinks({address,title="🛒 Найближчі магазини",compact}:{address?:string;title?:string;compact?:boolean}){
  const a=String(address||"").trim();if(!a)return null;
  return <div style={{marginTop:compact?8:10}}>
    <small style={{display:"block",color:"#667085",fontWeight:700,marginBottom:6}}>{title}</small>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {STORES.map(s=><a key={s} href={storeHref(s,a)} target="_blank" rel="noreferrer" data-notr
        style={{padding:"7px 11px",borderRadius:999,background:"#fff7ed",border:"1px solid #fed7aa",color:"#9a3412",fontWeight:700,fontSize:13,textDecoration:"none",whiteSpace:"nowrap"}}>{s}</a>)}
    </div>
  </div>;
}
