"use client";
import {useState} from "react";
import {statementTotals,type Statement} from "@/lib/statement";
import type {SavedCalc} from "@/lib/calcTypes";
import {computeCalcLine} from "@/lib/calcEngine";

// 📦 Матеріали: естімейт → факт. Що закладали на початку, скільки вже пішло за чеками, і як виставляти клієнту.
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
export default function MaterialsCompare({st,calc,planMat,onPatch}:{st:Statement;calc:SavedCalc|null;planMat:number|null;onPatch:(p:Partial<Statement>)=>void}){
  const [showLines,setShowLines]=useState(false);
  const t=statementTotals(st);
  const plan=t.fixed?t.matPlan:(planMat??(Number(st.matPlan)||0));
  if(!(plan>0)&&!st.receipts.length)return null;
  const spent=t.receipts;const diff=Math.round((spent-plan)*100)/100;
  const pct=plan>0?Math.min(100,Math.round(spent/plan*100)):100;
  const over=plan>0&&spent>plan;
  const lines=calc?(calc.items||[]).filter(li=>!li.optional).map(li=>{const c=computeCalcLine(li,calc.locationMultiplier??1,calc.includeFinish!==false);return {name:li.name,mat:Math.round(c.materials+c.supplies+c.finish)}}).filter(x=>x.mat>0):[];
  const setMode=(m:"receipts"|"estimate")=>onPatch(m==="estimate"?{matMode:"estimate",matPlan:Number(st.matPlan)||planMat||0}:{matMode:"receipts"});
  const pill=(on:boolean):React.CSSProperties=>({flex:1,padding:"10px 8px",borderRadius:12,fontWeight:800,fontSize:13,background:on?"#101828":"#eef2f7",color:on?"#fff":"#344054",textAlign:"left"});
  return <section className="panel">
    <div className="head"><h2>📦 Матеріали: естімейт → факт</h2></div>
    {plan>0?<>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,margin:"8px 0",textAlign:"center"}}>
        <div><small className="muted">За естімейтом</small><b style={{display:"block",fontSize:18}}>{money(plan)}</b></div>
        <div><small className="muted">Вже за чеками</small><b style={{display:"block",fontSize:18}}>{money(spent)}</b><small className="muted">{st.receipts.length} чек.</small></div>
        <div><small className="muted">{over?"Перевищення":"Лишається"}</small><b style={{display:"block",fontSize:18,color:over?"#b42318":"#067647"}}>{over?"+":""}{money(Math.abs(diff))}</b></div>
      </div>
      <div style={{height:10,borderRadius:5,background:"#eaecf0",overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",background:over?"#d92d20":pct>85?"#f79009":"#12b76a"}}/></div>
      <small className="muted" style={{display:"block",marginTop:4}}>{over?`Чеки вже на ${money(diff)} більше, ніж закладали (${Math.round(spent/plan*100)}%).`:`Використано ${pct}% матеріалів з естімейту.`}</small>
      {lines.length>0&&<><button className="secondary" onClick={()=>setShowLines(v=>!v)} style={{marginTop:8,padding:"6px 10px",fontSize:13}}>{showLines?"Сховати":"Що закладали в естімейт"} ({lines.length})</button>
        {showLines&&<div style={{marginTop:6}}>{lines.map((l,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"4px 0",borderTop:"1px solid #f2f4f7",fontSize:14}}><span data-notr>{l.name}</span><span>{money(l.mat)}</span></div>)}</div>}</>}
    </>:<p className="muted" style={{fontSize:14}}>Прив'яжи естімейт у «📊 План / факт» нижче або впиши суму матеріалів вручну, щоб бачити різницю.</p>}

    <h3 style={{margin:"14px 0 6px"}}>Як рахувати матеріали клієнту</h3>
    <div style={{display:"flex",gap:6}}>
      <button onClick={()=>setMode("receipts")} style={pill(!t.fixed&&st.matMode!=="estimate")}>За чеками<small style={{display:"block",fontWeight:500,opacity:.8}}>клієнт платить рівно стільки, скільки в чеках</small></button>
      <button onClick={()=>setMode("estimate")} style={pill(st.matMode==="estimate")}>За естімейтом<small style={{display:"block",fontWeight:500,opacity:.8}}>більше — доплата клієнту, менше — різниця твоя</small></button>
    </div>
    {st.matMode==="estimate"&&<label style={{marginTop:8,display:"block"}}>Сума матеріалів за естімейтом, $<input type="number" min={0} step={1} value={st.matPlan??""} onChange={e=>onPatch({matPlan:e.target.value===""?undefined:Math.max(0,Number(e.target.value)||0)})}/></label>}
    <div style={{marginTop:8,padding:10,borderRadius:10,fontSize:14,lineHeight:1.45,background:t.fixed?(t.matOver>0?"#fef3f2":"#ecfdf3"):"#f8fafc",color:t.fixed?(t.matOver>0?"#b42318":"#067647"):"#344054"}}>
      {t.fixed
        ?t.matOver>0?<>У рахунку клієнту: матеріали за естімейтом <b>{money(t.matPlan)}</b> + окремий рядок <b>«Additional materials (over estimate)» {money(t.matOver)}</b>. Чеки клієнт бачить як підтвердження.</>
          :<>Клієнт платить за матеріали <b>{money(t.matPlan)}</b>, як в естімейті. Зараз витрачено {money(t.receipts)}{t.matKeep>0?<> — якщо так і лишиться, <b>{money(t.matKeep)}</b> твої (вже додано в 💰 Прибуток)</>:""}. Чеки клієнт не бачить, поки не вийде більше.</>
        :plan>0?<>Клієнт платить рівно за чеками: <b>{money(spent)}</b>.{!over&&spent<plan?<> Це на {money(plan-spent)} менше, ніж в естімейті — цю різницю клієнт не платить. Хочеш залишити її собі — вибери «За естімейтом».</>:over?<> Перевищення {money(diff)} клієнт і так оплатить за чеками.</>:null}</>
        :<>Клієнт платить рівно за чеками: <b>{money(spent)}</b>.</>}
    </div>
  </section>;
}
