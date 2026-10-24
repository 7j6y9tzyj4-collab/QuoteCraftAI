"use client";
import type {Statement} from "@/lib/statement";
import {baseName} from "@/lib/receiptBatch";
import DateInput from "@/components/DateInput";

// Один чек з пакета до збереження (можна виправити суму/дату/магазин).
export type Draft={
  key:string;source:string;page:number;pages:number;fromPdf:boolean;file:File;
  /** картинка для AI і перегляду */ dataUrl:string;
  /** що збережемо як фото чека (обрізане/кольорове) */ scan?:string;
  status:"wait"|"reading"|"ok"|"error";error?:string;
  date:string;store:string;items:string;amount:number;receiptNo:string;confidence:number;hash:string;
  include:boolean;
  /** «вже є: …» — дублікат */ dupOf?:string;
  /** куди додати: id розрахунку, "new" — новий проєкт з назви файлу, "" — ще не вибрано */ targetId:string;
  /** AI вибрав проєкт: впевненість і чому */ aiConf?:number;aiReason?:string;
};

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);

export default function ReceiptBatch({drafts,list,askTarget,saving,onPatch,onTarget,onJoin,onCancel,onSave,projectsFor}:{
  drafts:Draft[];list:Statement[];askTarget:boolean;saving:boolean;projectsFor?:(targetId:string)=>Statement[];
  onPatch:(key:string,patch:Partial<Draft>)=>void;
  onTarget:(source:string,targetId:string)=>void;
  onJoin:(key:string)=>void;
  onCancel:()=>void;onSave:()=>void;
}){
  const done=drafts.filter(d=>d.status==="ok"||d.status==="error").length;
  const reading=done<drafts.length;
  const dups=drafts.filter(d=>d.dupOf);
  const chosen=drafts.filter(d=>d.include&&d.status==="ok");
  const sum=chosen.reduce((a,d)=>a+(Number(d.amount)||0),0);
  const noTarget=chosen.some(d=>!d.targetId);
  return <section className="panel" style={{border:"2px solid #2563eb"}}>
    <div className="head"><h2>📦 Пакет чеків — {drafts.length}</h2><button className="secondary" disabled={saving} onClick={onCancel}>Скасувати</button></div>
    {reading&&<div style={{marginTop:8}}>
      <progress value={done} max={drafts.length} style={{width:"100%",height:12}}/>
      <small className="muted">Читаю чеки… {done} / {drafts.length}. Можна вже виправляти прочитані.</small>
    </div>}
    {!reading&&dups.length>0&&<p style={{marginTop:8,padding:"8px 10px",background:"#fffaeb",borderRadius:10,color:"#93370d",fontSize:14}}>
      {dups.length} пропущено — ці чеки вже є в програмі (або двічі в цьому пакеті). Щоб усе одно додати, постав галочку біля чека.</p>}
    {drafts.map((d,i)=>{
      const firstOfSource=i===0||drafts[i-1].source!==d.source;
      const canJoin=i>0&&drafts[i-1].source===d.source&&d.fromPdf&&!reading&&!saving;
      return <div key={d.key}>
        {askTarget&&firstOfSource&&<label style={{marginTop:12,display:"block"}}>
          <small className="muted">Проєкт для «{d.source}»</small>
          <select value={d.targetId} onChange={e=>onTarget(d.source,e.target.value)} style={{borderColor:d.targetId?undefined:"#f04438"}}>
            <option value="">— вибери проєкт —</option>
            {list.map(s=><option key={s.id} value={s.id}>{s.client||"Без імені"}{s.project?` — ${s.project}`:""}</option>)}
            <option value="new">＋ Новий проєкт «{baseName(d.source)||"Без імені"}»</option>
          </select>
        </label>}
        <div style={{display:"grid",gridTemplateColumns:"28px 64px 1fr",gap:8,marginTop:10,padding:8,borderRadius:12,alignItems:"start",
          background:d.dupOf?"#fffaeb":d.status==="error"?"#fef3f2":"#f8fafc",opacity:d.include||d.status!=="ok"?1:.6}}>
          <input type="checkbox" style={{width:"auto",marginTop:6}} checked={d.include} disabled={d.status!=="ok"} onChange={e=>onPatch(d.key,{include:e.target.checked})} aria-label="Додати цей чек"/>
          <a href={d.scan||d.dataUrl} target="_blank" rel="noreferrer"><img src={d.scan||d.dataUrl} alt="receipt" style={{width:64,height:82,objectFit:"cover",borderRadius:8,border:"1px solid #d0d5dd"}}/></a>
          <div style={{display:"grid",gap:6,minWidth:0}}>
            <small className="muted">{d.source}{d.pages>1?` · стор. ${d.page}/${d.pages}`:""}
              {d.status==="reading"&&" · читаю…"}{d.status==="wait"&&" · у черзі"}
              {d.status==="ok"&&d.confidence<0.7&&<b style={{color:"#b54708"}}> · перевір суму</b>}
              {d.dupOf&&<b style={{color:"#93370d"}}> · вже є: {d.dupOf}</b>}</small>
            {d.status==="error"?<small style={{color:"#b42318"}}>Не прочитав: {d.error}</small>:<>
              <div style={{display:"grid",gridTemplateColumns:"minmax(0,130px) minmax(0,1fr) minmax(0,110px)",gap:6}}>
                <DateInput value={d.date} onChange={v=>onPatch(d.key,{date:v})}/>
                <input placeholder="Магазин" value={d.store} onChange={e=>onPatch(d.key,{store:e.target.value})}/>
                <input type="number" step="0.01" value={d.amount} onChange={e=>onPatch(d.key,{amount:Number(e.target.value)||0})}/>
              </div>
              <input placeholder="Що купив" value={d.items} onChange={e=>onPatch(d.key,{items:e.target.value})}/>
              {(()=>{const projs=d.targetId&&d.targetId!=="new"&&projectsFor?projectsFor(d.targetId):[];if(projs.length<2||d.dupOf)return null;
                const unsure=typeof d.aiConf==="number"&&d.aiConf<0.6;
                return <label style={{display:"grid",gap:2}}><small className="muted">Проєкт{typeof d.aiConf==="number"?(unsure?" · ⚠️ AI не впевнений — перевір":" · вибрав AI"):""}{d.aiReason?` — ${d.aiReason}`:""}</small>
                  <select value={d.targetId} onChange={e=>onPatch(d.key,{targetId:e.target.value,aiConf:undefined,aiReason:undefined})} style={{borderColor:unsure?"#f79009":undefined}}>
                    {projs.map(s=><option key={s.id} value={s.id}>{s.project||"Без назви"}</option>)}
                  </select></label>})()}
            </>}
            {canJoin&&<button className="secondary" style={{justifySelf:"start",padding:"5px 10px",fontSize:13}} onClick={()=>onJoin(d.key)}>⤒ З'єднати з попереднім (довгий чек)</button>}
          </div>
        </div>
      </div>;
    })}
    <div className="actions" style={{marginTop:12}}>
      <button className="primary" disabled={reading||saving||!chosen.length||noTarget} onClick={onSave}>
        {saving?"Зберігаю…":`Додати всі (${chosen.length}) · ${money(sum)}`}</button>
    </div>
    {noTarget&&!reading&&<small style={{color:"#b42318"}}>Вибери проєкт для кожного файлу.</small>}
  </section>;
}
