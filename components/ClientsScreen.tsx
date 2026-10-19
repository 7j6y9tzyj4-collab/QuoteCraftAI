"use client";
import {useMemo,useState} from "react";
import type {SavedCalc} from "@/lib/calcTypes";
import type {Statement} from "@/lib/statement";
import {statementTotals} from "@/lib/statement";
import {clientHistory,missingClientNames,newClient,telHref,smsHref,mapHref,type Client} from "@/lib/clients";
import ClientSplats from "@/components/ClientSplats";
import {newSurvey,type Survey} from "@/lib/survey";
import SurveyEditor from "@/components/SurveyEditor";
import type {User} from "@supabase/supabase-js";
import type {CalcTask} from "@/lib/calcTypes";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const d=(iso:string)=>iso?new Date(iso).toLocaleDateString("uk-UA"):"";

// Клієнти: список, картка з телефоном/адресою, уся історія (естімейти, розрахунки, оплачено, винен).
export default function ClientsScreen({clients,calcs,statements,onSave,onDelete,onOpenCalc,onOpenStatement,onNewEstimate,user,tasks,onSurveyToEstimate,onShareBundle}:{
  onShareBundle?:(c:Client,ests:SavedCalc[])=>Promise<string>;
  clients:Client[];calcs:SavedCalc[];statements:Statement[];user:User|null;tasks:CalcTask[];onSurveyToEstimate:(c:Client,s:Survey)=>void;
  onSave:(c:Client)=>void;onDelete:(id:string)=>void;
  onOpenCalc:(c:SavedCalc)=>void;onOpenStatement:(id:string)=>void;onNewEstimate:(c:Client)=>void;
}){
  const [q,setQ]=useState("");
  const [openId,setOpenId]=useState<string|null>(null);
  const [draft,setDraft]=useState<Client|null>(null);
  const [surveyId,setSurveyId]=useState<string|null>(null);
  const [bundleMsg,setBundleMsg]=useState("");
  const [bundleBusy,setBundleBusy]=useState(false);
  const missing=useMemo(()=>missingClientNames(clients,calcs,statements),[clients,calcs,statements]);
  const rows=useMemo(()=>clients.map(c=>({c,h:clientHistory(c,calcs,statements)})).sort((a,b)=>{
    const mx=(...xs:string[])=>xs.reduce((m,x)=>x>m?x:m,"");const la=mx(a.h.sts[0]?.updatedAt||"",a.h.ests[0]?.updatedAt||"",a.c.updatedAt),lb=mx(b.h.sts[0]?.updatedAt||"",b.h.ests[0]?.updatedAt||"",b.c.updatedAt);return lb.localeCompare(la)}),[clients,calcs,statements]);
  const shown=rows.filter(r=>!q.trim()||[r.c.name,r.c.phone,r.c.address].join(" ").toLowerCase().includes(q.trim().toLowerCase()));
  const cur=clients.find(c=>c.id===openId)||null;

  if(cur&&surveyId){
    const sv=(cur.surveys||[]).find(s=>s.id===surveyId);
    if(sv)return <SurveyEditor survey={sv} user={user} clientId={cur.id} tasks={tasks} onBack={()=>setSurveyId(null)}
      onChange={s=>onSave({...cur,surveys:(cur.surveys||[]).map(x=>x.id===s.id?s:x),updatedAt:new Date().toISOString()})}
      onToEstimate={s=>onSurveyToEstimate(cur,s)}/>;
  }
  if(cur){
    const h=clientHistory(cur,calcs,statements);
    const e=draft&&draft.id===cur.id?draft:cur;
    const dirty=draft&&draft.id===cur.id&&JSON.stringify(draft)!==JSON.stringify(cur);
    const set=(p:Partial<Client>)=>setDraft({...e,...p});
    return <>
      <div className="screenbar noPrint"><button onClick={()=>{setOpenId(null);setDraft(null)}}>← Клієнти</button><b>{cur.name}</b><button onClick={()=>{if(confirm(`Видалити клієнта «${cur.name}» зі списку? Естімейти й Оплати залишаться.`)){onDelete(cur.id);setOpenId(null)}}} style={{color:"#b42318"}}>Видалити</button></div>
      <section className="panel grid">
        <label>Ім'я<input value={e.name} onChange={x=>set({name:x.target.value})}/></label>
        <label>Телефон<input type="tel" value={e.phone||""} onChange={x=>set({phone:x.target.value})}/></label>
        <label className="wide">Адреса<input value={e.address||""} onChange={x=>set({address:x.target.value})}/></label>
        <label>Email<input type="email" value={e.email||""} onChange={x=>set({email:x.target.value})}/></label>
        <label className="wide">Примітки<textarea rows={2} value={e.notes||""} onChange={x=>set({notes:x.target.value})}/></label>
        {dirty&&<div className="actions wide"><button className="primary" onClick={()=>{onSave({...e,name:e.name.trim(),updatedAt:new Date().toISOString()});setDraft(null)}}>Зберегти</button><button className="secondary" onClick={()=>setDraft(null)}>Скасувати</button></div>}
      </section>
      <div className="actions noPrint" style={{flexWrap:"wrap"}}>
        {cur.phone&&<a className="secondary" style={{textAlign:"center",textDecoration:"none",padding:12,borderRadius:13,fontWeight:800,flex:1}} href={telHref(cur.phone)}>📞 Подзвонити</a>}
        {cur.phone&&<a className="secondary" style={{textAlign:"center",textDecoration:"none",padding:12,borderRadius:13,fontWeight:800,flex:1}} href={smsHref(cur.phone)}>💬 SMS</a>}
        {cur.address&&<a className="secondary" style={{textAlign:"center",textDecoration:"none",padding:12,borderRadius:13,fontWeight:800,flex:1}} href={mapHref(cur.address)} target="_blank" rel="noreferrer">📍 Карта</a>}
        <button className="primary" style={{flex:1}} onClick={()=>onNewEstimate(cur)}>＋ Новий естімейт</button>
      </div>
      <section className="panel"><div className="head"><h2>📋 Огляди об'єкта</h2><button className="add" onClick={()=>{const s=newSurvey(cur.address);onSave({...cur,surveys:[s,...(cur.surveys||[])],updatedAt:new Date().toISOString()});setSurveyId(s.id)}}>＋ Огляд</button></div>
        {!(cur.surveys||[]).length&&<p className="muted" style={{fontSize:14}}>Приїхав на об'єкт → «＋ Огляд»: кімнати, розміри в дюймах, фото, що треба зробити → AI складе план → одним натиском в естімейт.</p>}
        {(cur.surveys||[]).map(s=><div key={s.id} style={{display:"flex",gap:6,alignItems:"stretch"}}>
          <button className="estimate" style={{flex:1}} onClick={()=>setSurveyId(s.id)}><span><b>{s.title||"Огляд"}</b><small>{s.date} · кімнат {s.rooms.length} · фото {s.rooms.reduce((a,r)=>a+r.photos.length,0)}{s.rooms.some(r=>r.plan)?" · є план":""}</small></span><span style={{alignSelf:"center"}}>›</span></button>
          <button type="button" title="Видалити огляд" onClick={()=>{const photos=s.rooms.reduce((a,r)=>a+r.photos.length,0);if(!confirm(`Видалити «${s.title||"Огляд"}» (${s.date}, кімнат ${s.rooms.length}, фото ${photos})? Це назавжди.`))return;onSave({...cur,surveys:(cur.surveys||[]).filter(x=>x.id!==s.id),updatedAt:new Date().toISOString()})}} style={{marginTop:9,width:44,borderRadius:14,background:"#fff0ee",color:"#b42318",fontSize:18}}>🗑</button>
        </div>)}
      </section>
      <ClientSplats client={cur} user={user} onSave={onSave}/>
      <section className="total">
        <div><span>Оцінено (естімейти)</span><span>{money(h.quoted)}</span></div>
        <div><span>Отримано</span><span>{money(h.paid)}</span></div>
        <div><span>Матеріали за чеками</span><span>{money(h.materials)}</span></div>
        <div><span>Заробіток (отримано − чеки)</span><b>{money(h.earned)}</b></div>
        <div className="grand"><span>{h.balance>=0?"Винен зараз":"Переплата"}</span><b style={{color:h.balance>0.01?"#fda29b":undefined}}>{money(Math.abs(h.balance))}</b></div>
      </section>
      <section className="panel"><div className="head"><h2>Розрахунки (Оплати)</h2></div>
        {!h.sts.length&&<p className="empty">Ще немає.</p>}
        {h.sts.map(s=>{const t=statementTotals(s);return <button key={s.id} className="estimate" onClick={()=>onOpenStatement(s.id)}><span><b>{s.project||"Payment statement"}</b><small>{d(s.updatedAt)} · чеків {s.receipts.length} · оплат {s.payments.length}</small></span><span style={{textAlign:"right"}}><strong style={{color:t.balance>0.01?"#b42318":"#067647"}}>{money(t.balance)}</strong><small className="muted">залишок</small></span></button>})}
      </section>
      <section className="panel"><div className="head"><h2>Естімейти</h2></div>
        {!h.ests.length&&<p className="empty">Ще немає.</p>}
        {h.ests.length>0&&onShareBundle&&<div style={{margin:"6px 0 10px"}}>
          <button className="primary" style={{width:"100%"}} disabled={bundleBusy} onClick={async()=>{setBundleBusy(true);setBundleMsg("");try{setBundleMsg(await onShareBundle(cur,h.ests))}catch(err){setBundleMsg("Не вдалося: "+(err instanceof Error?err.message:String(err)))}finally{setBundleBusy(false)}}}>🔗 {h.ests.length>1?`Одне посилання на всі ${h.ests.length} естімейти`:"Посилання клієнту"}</button>
          {bundleMsg&&<p className="muted" style={{fontSize:13,marginTop:6,wordBreak:"break-all"}}>{bundleMsg}</p>}
          {cur.bundleToken&&!bundleMsg&&<p className="muted" style={{fontSize:13,marginTop:6}}>Посилання вже є — натиск оновить цифри в ньому. <a href={`/q/${cur.bundleToken}`} target="_blank" rel="noreferrer">відкрити</a></p>}
        </div>}
        {h.ests.map(c=><button key={c.id} className="estimate" onClick={()=>onOpenCalc(c)}><span><b>{c.project||"Estimate"}</b><small>{d(c.updatedAt)} · {c.items?.length||0} позицій{c.shareToken?" · 🔗":""}</small></span><strong>{money(c.total)}</strong></button>)}
      </section>
    </>;
  }

  return <>
    <section className="panel">
      <div className="head"><h1>Клієнти</h1><button className="add" onClick={()=>{const c=newClient("Новий клієнт");onSave(c);setOpenId(c.id);setDraft(c)}}>＋ Клієнт</button></div>
      <input type="search" placeholder="Пошук: ім'я, телефон, адреса" value={q} onChange={e=>setQ(e.target.value)} style={{marginTop:10}}/>
      {missing.length>0&&<div style={{marginTop:10,padding:10,background:"#eff6ff",borderRadius:12,fontSize:14}}>
        В естімейтах і Оплатах є імена, яких ще немає в списку: <b>{missing.join(", ")}</b>.
        <div className="actions" style={{marginTop:8}}><button className="primary" onClick={()=>{for(const n of missing)onSave(newClient(n))}}>Додати всіх ({missing.length})</button></div>
      </div>}
      {!clients.length&&!missing.length&&<p className="empty">Ще немає клієнтів. Додай першого або впиши ім'я в естімейті — там буде кнопка «Зберегти як клієнта».</p>}
      {shown.map(({c,h})=><button key={c.id} className="estimate" onClick={()=>setOpenId(c.id)}>
        <span><b>{c.name}</b><small>{[c.phone,c.address].filter(Boolean).join(" · ")||"без контактів"}{h.ests.length||h.sts.length?` · естімейтів ${h.ests.length}, розрахунків ${h.sts.length}`:""}</small></span>
        <span style={{textAlign:"right"}}>{h.balance>0.01?<><strong style={{color:"#b42318"}}>{money(h.balance)}</strong><small className="muted">винен</small></>:h.paid>0?<><strong>{money(h.paid)}</strong><small className="muted">отримано</small></>:<small className="muted">—</small>}</span>
      </button>)}
    </section>
  </>;
}
