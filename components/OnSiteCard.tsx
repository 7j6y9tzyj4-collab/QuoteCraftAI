"use client";
import {useEffect,useState} from "react";

// ⏱ Застосунок на iPhone сам помічає приїзд/від'їзд з об'єкта (геозони). Тут — видимий відлік і запис годин в один дотик.
// У браузері (без застосунку) картка не показується.
type Site={id:string;title:string;first:number;in:number;out:number};
type NativeWin={ReactNativeWebView?:{postMessage(m:string):void};__QC_NATIVE_ONSITE?:boolean};
const rn=()=>{if(typeof window==="undefined")return null;const w=window as unknown as NativeWin;return w.ReactNativeWebView&&w.__QC_NATIVE_ONSITE?w.ReactNativeWebView:null};
const hm=(ms:number)=>new Date(ms).toLocaleTimeString("uk-UA",{hour:"2-digit",minute:"2-digit"});
const dur=(ms:number)=>{const m=Math.max(0,Math.round(ms/60000));return m<60?`${m} хв`:`${Math.floor(m/60)} год ${m%60} хв`};
const q=(ms:number)=>Math.max(0.25,Math.round(ms/3600000*4)/4);

export type PendingHours={sid:string;hours:number;date:string;note:string};

export default function OnSiteCard({names,onLog}:{names:(sid:string)=>string;onLog:(p:PendingHours)=>void}){
  const [sites,setSites]=useState<Site[]>([]);
  const [now,setNow]=useState(()=>Date.now());
  const [edit,setEdit]=useState<Record<string,string>>({});
  useEffect(()=>{
    const bridge=rn();if(!bridge)return;
    const on=(e:Event)=>{const d=(e as CustomEvent<{sites:Site[]}>).detail;setSites(Array.isArray(d?.sites)?d.sites:[]);setNow(Date.now())};
    const ask=()=>{if(document.visibilityState==="visible")bridge.postMessage("qc:onsite")};
    window.addEventListener("qc-onsite",on);document.addEventListener("visibilitychange",ask);
    ask();const t=setInterval(ask,60000);
    return()=>{window.removeEventListener("qc-onsite",on);document.removeEventListener("visibilitychange",ask);clearInterval(t)};
  },[]);
  // показуємо: зараз на об'єкті, або поїхав, пробувши щонайменше 20 хв
  const rows=sites.filter(s=>s.in>0||(s.out>0&&s.out-s.first>=20*60000)).sort((a,b)=>Number(b.in>0)-Number(a.in>0)||b.first-a.first);
  if(!rows.length)return null;
  const done=(id:string)=>{rn()?.postMessage("qc:onsite:done:"+id);setSites(x=>x.filter(s=>s.id!==id))};
  return <section className="panel noPrint" style={{border:"2px solid #2e90fa",background:"#f5faff",marginBottom:12}}>
    {rows.map((s,i)=>{
      const here=s.in>0;const end=here?now:s.out;const title=names(s.id)||s.title;
      const hours=edit[s.id]??String(q(end-s.first));
      return <div key={s.id} style={{padding:"4px 0 10px",borderTop:i?"1px solid #b2ddff":"none",marginTop:i?10:0}}>
        <b style={{display:"block",fontSize:17}} data-notr>{here?"⏱":"⏹"} {title}</b>
        <div style={{fontSize:15,margin:"4px 0 8px",color:"#175cd3",fontWeight:600}}>
          {here?<>На об'єкті з {hm(s.first)} · минуло {dur(end-s.first)}</>:<>Були з {hm(s.first)} до {hm(s.out)} · {dur(s.out-s.first)}</>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <input type="number" inputMode="decimal" step="0.25" min="0.25" max="16" value={hours} onChange={e=>setEdit({...edit,[s.id]:e.target.value})} style={{width:84,padding:"10px",borderRadius:10,border:"1px solid #84caff",fontSize:16,fontWeight:700}} aria-label="години"/>
          <span style={{fontSize:15}}>год</span>
          <button className="primary" onClick={()=>{const h=Math.round((Number(hours)||0)*4)/4;if(h<=0)return;onLog({sid:s.id,hours:h,date:new Date(s.first).toLocaleDateString("sv-SE"),note:`📍 ${hm(s.first)}–${hm(end)}`});done(s.id)}} style={{flex:1,minWidth:150}}>✓ Записати мої години</button>
          <button onClick={()=>done(s.id)} style={{background:"transparent",color:"#667085",fontSize:14,padding:"8px 6px"}}>сховати</button>
        </div>
        <small className="muted" style={{display:"block",marginTop:6}}>{here?"Відлік іде сам. Записати можна зараз або коли поїдете — прийде нагадування.":"Час пораховано за приїздом і від'їздом. Відніміть обід, якщо треба."}</small>
      </div>})}
  </section>;
}
