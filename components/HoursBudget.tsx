"use client";
import {hoursBudget,TARGET_HOUR,type Statement} from "@/lib/statement";

// ⏱ Бюджет годин: робота ÷ цільова ціна години = скільки годин бригади вміщається в ціну. Попереджає ще посеред роботи.
export default function HoursBudget({st,onPatch}:{st:Statement;onPatch:(p:Partial<Statement>)=>void}){
  const b=hoursBudget(st);
  if(!b)return null;
  const color=b.level==="over"?"#b42318":b.level==="warn"?"#b54708":"#067647";
  const edit=()=>{
    const a=window.prompt(`Скільки годин на всю бригаду закладаєш на цей проєкт?\nПорожньо — рахувати автоматично ($${TARGET_HOUR}/год).`,b.manual?String(b.plan):"");
    if(a===null)return;const n=Number(String(a).replace(",","."));
    onPatch({hoursPlan:n>0?Math.round(n*10)/10:undefined});
  };
  return <section className="panel" style={{borderLeft:`5px solid ${color}`}}>
    <div className="head"><h2>⏱ Бюджет годин</h2><b style={{color,fontSize:20}}>{b.pct}%</b></div>
    <div style={{height:12,borderRadius:8,background:"#eaecf0",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,b.pct)}%`,background:color}}/></div>
    <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:15}}><span>Використано <b>{b.used}</b> з <b>{b.plan}</b> год</span><b style={{color}}>{b.left>=0?`лишилось ${b.left}`:`перевитрата ${-b.left}`} год</b></div>
    {b.perHour!==null&&<small className="muted" style={{display:"block",marginTop:4}}>Зараз година бригади виходить по <b>${b.perHour}</b>.</small>}
    {b.level==="warn"&&<p style={{margin:"8px 0 0",padding:10,borderRadius:10,background:"#fffaeb",color:"#b54708",fontSize:14}}>Години закінчуються. Якщо роботи ще багато — подивись, що додалось понад естімейт, і оформ доплату.</p>}
    {b.level==="over"&&<p style={{margin:"8px 0 0",padding:10,borderRadius:10,background:"#fef3f2",color:"#b42318",fontSize:14}}>⚠ Бюджет годин вичерпано — кожна наступна година зменшує твій заробіток. Усе, що понад естімейт, оформлюй доплатою.</p>}
    <button className="secondary" style={{marginTop:8,padding:"6px 10px",fontSize:13}} onClick={edit}>{b.manual?"Змінити бюджет годин":`Рахується автоматично з $${TARGET_HOUR}/год · змінити`}</button>
  </section>;
}
