"use client";
import {profitOf,type Statement} from "@/lib/statement";

// 💰 Прибуток по проєкту зараз: робота − помічники; попередження, якщо маржа < 25%.
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
export default function ProfitCard({st}:{st:Statement}){
  const p=profitOf(st);
  if(!(p.labor>0))return null;
  const color=p.low?"#b42318":(p.margin??100)<40?"#b54708":"#067647";
  const row=(l:string,v:string,b=false)=><div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:b?17:15}}><span>{l}</span>{b?<b style={{color}}>{v}</b>:<span>{v}</span>}</div>;
  return <section className="panel" style={{borderLeft:`5px solid ${color}`}}>
    <div className="head"><h2>💰 Прибуток</h2>{p.margin!==null&&<b style={{color,fontSize:20}}>{p.margin}%</b>}</div>
    {row("Робота за контрактом",money(p.labor))}
    {p.cost>0?row(`− Помічники (${p.helperHours} год)`,"−"+money(p.cost)):<small className="muted" style={{display:"block"}}>Помічників не записано — уся робота твоя.</small>}
    {row("= Твій прибуток",money(p.profit),true)}
    <small className="muted" style={{display:"block",marginTop:2}}>Чеки клієнт оплачує окремо, тому вони не зменшують прибуток. Вже на руках зараз: <b>{money(p.cash)}</b> (отримано − чеки − помічники).</small>
    {p.low&&<p style={{margin:"8px 0 0",padding:10,borderRadius:10,background:"#fef3f2",color:"#b42318",fontSize:14}}>⚠ Помічники вже забирають {100-(p.margin??0)}% роботи. Перевір години або домовся про доплату (change order), поки не пішов у мінус.</p>}
  </section>;
}
