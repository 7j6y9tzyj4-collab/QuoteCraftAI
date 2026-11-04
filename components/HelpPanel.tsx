"use client";
import {useMemo,useState} from "react";
import {HELP,type HelpTopic} from "@/lib/helpDocs";

// ❓ Довідка: кнопка в шапці → теми для поточного екрана, пошук, «Запитати» (AI відповідає з довідки).
export default function HelpPanel({screen}:{screen:string}){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const [openId,setOpenId]=useState<string|null>(null);
  const [ans,setAns]=useState("");const [busy,setBusy]=useState(false);
  const list=useMemo(()=>{
    const n=q.trim().toLowerCase();
    const words=n.split(/\s+/).filter(w=>w.length>2);
    const score=(h:HelpTopic)=>words.reduce((a,w)=>a+((h.title+" "+h.keys+" "+h.steps.join(" ")).toLowerCase().includes(w.slice(0,5))?1:0),0);
    if(words.length)return HELP.map(h=>({h,s:score(h)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).map(x=>x.h);
    return [...HELP.filter(h=>h.screen===screen),...HELP.filter(h=>h.screen!==screen)];
  },[q,screen]);
  async function ask(){
    if(!q.trim())return;setBusy(true);setAns("");
    try{const r=await fetch("/api/help-ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({q,screen})});const j=await r.json();setAns(j.answer||j.error||"")}
    catch(e){setAns(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  return <>
    <button onClick={()=>setOpen(true)} aria-label="Довідка" style={{width:40,height:40,borderRadius:20,background:"rgba(255,255,255,.14)",color:"#fff",fontSize:20,fontWeight:900,flex:"none"}}>?</button>
    {open&&<div className="noPrint" style={{position:"fixed",inset:0,zIndex:100,background:"rgba(16,24,40,.45)",display:"flex",alignItems:"flex-end"}} onClick={()=>setOpen(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",width:"100%",maxWidth:720,margin:"0 auto",maxHeight:"88dvh",overflowY:"auto",borderRadius:"20px 20px 0 0",padding:"16px 16px max(20px,env(safe-area-inset-bottom))",color:"#101828"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><b style={{fontSize:20}}>❓ Довідка</b><button onClick={()=>setOpen(false)} style={{background:"#f2f4f7",borderRadius:10,padding:"6px 12px",fontWeight:800}}>✕</button></div>
        <div style={{display:"flex",gap:6,marginTop:10}}>
          <input value={q} onChange={e=>{setQ(e.target.value);setAns("")}} onKeyDown={e=>{if(e.key==="Enter")ask()}} placeholder="Як… (напр. «як додати чек»)" style={{flex:1}}/>
          <button className="primary" onClick={ask} disabled={busy||!q.trim()} style={{whiteSpace:"nowrap"}}>{busy?"…":"Запитати"}</button>
        </div>
        {ans&&<div style={{marginTop:10,padding:12,borderRadius:12,background:"#eef4ff",whiteSpace:"pre-line",fontSize:15,lineHeight:1.45}}>{ans}</div>}
        <div style={{marginTop:12,display:"grid",gap:6}}>
          {!q.trim()&&<small className="muted">Спочатку — теми для цього екрана.</small>}
          {list.map(h=><div key={h.id} style={{border:"1px solid #eaecf0",borderRadius:12}}>
            <button onClick={()=>setOpenId(openId===h.id?null:h.id)} style={{width:"100%",textAlign:"left",background:"transparent",padding:"12px",fontWeight:700,display:"flex",justifyContent:"space-between",gap:8,color:"#101828"}}><span>{h.title}</span><span>{openId===h.id?"−":"+"}</span></button>
            {openId===h.id&&<ol style={{margin:0,padding:"0 14px 12px 32px",fontSize:15,lineHeight:1.5}}>{h.steps.map((s,i)=><li key={i}>{s}</li>)}</ol>}
          </div>)}
          {q.trim()&&!list.length&&<small className="muted">Не знайшов у темах — натисніть «Запитати».</small>}
        </div>
      </div>
    </div>}
  </>;
}
