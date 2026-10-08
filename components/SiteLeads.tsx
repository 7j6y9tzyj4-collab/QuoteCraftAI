"use client";
import {useCallback,useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";

// Заявки на безкоштовний огляд з сайту kvhouserenovation.com (таблиця site_leads).
type Lead={id:string;created_at:string;name:string;phone:string;address:string;description:string;
  calc_type:string;calc_range:string;calc_summary:string;photos:string[];status:string};
const STATUSES:[string,string][]=[["new","Нова"],["contacted","Зв'язався"],["scheduled","Огляд призначено"],["closed","Закрита"]];
const BUCKET="receipts";
const label=(s:string)=>STATUSES.find(x=>x[0]===s)?.[1]||s;

function LeadPhotos({paths}:{paths:string[]}){
  const [urls,setUrls]=useState<string[]>([]);
  useEffect(()=>{
    if(!paths?.length)return;
    let on=true;
    supabase.storage.from(BUCKET).createSignedUrls(paths,3600).then(({data}:{data:any})=>{
      if(on&&Array.isArray(data))setUrls(data.map((d:any)=>d?.signedUrl).filter(Boolean));
    });
    return()=>{on=false};
  },[paths]);
  if(!urls.length)return null;
  return <div className="leadPhotos">{urls.map(u=><a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="photo"/></a>)}</div>;
}

export default function SiteLeads({user}:{user:User|null}){
  const [leads,setLeads]=useState<Lead[]>([]);
  const [openId,setOpenId]=useState<string|null>(null);
  const [showClosed,setShowClosed]=useState(false);
  const [msg,setMsg]=useState("");
  const load=useCallback(()=>{
    if(!user)return;
    supabase.from("site_leads").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100)
      .then(({data,error}:{data:any[]|null;error:any})=>{
        if(error){setMsg(/site_leads/.test(error.message)?"Таблиці site_leads ще нема — запусти SQL з Supabase/site-leads.sql.":"Заявки: "+error.message);return}
        setMsg("");setLeads((data||[]) as Lead[]);
      });
  },[user]);
  useEffect(()=>{load()},[load]);
  if(!user)return null;

  async function setStatus(l:Lead,status:string){
    setLeads(x=>x.map(y=>y.id===l.id?{...y,status}:y));
    const {error}=await supabase.from("site_leads").update({status}).eq("id",l.id);
    if(error){setMsg("Не вдалося змінити статус: "+error.message);load()}
  }
  async function remove(l:Lead){
    if(!confirm(`Видалити заявку «${l.name}» разом з фото?`))return;
    if(l.photos?.length)await supabase.storage.from(BUCKET).remove(l.photos);
    const {error}=await supabase.from("site_leads").delete().eq("id",l.id);
    if(error){setMsg("Не вдалося видалити: "+error.message);return}
    setLeads(x=>x.filter(y=>y.id!==l.id));
  }

  const fresh=leads.filter(l=>l.status==="new").length;
  const shown=leads.filter(l=>showClosed||l.status!=="closed");
  return <section className="panel siteLeads">
    <div className="head"><h2>Заявки з сайту{fresh>0&&<span className="badge badge-sent">{fresh} нов.</span>}</h2><button onClick={load}>Оновити</button></div>
    {msg&&<p className="statusMessage">{msg}</p>}
    {shown.length===0?<p className="empty">Поки немає заявок.</p>:shown.map(l=>{
      const open=openId===l.id;
      return <article className={`lead lead-${l.status}`} key={l.id}>
        <button className="leadTop" onClick={()=>setOpenId(open?null:l.id)}>
          <span><b>{l.name}</b><small>{l.calc_type||"Без калькулятора"}{l.calc_range?` · ${l.calc_range}`:""}</small></span>
          <span className="leadMeta"><span className={`badge badge-lead-${l.status}`}>{label(l.status)}</span><small>{new Date(l.created_at).toLocaleDateString("uk-UA")}</small></span>
        </button>
        {open&&<div className="leadBody">
          <div className="leadLinks">
            <a className="secondary" href={`tel:${l.phone.replace(/[^\d+]/g,"")}`}>📞 {l.phone}</a>
            <a className="secondary" href={`sms:${l.phone.replace(/[^\d+]/g,"")}`}>💬 SMS</a>
            {l.address&&<a className="secondary" href={`https://maps.google.com/?q=${encodeURIComponent(l.address)}`} target="_blank" rel="noreferrer">📍 {l.address}</a>}
          </div>
          {l.description&&<p className="leadText">{l.description}</p>}
          {l.calc_summary&&<p className="muted leadSummary">{l.calc_summary}</p>}
          <LeadPhotos paths={l.photos||[]}/>
          <div className="leadStatus">{STATUSES.map(([k,v])=><button key={k} className={l.status===k?"primary":"secondary"} onClick={()=>setStatus(l,k)}>{v}</button>)}
            <button className="delete" onClick={()=>remove(l)}>Delete</button></div>
        </div>}
      </article>})}
    {leads.some(l=>l.status==="closed")&&<button className="secondary full" onClick={()=>setShowClosed(!showClosed)}>{showClosed?"Сховати закриті":"Показати закриті"}</button>}
  </section>;
}
