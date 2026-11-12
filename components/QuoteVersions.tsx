"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import type {QuoteSnapshot,QuoteLine} from "@/lib/sharedQuote";

// 🕘 Попередні версії естімейту, який бачив клієнт: кожна зміна на посиланні зберігає стару версію (тригер у базі).
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
type Ver={id:string;data:QuoteSnapshot;total:number;made_at:string|null;replaced_at:string};
const when=(s:string|null)=>s?new Date(s).toLocaleString("uk-UA",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
const key=(l:QuoteLine)=>l.name.trim().toLowerCase();

/** що змінилось від старої версії до новішої */
export function quoteDiff(old:QuoteSnapshot,next:QuoteSnapshot){
  const a=new Map(old.lines.map(l=>[key(l),l])),b=new Map(next.lines.map(l=>[key(l),l]));
  const removed=old.lines.filter(l=>!b.has(key(l)));
  const added=next.lines.filter(l=>!a.has(key(l)));
  const changed=next.lines.filter(l=>a.has(key(l))).map(l=>({now:l,was:a.get(key(l))!})).filter(x=>Math.abs(x.now.total-x.was.total)>0.005||x.now.qty!==x.was.qty);
  return {removed,added,changed,discWas:old.totals.discount||0,discNow:next.totals.discount||0,totalWas:old.totals.total,totalNow:next.totals.total,notes:(old.notes||"")!==(next.notes||"")};
}

export default function QuoteVersions({token,tick}:{token:string;tick?:string|number}){
  const [current,setCurrent]=useState<QuoteSnapshot|null>(null);
  const [list,setList]=useState<Ver[]>([]);const [open,setOpen]=useState(false);const [sel,setSel]=useState("");
  useEffect(()=>{let on=true;
    supabase.from("shared_quote_versions").select("id,data,total,made_at,replaced_at").eq("token",token).order("replaced_at",{ascending:false}).limit(30)
      .then(({data}:{data:any})=>{if(on)setList((data||[]) as Ver[])});
    supabase.from("shared_quotes").select("data").eq("token",token).maybeSingle().then(({data}:{data:any})=>{if(on)setCurrent((data?.data as QuoteSnapshot)||null)});
    return ()=>{on=false}},[token,tick]);
  if(!list.length)return null;
  const row:React.CSSProperties={display:"flex",justifyContent:"space-between",gap:10,padding:"3px 0",fontSize:14};
  return <div className="noPrint" style={{marginTop:8,border:"1px solid #e4e7ec",borderRadius:12,padding:"10px 12px",background:"#fcfcfd"}}>
    <button onClick={()=>setOpen(o=>!o)} style={{border:"none",background:"none",padding:0,fontWeight:700,fontSize:15,color:"#344054",width:"100%",textAlign:"left"}}>🕘 Попередні версії цього естімейту · {list.length} {open?"▾":"▸"}</button>
    {open&&<div style={{marginTop:6}}>
      <small className="muted" style={{display:"block",marginBottom:6}}>Кожного разу, коли естімейт на посиланні клієнта змінюється, стара версія зберігається тут. Натисни на версію — побачиш, що змінилось після неї.</small>
      {list.map((v,i)=>{const next=i===0?current:list[i-1].data;const d=next?quoteDiff(v.data,next):null;const on=sel===v.id;
        return <div key={v.id} style={{borderTop:"1px solid #f2f4f7",padding:"8px 0"}}>
          <button onClick={()=>setSel(on?"":v.id)} style={{display:"flex",justifyContent:"space-between",gap:10,width:"100%",border:"none",background:"none",padding:0,textAlign:"left",color:"#101828"}}>
            <span><b>{money(v.total)}</b><small className="muted" style={{display:"block"}}>діяла {v.made_at?`з ${when(v.made_at)} `:""}до {when(v.replaced_at)}</small></span>
            <span style={{color:"#2f6df6",fontWeight:600,flex:"none"}}>{on?"сховати":"що змінилось"}</span>
          </button>
          {on&&d&&<div style={{marginTop:8,padding:"10px 12px",borderRadius:10,background:"#f9fafb"}}>
            <div style={{...row,fontWeight:700}}><span>Разом</span><span>{money(d.totalWas)} → {money(d.totalNow)}</span></div>
            {(d.discWas>0||d.discNow>0)&&<div style={row}><span>Знижка</span><span>{money(d.discWas)} → {money(d.discNow)}</span></div>}
            {d.removed.length>0&&<><b style={{display:"block",marginTop:8,color:"#b42318"}}>Прибрано</b>{d.removed.map((l,k)=><div key={k} style={row}><span>− {l.name}</span><span>{money(l.total)}</span></div>)}</>}
            {d.added.length>0&&<><b style={{display:"block",marginTop:8,color:"#067647"}}>Додано</b>{d.added.map((l,k)=><div key={k} style={row}><span>+ {l.name}</span><span>{money(l.total)}</span></div>)}</>}
            {d.changed.length>0&&<><b style={{display:"block",marginTop:8,color:"#b54708"}}>Змінено</b>{d.changed.map((x,k)=><div key={k} style={row}><span>{x.now.name}{x.now.qty!==x.was.qty?` (${x.was.qty} → ${x.now.qty} ${x.now.unit})`:""}</span><span>{money(x.was.total)} → {money(x.now.total)}</span></div>)}</>}
            {d.notes&&<small className="muted" style={{display:"block",marginTop:6}}>Текст приміток теж змінився.</small>}
            {!d.removed.length&&!d.added.length&&!d.changed.length&&<small className="muted" style={{display:"block",marginTop:6}}>Рядки робіт ті самі — змінилась тільки сума / знижка.</small>}
            <details style={{marginTop:8}}><summary style={{fontSize:13,color:"#667085"}}>Усі рядки цієї версії ({v.data.lines.length})</summary>
              {v.data.lines.map((l,k)=><div key={k} style={{...row,fontSize:13}}><span>{l.name} · {l.qty} {l.unit}</span><span>{money(l.total)}</span></div>)}
            </details>
          </div>}
        </div>})}
    </div>}
  </div>;
}
