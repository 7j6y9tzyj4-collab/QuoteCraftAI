"use client";
import {useEffect,useRef,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import type {Statement} from "@/lib/statement";
import {changeTotal,newChangeOrder,DEFAULT_CHANGE_NOTES,type ChangeOrder,type ChangeSnapshot} from "@/lib/changeOrder";
import {COMPANY_NAME,COMPANY_CONTACT} from "@/lib/calcPdf";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const CYR=/[а-яіїєґё]/i;
async function translate(texts:string[]):Promise<string[]>{
  const r=await fetch("/api/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({texts})});
  const d=await r.json();if(!r.ok)throw new Error(d?.error||"translate error");
  return d.texts;
}
const STATUS:Record<ChangeOrder["status"],string>={draft:"чернетка",sent:"надіслано",viewed:"👁 переглянув",accepted:"✓ погоджено"};

// Доплати по ходу роботи: створив → «🔗 Надіслати» → клієнт тисне Approve → сума сама додається в «Роботу».
export default function ChangeOrders({st,user,onPatch,setMsg}:{st:Statement;user:User|null;onPatch:(p:Partial<Statement>)=>void;setMsg:(m:string)=>void}){
  const list=st.changes||[];
  const [busyId,setBusyId]=useState("");
  const stRef=useRef(st);stRef.current=st;

  const save=(changes:ChangeOrder[],extra:Partial<Statement>={})=>onPatch({changes,...extra});
  const setCo=(id:string,patch:Partial<ChangeOrder>)=>save(list.map(c=>c.id===id?{...c,...patch}:c));

  // погоджено → рядок у «Роботі»
  function acceptInto(s:Statement,id:string,patch:Partial<ChangeOrder>):Partial<Statement>{
    const changes=(s.changes||[]).map(c=>c.id===id?{...c,...patch}:c);
    const co=changes.find(c=>c.id===id)!;
    if(co.laborLineId&&s.labor.some(l=>l.id===co.laborLineId))return {changes};
    const lineId=crypto.randomUUID();
    const desc=`Change order #${co.no}${co.title?`: ${co.title}`:""}`;
    return {changes:changes.map(c=>c.id===id?{...c,laborLineId:lineId}:c),labor:[...s.labor,{id:lineId,description:desc,amount:changeTotal(co)}]};
  }

  // при відкритті — перевіряємо, чи клієнт уже погодив
  useEffect(()=>{
    const pending=(st.changes||[]).filter(c=>c.token&&c.status!=="accepted");
    if(!pending.length||!user)return;
    let on=true;
    supabase.from("shared_quotes").select("token,status,accepted_at,accepted_name").in("token",pending.map(c=>c.token!)).then(({data}:{data:any[]|null})=>{
      if(!on||!data)return;
      let s=stRef.current;let patch:Partial<Statement>={};const okNos:number[]=[];
      for(const row of data){
        const co=(s.changes||[]).find(c=>c.token===row.token);if(!co)continue;
        if(row.status==="accepted"){
          patch=acceptInto(s,co.id,{status:"accepted",acceptedAt:row.accepted_at||undefined,acceptedName:row.accepted_name||undefined});
          s={...s,...patch};okNos.push(co.no);
        }else if(row.status!==co.status&&(row.status==="viewed"||row.status==="sent")){
          patch={changes:(s.changes||[]).map(c=>c.id===co.id?{...c,status:row.status}:c)};s={...s,...patch};
        }
      }
      if(s!==stRef.current)onPatch({changes:s.changes,labor:s.labor});
      if(okNos.length)setMsg(`Клієнт погодив доплату #${okNos.join(", #")} — суму додано в «Роботу».`);
    });
    return()=>{on=false};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[st.id,user]);

  function add(){
    const no=Math.max(0,...list.map(c=>c.no))+1;
    save([...list,{...newChangeOrder(no),notes:DEFAULT_CHANGE_NOTES}]);
  }
  // українською → англійською (назва, рядки, примітка)
  async function toEnglish(co:ChangeOrder):Promise<ChangeOrder|null>{
    setBusyId(co.id);
    try{
      const src=[co.title,...co.lines.map(l=>l.description),co.notes||""];
      const out=await translate(src);
      const next:ChangeOrder={...co,title:out[0],lines:co.lines.map((l,i)=>({...l,description:out[i+1]})),notes:out[src.length-1]};
      setCo(co.id,{title:next.title,lines:next.lines,notes:next.notes});
      return next;
    }catch(e){setMsg("Не вдалося перекласти: "+(e instanceof Error?e.message:String(e)));return null}
    finally{setBusyId("")}
  }
  async function send(co0:ChangeOrder){
    let co=co0;
    // якщо є українські літери — спершу перекладаємо, клієнт бачить англійською
    if(CYR.test([co.title,...co.lines.map(l=>l.description),co.notes||""].join(" "))){const t=await toEnglish(co);if(!t)return;co=t}
    if(!user){setMsg("Увійди в акаунт, щоб надіслати посилання.");return}
    const total=changeTotal(co);
    if(!co.lines.some(l=>l.description.trim()&&l.amount)){setMsg("Додай опис і суму доплати.");return}
    const data:ChangeSnapshot={v:1,kind:"change",company:COMPANY_NAME,contact:COMPANY_CONTACT,client:st.client,project:st.project,
      date:new Date().toLocaleDateString("en-US"),no:co.no,title:co.title,lines:co.lines.filter(l=>l.description.trim()||l.amount).map(l=>({description:l.description,amount:Number(l.amount)||0})),total,notes:co.notes||""};
    try{
      let token=co.token||"";
      if(token){
        const {data:row,error}=await supabase.from("shared_quotes").update({data,updated_at:new Date().toISOString()}).eq("token",token).select("token").maybeSingle();
        if(error)throw error;if(!row)token="";
      }
      if(!token){
        token=crypto.randomUUID();
        const {error}=await supabase.from("shared_quotes").insert({token,user_id:user.id,data,status:"sent"});
        if(error)throw error;
      }
      setCo(co.id,{token,status:co.status==="draft"?"sent":co.status});
      const link=`${window.location.origin}/q/${token}`;
      const nav=navigator as Navigator&{share?:(d:ShareData)=>Promise<void>};
      if(nav.share&&/iPhone|iPad|Android/i.test(navigator.userAgent)){try{await nav.share({text:link});setMsg("Посилання на доплату надіслано.");return}catch{/* скасував */}}
      try{await navigator.clipboard.writeText(link);setMsg("Посилання на доплату скопійовано: "+link)}catch{setMsg("Посилання: "+link)}
    }catch(e){setMsg("Не вдалося надіслати: "+(e instanceof Error?e.message:String((e as any)?.message||e)))}
  }
  function manual(co:ChangeOrder){
    if(!confirm(`Клієнт погодив доплату #${co.no} (${money(changeTotal(co))}) усно? Сума додасться в «Роботу».`))return;
    onPatch(acceptInto(st,co.id,{status:"accepted",manual:true,acceptedAt:new Date().toISOString()}));
  }
  function remove(co:ChangeOrder){
    if(!confirm(`Видалити доплату #${co.no}?`))return;
    save(list.filter(c=>c.id!==co.id));
    if(co.token&&user)supabase.from("shared_quotes").delete().eq("token",co.token).then(()=>{});
  }

  return <section className="panel">
    <div className="head"><h2>Доплати (change orders)</h2><button className="add" onClick={add}>＋ Доплата</button></div>
    {!list.length&&<p className="muted" style={{fontSize:14}}>Додаткова робота після прийнятого естімейту: створи доплату → «🔗 Надіслати» → клієнт тисне Approve → сума сама додається в «Роботу».</p>}
    {list.map(co=>{
      const locked=co.status==="accepted";
      const t=changeTotal(co);
      return <div key={co.id} style={{marginTop:12,padding:12,borderRadius:14,background:locked?"#ecfdf3":"#f8fafc",border:"1px solid #e4e7ec"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
          <b>#{co.no} {co.title||"Доплата"}</b>
          <span style={{fontSize:13,color:locked?"#067647":"#667085",whiteSpace:"nowrap"}}>{STATUS[co.status]}{locked&&co.acceptedName?` — ${co.acceptedName}`:""}{locked&&co.manual?" (усно)":""}</span>
        </div>
        {!locked&&<label style={{marginTop:8}}>Назва<input value={co.title} placeholder="можна українською: додаткова розетка в коморі" onChange={e=>setCo(co.id,{title:e.target.value})}/></label>}
        {co.lines.map(l=><div key={l.id} style={{display:"grid",gridTemplateColumns:locked?"1fr 110px":"1fr 110px 42px",gap:8,marginTop:8}}>
          {locked?<><span style={{fontSize:14}}>{l.description}</span><span style={{textAlign:"right",fontSize:14}}>{money(l.amount)}</span></>:<>
            <input placeholder="Що робимо (можна українською)" value={l.description} onChange={e=>setCo(co.id,{lines:co.lines.map(x=>x.id===l.id?{...x,description:e.target.value}:x)})}/>
            <input type="number" step="0.01" value={l.amount} onChange={e=>setCo(co.id,{lines:co.lines.map(x=>x.id===l.id?{...x,amount:Number(e.target.value)||0}:x)})}/>
            <button className="remove" onClick={()=>setCo(co.id,{lines:co.lines.filter(x=>x.id!==l.id)})}>×</button>
          </>}
        </div>)}
        {!locked&&<button className="secondary" style={{marginTop:8,padding:"6px 10px",fontSize:13}} onClick={()=>setCo(co.id,{lines:[...co.lines,{id:crypto.randomUUID(),description:"",amount:0}]})}>＋ Рядок</button>}
        {!locked&&<details style={{marginTop:8}}><summary style={{fontSize:13}}>Примітка для клієнта</summary><textarea rows={3} value={co.notes||""} onChange={e=>setCo(co.id,{notes:e.target.value})}/></details>}
        <div style={{display:"flex",justifyContent:"space-between",marginTop:10,fontSize:15}}><span>Разом доплата</span><b>{money(t)}</b></div>
        {!locked&&<div className="actions" style={{marginTop:8,flexWrap:"wrap"}}>
          <button className="secondary" disabled={busyId===co.id} onClick={()=>toEnglish(co)}>{busyId===co.id?"Перекладаю…":"🌐 Перекласти на англійську"}</button>
          <button className="primary" disabled={busyId===co.id} onClick={()=>send(co)}>🔗 {co.token?"Оновити й надіслати":"Надіслати клієнту"}</button>
          <button className="secondary" onClick={()=>manual(co)}>✓ Погоджено усно</button>
          <button className="secondary" style={{color:"#b42318",flex:"0 0 auto"}} onClick={()=>remove(co)}>Видалити</button>
        </div>}
        {co.token&&<small className="muted" style={{display:"block",marginTop:6}}><a href={`/q/${co.token}`} target="_blank" rel="noreferrer">відкрити сторінку клієнта</a></small>}
      </div>;
    })}
  </section>;
}
