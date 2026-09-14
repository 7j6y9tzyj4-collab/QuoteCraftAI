"use client";
import {useEffect,useRef,useState} from "react";
import {areaFt,type PhotoSurveyResult} from "@/lib/photoMeasurements";
type Props={text:string;photos:string[];disabled:boolean;onApprove:(notes:string)=>void};
export default function PhotoMeasurements({text,photos,disabled,onApprove}:Props){
 const [reference,setReference]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [survey,setSurvey]=useState<PhotoSurveyResult|null>(null);
 const [dimensions,setDimensions]=useState<{length:string;width:string;include:boolean}[]>([]);
 const [accepted,setAccepted]=useState(false);
 const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 async function analyze(){
  setBusy(true);setError("");setSurvey(null);setAccepted(false);
  try{
   const res=await fetch("/api/photo-measurements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,photos,reference}),signal:AbortSignal.timeout(75000)});
   const data=await res.json();if(!res.ok)throw new Error(data.error||"Помилка аналізу");
   if(!active.current)return;
   setSurvey(data);
   setDimensions(data.surfaces.map((s:PhotoSurveyResult["surfaces"][number])=>({include:true,
    length:s.lengthLowFt===null||s.lengthHighFt===null?"":String(Math.round((s.lengthLowFt+s.lengthHighFt)*50)/100),
    width:s.widthLowFt===null||s.widthHighFt===null?"":String(Math.round((s.widthLowFt+s.widthHighFt)*50)/100)
   })));
  }catch(e){if(active.current)setError(e instanceof Error?e.message:"Помилка аналізу")}
  finally{if(active.current)setBusy(false)}
 }
 const selected=dimensions.filter(d=>d.include);
 const valid=selected.length>0&&selected.every(d=>Number.isFinite(Number(d.length))&&Number(d.length)>0&&Number(d.length)<=1000&&Number.isFinite(Number(d.width))&&Number(d.width)>0&&Number(d.width)<=1000);
 return <section className="photoSurvey">
  <h3>Попередні розміри за фото</h3>
  <p>Для першої оцінки бюджету. Додай відомий розмір видимого предмета або фото з рулеткою. Невидимі розміри потрібно заміряти.</p>
  <label>Масштаб або відомий замір<input disabled={busy||disabled} value={reference} placeholder="Плитка на задній стіні — 24 × 48 дюймів" onChange={e=>{setReference(e.target.value);setSurvey(null);setAccepted(false)}}/></label>
  <button className="secondary" disabled={busy||disabled||!photos.length} onClick={analyze}>{busy?"Аналізую розміри…":"Оцінити розміри з фото"}</button>
  {error&&<p role="alert">{error}</p>}
  {survey&&<>
   <p><b>Це припущення для бюджету, а не точні заміри.</b> Початкові значення полів — середини запропонованих інтервалів. Перевір або виправ їх.</p>
   {survey.observations.map((v,i)=><p key={i}>{v}</p>)}
   {survey.questions.length>0&&<div className="statusMessage"><b>Що потрібно уточнити</b><ul>{survey.questions.map((v,i)=><li key={i}>{v}</li>)}</ul><p>Відповіді про обсяг робіт додай до основного опису; відсутні заміри можна вписати нижче.</p></div>}
   {survey.surfaces.map((s,i)=>{
    const d=dimensions[i];if(!d)return null;
    const change=(field:"length"|"width",value:string)=>{setDimensions(v=>v.map((x,j)=>i===j?{...x,[field]:value}:x));setAccepted(false)};
    const area=Number(d.length)>0&&Number(d.length)<=1000&&Number(d.width)>0&&Number(d.width)<=1000?areaFt(Number(d.length),Number(d.width)):null;
    return <article className="panel" key={i}>
     <label><input style={{width:"auto"}} type="checkbox" disabled={disabled} checked={d.include} onChange={e=>{setDimensions(v=>v.map((x,j)=>j===i?{...x,include:e.target.checked}:x));setAccepted(false)}}/> {s.name}</label>
     <p>{s.evidence}</p>
     <small>Оцінка AI: {s.lengthLowFt??"?"}–{s.lengthHighFt??"?"} ft × {s.widthLowFt??"?"}–{s.widthHighFt??"?"} ft</small>
     <div className="grid"><label>Довжина, ft<input type="number" min="0.01" max="1000" step="0.01" disabled={disabled||!d.include} value={d.length} onChange={e=>change("length",e.target.value)}/></label><label>Ширина / висота, ft<input type="number" min="0.01" max="1000" step="0.01" disabled={disabled||!d.include} value={d.width} onChange={e=>change("width",e.target.value)}/></label></div>
     {area!==null&&<p>Прямокутна площа: {d.length} × {d.width} = <b>{area} sq ft</b>. Отвори не відняті.</p>}
    </article>;
   })}
   <label><input style={{width:"auto"}} type="checkbox" checked={accepted} disabled={!valid||disabled} onChange={e=>setAccepted(e.target.checked)}/> Перевірив розміри й опис. Використати лише для попереднього кошторису.</label>
   <button className="primary" disabled={!accepted||!valid||disabled} onClick={()=>{
    const notes=survey.surfaces.flatMap((s,i)=>{const d=dimensions[i];return d.include?[`${s.name}: length ${d.length} ft; width/height ${d.width} ft; gross rectangular area ${areaFt(Number(d.length),Number(d.width))} sq ft. Approximate, contractor-reviewed.`]:[]}).join("\n");
    onApprove(notes);
   }}>Підтвердити та прорахувати</button>
  </>}
 </section>;
}
