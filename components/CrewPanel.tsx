"use client";
import type {Statement,CrewMember,WorkEntry,Payout} from "@/lib/statement";
import {crewSummary,isFresh} from "@/lib/statement";
import FoldTitle from "@/components/FoldTitle";
import {useFold} from "@/lib/useFold";
import DateInput from "@/components/DateInput";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const today=()=>new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
const uid=()=>crypto.randomUUID();

// Команда проєкту: я і помічники, години по днях, нараховано / виплачено / винен.
export default function CrewPanel({st,all,onPatch,forceOpen=false}:{st:Statement;all:Statement[];onPatch:(p:Partial<Statement>)=>void;forceOpen?:boolean}){
  const crew=st.crew||[];const log=st.workLog||[];const pay=st.payouts||[];
  const [open,toggle]=useFold("crew",false);
  const sm=crewSummary(st);
  // ставка: беремо з інших проєктів, де вже є людина з таким ім'ям
  const knownRate=(name:string)=>{
    const n=name.trim().toLowerCase();if(!n)return 0;
    for(const s of all){for(const c of s.crew||[])if(c.name.trim().toLowerCase()===n&&c.rate>0)return c.rate}
    return 0;
  };
  const knownNames=Array.from(new Set(all.flatMap(s=>(s.crew||[]).map(c=>c.name.trim()).filter(Boolean))));
  const addPerson=(name:string,self=false)=>{
    if(crew.some(c=>c.name.trim().toLowerCase()===name.trim().toLowerCase()))return;
    onPatch({crew:[...crew,{id:uid(),name,rate:self?0:knownRate(name),self}]});
  };
  const setCrew=(id:string,p:Partial<CrewMember>)=>onPatch({crew:crew.map(c=>c.id===id?{...c,...p}:c)});
  const delCrew=(id:string)=>onPatch({crew:crew.filter(c=>c.id!==id)});
  const setLog=(id:string,p:Partial<WorkEntry>)=>onPatch({workLog:log.map(w=>w.id===id?{...w,...p}:w)});
  const setPay=(id:string,p:Partial<Payout>)=>onPatch({payouts:pay.map(x=>x.id===id?{...x,...p}:x)});
  const names=(id:string)=>crew.find(c=>c.id===id)?.name||"?";
  const suggest=knownNames.filter(n=>!crew.some(c=>c.name.trim().toLowerCase()===n.toLowerCase()));
  const usedIds=new Set([...log.map(w=>w.workerId),...pay.map(p=>p.workerId)]);

  const totalH=Math.round(sm.rows.reduce((a,r)=>a+r.hours,0)*10)/10;const owedAll=sm.rows.filter(r=>!r.self).reduce((a,r)=>a+r.owed,0);
  const fresh=log.some(isFresh);
  return <section className="panel">
    <div className="head"><FoldTitle open={open||fresh||forceOpen} onToggle={toggle} title="👷 Команда й години" summary={`${totalH} год${owedAll>0.5?` · винен помічникам $${Math.round(owedAll)}`:""}`}/></div>
    {(open||fresh||forceOpen)&&<>
    <small className="muted">Записуй години по людях. Помічнику вказуєш ставку $/год, а додаток рахує, скільки він заробив, скільки вже виплачено і скільки ти винен.</small>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
      {crew.length===0&&<button className="add" onClick={()=>addPerson("Я",true)}>＋ Я</button>}
      <button className="add" onClick={()=>onPatch({crew:[...crew,{id:uid(),name:"",rate:0}]})}>＋ Людина</button>
      {suggest.map(n=><button key={n} className="secondary" style={{padding:"8px 12px",fontSize:13}} onClick={()=>addPerson(n)}>＋ {n}</button>)}
    </div>

    {crew.map(c=><div key={c.id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 100px 42px",gap:8,marginTop:8}}>
      <input placeholder={c.self?"Я":"Ім'я помічника"} value={c.name} onChange={e=>setCrew(c.id,{name:e.target.value})}/>
      <input type="number" min="0" step="0.5" placeholder="$/год" value={c.rate||""} onChange={e=>setCrew(c.id,{rate:Math.max(0,Number(e.target.value)||0)})} title={c.self?"Моя ставка (необов'язково). Не вважається витратою":"Ставка помічника, $/год"}/>
      <button className="remove" disabled={usedIds.has(c.id)} title={usedIds.has(c.id)?"Є записи — спершу видали їх":"Видалити"} onClick={()=>delCrew(c.id)} style={usedIds.has(c.id)?{opacity:0.4}:undefined}>×</button>
    </div>)}

    {crew.length>0&&<>
      <div className="head" style={{marginTop:16}}><h3 style={{margin:0,fontSize:16}}>Години</h3>
        <button className="add" onClick={()=>onPatch({workLog:[...log,{id:uid(),date:today(),workerId:crew[0].id,hours:0}]})}>＋ Години</button></div>
      {log.map(w=><div key={w.id} style={{...(isFresh(w)?{background:"#fffaeb",borderRadius:10,padding:6}:{}),display:"grid",gridTemplateColumns:"minmax(0,125px) minmax(0,1fr) 64px 42px",gap:6,marginTop:8}}>
        <DateInput value={w.date} onChange={v=>setLog(w.id,{date:v})}/>
        <select value={w.workerId} onChange={e=>setLog(w.id,{workerId:e.target.value})}>{crew.map(c=><option key={c.id} value={c.id}>{c.name||"Без імені"}</option>)}</select>
        <input type="number" min="0" step="0.5" value={w.hours||""} placeholder="год" onChange={e=>setLog(w.id,{hours:Math.max(0,Number(e.target.value)||0)})}/>
        <button className="remove" onClick={()=>onPatch({workLog:log.filter(x=>x.id!==w.id)})}>×</button>
        <input style={{gridColumn:"1/4"}} placeholder="Що робили (необов'язково)" value={w.note||""} onChange={e=>setLog(w.id,{note:e.target.value})}/>
        <small style={{gridColumn:"1/5",marginTop:-2,color:w.by?"#7a5af8":"#98a2b3",fontWeight:w.by?700:400}}>{w.by?<>👷 записав {w.by}{isFresh(w)&&<b style={{marginLeft:6,background:"#fdb022",color:"#fff",borderRadius:6,padding:"0 5px",fontSize:10}}>НОВЕ</b>}</>:"✍️ записав ти"}</small>
      </div>)}

      <div className="head" style={{marginTop:16}}><h3 style={{margin:0,fontSize:16}}>Виплати помічникам</h3>
        <button className="add" onClick={()=>onPatch({payouts:[...pay,{id:uid(),date:today(),workerId:(crew.find(c=>!c.self)||crew[0]).id,amount:0}]})}>＋ Виплата</button></div>
      {pay.map(x=><div key={x.id} style={{display:"grid",gridTemplateColumns:"minmax(0,125px) minmax(0,1fr) 84px 42px",gap:6,marginTop:8}}>
        <DateInput value={x.date} onChange={v=>setPay(x.id,{date:v})}/>
        <select value={x.workerId} onChange={e=>setPay(x.id,{workerId:e.target.value})}>{crew.map(c=><option key={c.id} value={c.id}>{c.name||"Без імені"}</option>)}</select>
        <input type="number" min="0" step="0.01" value={x.amount||""} placeholder="$" onChange={e=>setPay(x.id,{amount:Math.max(0,Number(e.target.value)||0)})}/>
        <button className="remove" onClick={()=>onPatch({payouts:pay.filter(y=>y.id!==x.id)})}>×</button>
      </div>)}

      <div style={{marginTop:16,background:"#f8fafc",border:"1px solid #e4e7ec",borderRadius:14,padding:"10px 12px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 54px 76px 76px 76px",gap:6,fontSize:11,color:"#667085",paddingBottom:4}}>
          <span/><span style={{textAlign:"right"}}>год</span><span style={{textAlign:"right"}}>зароб.</span><span style={{textAlign:"right"}}>виплач.</span><span style={{textAlign:"right"}}>винен</span></div>
        {sm.rows.map(r=><div key={r.id} style={{display:"grid",gridTemplateColumns:"1fr 54px 76px 76px 76px",gap:6,fontSize:14,padding:"5px 0",borderTop:"1px solid #eaecf0"}}>
          <b style={{overflow:"hidden",textOverflow:"ellipsis"}}>{r.name||"Без імені"}{r.self?" (я)":""}</b>
          <span style={{textAlign:"right"}}>{r.hours}</span>
          <span style={{textAlign:"right"}}>{r.rate>0?money(r.accrued):"—"}{r.reimb>0&&<small style={{display:"block",color:"#7a5af8"}}>+ чеки {money(r.reimb)}</small>}</span>
          <span style={{textAlign:"right"}}>{r.self?"—":money(r.paid)}</span>
          <b style={{textAlign:"right",color:r.owed>0.005?"#b42318":r.owed<-0.005?"#b54708":"#067647"}}>{r.self?"—":money(r.owed)}</b>
        </div>)}
        <div style={{display:"grid",gridTemplateColumns:"1fr 54px 76px 76px 76px",gap:6,fontSize:14,padding:"7px 0 0",borderTop:"2px solid #d0d5dd",marginTop:4,fontWeight:800}}>
          <span>Разом</span><span style={{textAlign:"right"}}>{sm.hours}</span><span style={{textAlign:"right"}}>{money(sm.cost)}</span><span style={{textAlign:"right"}}>{money(sm.paid)}</span><span style={{textAlign:"right"}}>{money(sm.helperOwed)}</span></div>
        <small className="muted" style={{display:"block",marginTop:4}}>«Разом» по грошах — тільки помічники (без тебе).</small>
        {sm.rows.filter(r=>!r.self&&(r.reimb>0||Math.abs(r.owed)>0.5)).map(r=><div key={"o"+r.id} style={{marginTop:8,padding:"8px 10px",borderRadius:10,background:"#f4f3ff",fontSize:14}}>
          <b>{r.name}:</b> за роботу {money(r.accrued)}{r.reimb>0?<> + 💳 за чеки з його картки {money(r.reimb)}</>:null}{r.paid>0?<> − виплачено {money(r.paid)}</>:null} = <b style={{color:r.owed>0.5?"#b42318":"#067647"}}>винен {money(r.owed)}</b>
        </div>)}
        {sm.rows.some(r=>r.owed<-0.005)&&<small style={{display:"block",marginTop:6,color:"#b54708"}}>Виплачено більше, ніж зароблено (помаранчевий мінус).</small>}
      </div>
    </>}
    </>}
  </section>;
}
