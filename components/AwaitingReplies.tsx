"use client";
import {useEffect,useMemo,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import type {SavedCalc} from "@/lib/calcTypes";
import {findClient,smsHref,type Client} from "@/lib/clients";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
const DAY=86400000;
const HIDE="qc_awaiting_hidden";
type Row={token:string;status:"sent"|"viewed";created_at:string;viewed_at:string|null;updated_at:string|null;data:any};

// Головна → «Чекають відповіді»: надіслані естімейти без «Accept» — хто не відкрив, хто відкрив і мовчить, скільки днів; готове нагадування.
export default function AwaitingReplies({user,clients,calcs,onOpenCalc}:{user:User|null;clients:Client[];calcs:SavedCalc[];onOpenCalc:(c:SavedCalc)=>void}){
  const [rows,setRows]=useState<Row[]>([]);
  const [hidden,setHidden]=useState<string[]>([]);
  const [copied,setCopied]=useState("");
  useEffect(()=>{try{setHidden(JSON.parse(localStorage.getItem(HIDE)||"[]"))}catch{}},[]);
  useEffect(()=>{
    if(!user)return;
    const since=new Date(Date.now()-60*DAY).toISOString();
    supabase.from("shared_quotes").select("token,status,created_at,viewed_at,updated_at,data").eq("user_id",user.id).in("status",["sent","viewed"]).gte("created_at",since).order("created_at",{ascending:false}).limit(100)
      .then(({data}:{data:Row[]|null})=>setRows((data||[]).filter(r=>r.data?.kind!=="bundle"&&r.data?.kind!=="invoice")));
  },[user]);
  const list=useMemo(()=>rows.filter(r=>!hidden.includes(r.token+r.status)),[rows,hidden]);
  if(!user||!list.length)return null;
  const hide=(r:Row)=>{const next=[...hidden,r.token+r.status].slice(-300);setHidden(next);try{localStorage.setItem(HIDE,JSON.stringify(next))}catch{}};
  const days=(iso:string|null)=>iso?Math.floor((Date.now()-new Date(iso).getTime())/DAY):0;
  return <section className="panel">
    <div className="head"><h2>⏳ Чекають відповіді · {list.length}</h2></div>
    <p className="muted" style={{fontSize:13,margin:"0 0 6px"}}>Надіслані естімейти, які клієнт ще не прийняв.</p>
    {list.map(r=>{
      const d=r.data||{};
      const isChange=d.kind==="change";
      const what=isChange?`Change order #${d.no}${d.title?` — ${d.title}`:""}`:(d.project||"Estimate");
      const total=isChange?d.total:(d.tiers?.length?Math.min(...d.tiers.map((t:any)=>t.totals.total)):d.totals?.total);
      const c=findClient(clients,d.client||"");
      const first=String(d.client||"").trim().split(/\s+/)[0]||"there";
      const link=`${typeof window!=="undefined"?window.location.origin:""}/q/${r.token}`;
      const sentDays=days(r.updated_at||r.created_at),viewDays=days(r.viewed_at);
      const viewed=r.status==="viewed";
      const text=viewed
        ?`Hi ${first}, did you have a chance to look over the ${isChange?"change order":"estimate"} for ${what}? I'm happy to answer any questions or adjust anything. ${link}\n— Vasyl, K&V House Renovation`
        :`Hi ${first}, just checking that you received the ${isChange?"change order":"estimate"} for ${what}: ${link}\nLet me know if you have any questions!\n— Vasyl, K&V House Renovation`;
      const late=viewed?viewDays>=3:sentDays>=2;
      const calc=calcs.find(x=>x.shareToken===r.token);
      return <div key={r.token} style={{padding:"10px 0",borderTop:"1px solid #eaecf0"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
          <span><b>{d.client||"Клієнт"}</b><small className="muted" style={{display:"block"}}>{what}</small></span>
          <span style={{textAlign:"right",whiteSpace:"nowrap"}}><b>{d.tiers?.length?"від ":""}{money(Number(total)||0)}</b>
            <small style={{display:"block",color:late?"#b54708":"#667085",fontWeight:late?700:400}}>{viewed?`👁 відкрив ${viewDays?`${viewDays} дн. тому`:"сьогодні"}`:`✉️ не відкривав ${sentDays?`${sentDays} дн.`:"(сьогодні)"}`}</small></span>
        </div>
        <div className="actions" style={{marginTop:6,flexWrap:"wrap"}}>
          {c?.phone?<a className="secondary" style={{textDecoration:"none",padding:"8px 12px",borderRadius:12,fontWeight:700}} href={smsHref(c.phone,text)}>💬 Нагадати</a>
            :<button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(r.token)}catch{}}}>{copied===r.token?"✓ Скопійовано":"📋 Текст нагадування"}</button>}
          {calc&&<button className="secondary" onClick={()=>onOpenCalc(calc)}>Відкрити</button>}
          <button className="secondary" onClick={()=>hide(r)} title="Сховати зі списку">✕</button>
        </div>
      </div>;
    })}
  </section>;
}
