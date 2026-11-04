"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";

// ⚙ Налаштування → 🤖 Використання AI: мій місяць; для адміна — усі користувачі, ліміт і перекладач.
const usd=(n:number)=>"$"+(Number(n)||0).toFixed(2);
const NAMES:Record<string,string>={"parse-calculator-estimate":"естімейти","calc-edit":"✏️ зміни","calc-review":"🔍 перевірки","client-message":"💬 повідомлення","help-ask":"❓ довідка","transcribe":"🎙 голос","parse-receipt":"чеки (фото)","receipts-mail":"чеки з пошти","worker-receipt":"чеки помічника","photo-measurements":"розміри з фото","receipt-assign":"розклад чеків","voice-log":"голосові записи","translate":"переклад","translator":"🎧 перекладач","render":"візуалізація","room-plan":"план кімнати","parse-estimate":"старі AI-естімейти"};
export default function AiUsage({user}:{user:User|null}){
  const [d,setD]=useState<any>(null);const [msg,setMsg]=useState("");
  async function load(){const r=await fetch("/api/ai-usage");if(r.ok)setD(await r.json())}
  useEffect(()=>{if(user)void load()},[user]);
  async function setUser(id:string,patch:any){setMsg("");const r=await fetch("/api/ai-usage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:id,...patch})});setMsg(r.ok?"Збережено ✓":"Не вдалося");void load()}
  if(!user||!d)return null;
  const feats=Object.entries(d.me.by_feature||{}).sort((a:any,b:any)=>b[1]-a[1]);
  return <div style={{marginTop:20}}>
    <h2>🤖 Використання AI · {d.month}</h2>
    <p style={{fontSize:15,margin:"4px 0"}}>Цього місяця: <b>{d.me.calls}</b> запитів ≈ <b>{usd(d.me.cost)}</b>{d.limit!=null?` з ліміту ${usd(d.limit)}`:""}</p>
    {feats.length>0&&<p className="muted" style={{fontSize:13,margin:0}}>{feats.map(([k,v])=>`${NAMES[k]||k}: ${v}`).join(" · ")}</p>}
    <p className="muted" style={{fontSize:12}}>Сума приблизна (оцінка за кожен запит), точний рахунок — у кабінеті OpenAI.</p>
    {d.admin&&d.users&&<div style={{marginTop:10}}>
      <h3 style={{margin:"8px 0"}}>Користувачі (адмін)</h3>
      {d.users.map((u:any)=><div key={u.id} style={{padding:10,borderRadius:12,border:"1px solid #eaecf0",marginBottom:6}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8}}><b style={{fontSize:14,wordBreak:"break-all"}}>{u.company||u.email}{u.admin?" (ви)":""}</b><span style={{whiteSpace:"nowrap"}}>{u.calls} · <b>{usd(u.cost)}</b></span></div>
        {u.company&&<small className="muted">{u.email}</small>}
        {!u.admin&&<div style={{display:"flex",gap:8,alignItems:"center",marginTop:6,flexWrap:"wrap"}}>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:13}}>Ліміт $/міс<input type="number" min={0} step={1} defaultValue={u.limit??""} placeholder="без ліміту" style={{width:110,padding:8}} onBlur={e=>{const v=e.target.value;if(String(u.limit??"")!==v)void setUser(u.id,{limit:v===""?null:Number(v)})}}/></label>
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:13}}><input type="checkbox" checked={u.translator} onChange={e=>void setUser(u.id,{translator:e.target.checked})} style={{width:20,height:20}}/>🎧 перекладач</label>
        </div>}
      </div>)}
      {d.anon&&<small className="muted">Без входу (сторінки помічника тощо): {d.anon.calls} · {usd(d.anon.cost)}</small>}
      {msg&&<p className="muted" style={{fontSize:13}}>{msg}</p>}
    </div>}
  </div>;
}
