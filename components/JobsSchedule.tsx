"use client";
import {useEffect,useMemo,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import type {Statement} from "@/lib/statement";
import {normDate} from "@/lib/receiptBatch";

// 📅 Графік робіт: заплановані роботи (клієнт, з якого дня, скільки робочих днів) + де вже працював (години) + вільні дні.
export type Job={id:string;client:string;title:string;start:string;days:number;sat:boolean;sid?:string;
  /** хто робить: «Я» (за замовчуванням) або помічник — роботи помічника не займають мої дні */ worker?:string};
const isMe=(w?:string)=>!w||/^\s*(я|me)\s*$/i.test(w);
const pad=(n:number)=>String(n).padStart(2,"0");
const iso=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=(s:string)=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const COLORS=["#2563eb","#d92d20","#079455","#b54708","#7a5af8","#0e9384","#c11574","#475467"];
/** робочі дні роботи: без неділь (і без субот, якщо sat=false) */
export function jobDays(j:Job):string[]{
  const out:string[]=[];const d=parse(j.start);let guard=0;
  while(out.length<Math.max(1,j.days)&&guard++<200){const w=d.getDay();if(w!==0&&(j.sat||w!==6))out.push(iso(d));d.setDate(d.getDate()+1)}
  return out;
}

export default function JobsSchedule({user,list,onClose}:{user:User|null;list:Statement[];onClose:()=>void}){
  const [jobs,setJobs]=useState<Job[]>([]);
  const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)});
  const [edit,setEdit]=useState<Job|null>(null);
  const [msg,setMsg]=useState("");
  useEffect(()=>{
    if(!user)return;
    supabase.from("user_settings").select("schedule").eq("user_id",user.id).maybeSingle().then(({data}:{data:any})=>setJobs(Array.isArray(data?.schedule)?data.schedule:[]));
  },[user]);
  async function save(next:Job[]){
    setJobs(next);
    if(!user)return;
    const {error}=await supabase.from("user_settings").upsert({user_id:user.id,schedule:next,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    if(!error)window.dispatchEvent(new Event("qc-schedule-changed"));
    setMsg(error?"Не вдалося зберегти: "+error.message:"");
  }
  const colorOf=(c:string)=>{let h=0;for(const ch of c)h=(h*31+ch.charCodeAt(0))>>>0;return COLORS[h%COLORS.length]};
  // заплановано по днях
  const planned=useMemo(()=>{const m=new Map<string,Job[]>();for(const j of jobs)for(const d of jobDays(j))(m.get(d)||m.set(d,[]).get(d)!).push(j);return m},[jobs]);
  const mine=useMemo(()=>{const m=new Set<string>();for(const j of jobs)if(isMe(j.worker))for(const d of jobDays(j))m.add(d);return m},[jobs]);
  // де вже працював (облік годин в Оплатах)
  const worked=useMemo(()=>{const m=new Map<string,{client:string;hours:number}[]>();
    for(const s of list){if(s.own)continue;for(const w of s.workLog||[]){const d=normDate(w.date);if(!d)continue;const a=m.get(d)||[];const x=a.find(y=>y.client===s.client);if(x)x.hours+=Number(w.hours)||0;else a.push({client:s.client,hours:Number(w.hours)||0});m.set(d,a)}}
    return m},[list]);
  const todayIso=iso(new Date());
  const nextFree=useMemo(()=>{const d=new Date();for(let i=0;i<120;i++){const k=iso(d);if(d.getDay()!==0&&d.getDay()!==6&&!mine.has(k)&&k>=todayIso)return d;d.setDate(d.getDate()+1)}return null},[mine,todayIso]);
  const upcoming=jobs.filter(j=>{const ds=jobDays(j);return ds[ds.length-1]>=todayIso}).sort((a,b)=>a.start.localeCompare(b.start));
  // сітка місяця
  const first=new Date(month);const lead=(first.getDay()+6)%7;const dim=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const cells:(string|null)[]=[...Array(lead).fill(null),...Array.from({length:dim},(_,i)=>iso(new Date(month.getFullYear(),month.getMonth(),i+1)))];
  const clients=Array.from(new Set(list.filter(s=>!s.own).map(s=>s.client).filter(Boolean)));
  const workers=Array.from(new Set(["Я","Андрій",...list.flatMap(s=>(s.crew||[]).filter(c=>!c.self).map(c=>c.name.trim())).filter(Boolean),...jobs.map(j=>j.worker||"").filter(Boolean)]));
  const fmt=(s:string)=>parse(s).toLocaleDateString("uk-UA",{weekday:"short",day:"numeric",month:"short"});
  return <section className="panel">
    <div className="screenbar noPrint" style={{margin:"-4px 0 8px"}}><button onClick={onClose}>← Список</button><b>📅 Графік робіт</b><button onClick={()=>setEdit({id:crypto.randomUUID(),client:"",title:"",start:nextFree?iso(nextFree):todayIso,days:3,sat:false})}>＋ Робота</button></div>
    {nextFree&&<div style={{padding:10,borderRadius:12,background:"#ecfdf3",color:"#067647",fontWeight:700}}>Я найближче вільний: {fmt(iso(nextFree))}</div>}
    {edit&&<div style={{marginTop:10,padding:12,borderRadius:12,border:"2px solid #2563eb",display:"grid",gap:8}}>
      <label>Клієнт<input list="qc-sched-clients" value={edit.client} onChange={e=>setEdit({...edit,client:e.target.value})} placeholder="Ім'я клієнта"/></label>
      <datalist id="qc-sched-clients">{clients.map(c=><option key={c} value={c}/>)}</datalist>
      <label>Хто робить<input list="qc-sched-workers" value={edit.worker||"Я"} onChange={e=>setEdit({...edit,worker:e.target.value})} placeholder="Я"/></label>
      <datalist id="qc-sched-workers">{workers.map(w=><option key={w} value={w}/>)}</datalist>
      <label>Що робимо<input value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})} placeholder="Ванна, плитка на кухні…"/></label>
      <div style={{display:"grid",gridTemplateColumns:"1fr 110px",gap:8}}>
        <label>З якого дня<input type="date" value={edit.start} onChange={e=>setEdit({...edit,start:e.target.value})}/></label>
        <label>Робочих днів<input type="number" min={1} max={60} value={edit.days} onChange={e=>setEdit({...edit,days:Math.max(1,Number(e.target.value)||1)})}/></label>
      </div>
      <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" style={{width:"auto"}} checked={edit.sat} onChange={e=>setEdit({...edit,sat:e.target.checked})}/>працюю і в суботу</label>
      {edit.start&&<small className="muted">До {fmt(jobDays(edit)[jobDays(edit).length-1])} включно (неділі не рахуються)</small>}
      <div className="actions">
        <button className="primary" disabled={!edit.client.trim()||!edit.start} onClick={()=>{const j={...edit,client:edit.client.trim(),worker:isMe(edit.worker)?undefined:edit.worker!.trim(),sid:list.find(s=>s.client.trim().toLowerCase()===edit.client.trim().toLowerCase())?.id};void save(jobs.some(x=>x.id===j.id)?jobs.map(x=>x.id===j.id?j:x):[...jobs,j]);setEdit(null)}}>Зберегти</button>
        {jobs.some(x=>x.id===edit.id)&&<button className="secondary" style={{color:"#b42318"}} onClick={()=>{if(confirm("Видалити цю роботу з графіка?")){void save(jobs.filter(x=>x.id!==edit.id));setEdit(null)}}}>Видалити</button>}
        <button className="secondary" onClick={()=>setEdit(null)}>Скасувати</button>
      </div>
    </div>}
    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:12}}>
      <button className="secondary" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button>
      <b style={{flex:1,textAlign:"center"}}>{month.toLocaleDateString("uk-UA",{month:"long",year:"numeric"})}</b>
      <button className="secondary" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginTop:8,fontSize:11}}>
      {["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].map(d=><div key={d} style={{textAlign:"center",color:"#667085"}}>{d}</div>)}
      {cells.map((d,i)=>{if(!d)return <div key={i}/>;
        const p=planned.get(d)||[];const w=worked.get(d)||[];const wd=parse(d).getDay();const free=!mine.has(d)&&wd!==0&&wd!==6&&d>=todayIso;
        return <div key={d} style={{minHeight:58,padding:3,borderRadius:8,border:d===todayIso?"2px solid #2563eb":"1px solid #e4e7ec",background:free?"#f6fef9":wd===0?"#f9fafb":"#fff",overflow:"hidden"}}>
          <div style={{fontWeight:700}}>{Number(d.slice(8))}</div>
          {p.map(j=>{const me=isMe(j.worker);return <button key={j.id} onClick={()=>setEdit(j)} title={me?"":`робить ${j.worker}`} style={{all:"unset",display:"block",cursor:"pointer",background:me?colorOf(j.client):"#fff",color:me?"#fff":colorOf(j.client),border:me?undefined:`1px dashed ${colorOf(j.client)}`,borderRadius:4,padding:"0 3px",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{me?"":"👷"}{j.client}</button>})}
          {!p.length&&w.map(x=><div key={x.client} style={{color:"#475467",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{x.client} {x.hours}г</div>)}
          {free&&<div style={{color:"#079455"}}>я вільний</div>}
        </div>})}
    </div>
    <h3 style={{marginTop:16}}>Попереду</h3>
    {!upcoming.length&&<p className="muted">Ще нічого не заплановано. «＋ Робота» — клієнт, з якого дня, скільки днів.</p>}
    {upcoming.map(j=>{const ds=jobDays(j);return <button key={j.id} className="estimate" onClick={()=>setEdit(j)} style={{borderLeft:`6px solid ${colorOf(j.client)}`}}>
      <span><b>{j.client}</b><small>{isMe(j.worker)?"":`👷 ${j.worker} · `}{j.title||"Робота"} · {ds.length} дн.</small></span>
      <span style={{textAlign:"right"}}><small>{fmt(ds[0])}</small><small className="muted">до {fmt(ds[ds.length-1])}</small></span>
    </button>})}
    {msg&&<p className="muted">{msg}</p>}
  </section>;
}
