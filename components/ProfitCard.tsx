"use client";
import {profitOf,helperMargins,type Statement} from "@/lib/statement";

// 💰 Прибуток по проєкту зараз: робота − помічники; попередження, якщо маржа < 25%.
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
export default function ProfitCard({st}:{st:Statement}){
  const p=profitOf(st);const hm=helperMargins(st);const usd=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n||0);
  if(!(p.labor>0))return null;
  const color=p.low?"#b42318":(p.margin??100)<40?"#b54708":"#067647";
  const row=(l:string,v:string,b=false)=><div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:b?17:15}}><span>{l}</span>{b?<b style={{color}}>{v}</b>:<span>{v}</span>}</div>;
  return <section className="panel" style={{borderLeft:`5px solid ${color}`}}>
    <div className="head"><h2>💰 Прибуток</h2>{p.margin!==null&&<b style={{color,fontSize:20}}>{p.margin}%</b>}</div>
    {row("Робота за контрактом",money(p.labor))}
    {p.matFee>0&&row("+ Закупівля й доставка матеріалів","+"+money(p.matFee))}
    {p.matKeep-p.matFee>0&&row("+ Матеріали дешевше за естімейт","+"+money(p.matKeep-p.matFee))}
    {p.matKeep-p.matFee<0&&row("− Матеріали (входять у ціну)","−"+money(-(p.matKeep-p.matFee)))}
    {p.cost>0?row(`− Помічники (${p.helperHours} год)`,"−"+money(p.cost)):<small className="muted" style={{display:"block"}}>Помічників не записано — уся робота твоя.</small>}
    {row("= Твій прибуток",money(p.profit),true)}
    <small className="muted" style={{display:"block",marginTop:2}}>{p.matKeep<0?"Ціна «під ключ»: матеріали входять у ціну, тому чеки зменшують прибуток.":"Матеріали клієнт оплачує окремо (за чеками або фіксовано за естімейтом), тому чеки не зменшують прибуток."} Вже на руках зараз: <b>{money(p.cash)}</b> (отримано − чеки − помічники).</small>
    {hm&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #eaecf0"}}>
      <b style={{fontSize:15}}>👷 Скільки я заробляю з помічника</b>
      <small className="muted" style={{display:"block",margin:"2px 0 6px"}}>Година на цьому проєкті приносить <b>{usd(hm.perHour)}</b> (робота ÷ усі записані години).</small>
      {hm.rows.map(r=>{const c=r.keepHour<0?"#b42318":r.keepHour<10?"#b54708":"#067647";return <div key={r.name} style={{padding:"6px 0",fontSize:15}}>
        <div style={{display:"flex",justifyContent:"space-between"}}><span>{r.name} · {r.hours} год</span><b style={{color:c}}>{r.keep<0?"−":"+"}{usd(Math.abs(r.keep))}</b></div>
        <small className="muted">приносить {usd(r.brings)} − йому {usd(r.cost)} ({usd(r.costHour)}/год) → мені <b style={{color:c}}>{usd(r.keepHour)}/год</b></small>
        {r.keepHour<0?<small style={{display:"block",color:"#b42318"}}>⚠ Доплачуєш за нього зі свого заробітку.</small>:r.keepHour<10?<small style={{display:"block",color:"#b54708"}}>Малувато: на помічнику варто мати від $15–20/год.</small>:null}
      </div>})}
      {!(hm.myHours>0)&&<small style={{display:"block",color:"#b54708"}}>Твої години на цьому проєкті не записані — цифри завищені. Запиши свої години, щоб було точно.</small>}
    </div>}
    {p.low&&<p style={{margin:"8px 0 0",padding:10,borderRadius:10,background:"#fef3f2",color:"#b42318",fontSize:14}}>⚠ Помічники вже забирають {100-(p.margin??0)}% роботи. Перевір години або домовся про доплату (change order), поки не пішов у мінус.</p>}
  </section>;
}
