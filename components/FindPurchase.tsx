"use client";
import {useRef,useState} from "react";
import {createPortal} from "react-dom";
import {prepareJobPhoto} from "@/lib/jobPhotos";

// 🔎 «Де я це купив?» — фото залишку матеріалу → у якому чеку (магазин, дата, проєкт) він був. Щоб знати, куди везти на повернення.
type Match={sid:string;receiptId:string;client:string;project:string;date:string;store:string;amount:number;items:string;receiptNo:string;daysAgo:number|null;photoUrl:string;confidence:number;why:string;exact:boolean};
type Found={id:string;thumb:string;status:"busy"|"ok"|"error";error?:string;product?:{name:string;brand:string;details:string;codes:string};matches?:Match[];total?:number};
const money=(n:number)=>"$"+(Number(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function FindPurchase({onOpenProject}:{onOpenProject?:(sid:string)=>void}){
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<Found[]>([]);
  const cam=useRef<HTMLInputElement>(null);
  const lib=useRef<HTMLInputElement>(null);
  const patch=(id:string,p:Partial<Found>)=>setItems(x=>x.map(i=>i.id===id?{...i,...p}:i));

  async function add(files:FileList|null){
    for(const f of Array.from(files||[]).slice(0,6)){
      const id=crypto.randomUUID();
      try{
        const p=await prepareJobPhoto(f);
        setItems(x=>[{id,thumb:p.dataUrl,status:"busy"},...x]);
        const res=await fetch("/api/find-purchase",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({photo:p.dataUrl})});
        const j=await res.json().catch(()=>null);
        if(!res.ok||!j)throw new Error(j?.error||"Не вдалося перевірити. Спробуй ще раз.");
        patch(id,{status:"ok",product:j.product,matches:j.matches||[],total:j.total||0});
      }catch(e){
        setItems(x=>x.some(i=>i.id===id)?x.map(i=>i.id===id?{...i,status:"error",error:e instanceof Error?e.message:"Помилка"}:i):[{id,thumb:"",status:"error",error:e instanceof Error?e.message:"Помилка"},...x]);
      }
    }
  }

  // підсумок «куди їхати»: найкращий збіг кожного товару → по магазинах
  const byStore=new Map<string,string[]>();
  for(const i of items){const m=i.matches?.[0];if(i.status==="ok"&&m&&m.confidence>=0.5){const k=m.store||"магазин не вказаний";byStore.set(k,[...(byStore.get(k)||[]),i.product?.name||"товар"])}}

  return <>
    <button type="button" className="apFindBtn" onClick={()=>setOpen(true)} style={{width:"100%",marginTop:8,padding:"13px 12px",borderRadius:14,border:"none",background:"var(--card,#fff)",color:"var(--blue,#1d4ed8)",fontWeight:600,fontSize:16}}>🔎 Де я це купив?</button>
    {open&&typeof document!=="undefined"&&createPortal(<div className="noPrint" style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(16,24,40,.45)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div style={{background:"#fff",color:"#101828",width:"min(640px,100%)",maxHeight:"92vh",overflow:"auto",borderRadius:"18px 18px 0 0",padding:"16px 16px calc(env(safe-area-inset-bottom) + 20px)",boxShadow:"0 -8px 30px rgba(16,24,40,.25)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <b style={{fontSize:19,flex:1}}>🔎 Де я це купив?</b>
          <button type="button" onClick={()=>setOpen(false)} style={{background:"#f2f4f7",color:"#344054",border:"none",borderRadius:10,padding:"8px 14px",fontSize:15}}>Закрити</button>
        </div>
        <p style={{fontSize:14,color:"#475467",margin:"6px 0 12px"}}>Сфотографуй товар так, щоб було видно назву на упаковці, а ще краще — етикетку зі штрих-кодом. Програма знайде чек, де він був.</p>
        <div style={{display:"flex",gap:8}}>
          <button type="button" className="primary" style={{flex:1,padding:"13px"}} onClick={()=>cam.current?.click()}>📷 Сфотографувати</button>
          <button type="button" style={{padding:"13px 14px",borderRadius:12,border:"1px solid #d0d5dd",background:"#fff",color:"#344054"}} onClick={()=>lib.current?.click()}>🖼 З галереї</button>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void add(e.target.files);e.target.value=""}}/>
        <input ref={lib} type="file" accept="image/*" multiple hidden onChange={e=>{void add(e.target.files);e.target.value=""}}/>

        {byStore.size>0&&items.filter(i=>i.status==="ok").length>1&&<div style={{marginTop:14,padding:"12px 14px",borderRadius:14,background:"#ecfdf3",border:"1px solid #abefc6"}}>
          <b style={{display:"block",marginBottom:4}}>Куди везти</b>
          {[...byStore.entries()].map(([s,n])=><div key={s} style={{fontSize:15,marginTop:2}}><b data-notr>{s}</b>: <span data-notr>{n.join(", ")}</span></div>)}
        </div>}

        {items.map(i=><div key={i.id} style={{marginTop:14,paddingTop:14,borderTop:"1px solid #eaecf0"}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            {i.thumb&&<img src={i.thumb} alt="" style={{width:64,height:64,objectFit:"cover",borderRadius:10,border:"1px solid #d0d5dd"}}/>}
            <div style={{flex:1,minWidth:0}}>
              {i.status==="busy"&&<b style={{color:"#175cd3"}}>⏳ Шукаю в чеках…</b>}
              {i.status==="error"&&<b style={{color:"#b42318"}}>⚠ {i.error}</b>}
              {i.status==="ok"&&<><b style={{display:"block",fontSize:16}} data-notr>{[i.product?.brand,i.product?.name].filter(Boolean).join(" · ")||"Товар не розпізнано"}</b>
                {i.product?.details&&<small style={{color:"#475467",display:"block"}} data-notr>{i.product.details}</small>}</>}
            </div>
            <button type="button" aria-label="прибрати" onClick={()=>setItems(x=>x.filter(y=>y.id!==i.id))} style={{background:"transparent",border:"none",color:"#98a2b3",fontSize:20,padding:"0 4px"}}>×</button>
          </div>
          {i.status==="ok"&&!i.matches?.length&&<div style={{marginTop:8,padding:"10px 12px",borderRadius:12,background:"#fffaeb",border:"1px solid #fedf89",fontSize:15}}>
            Не знайшов цей товар у чеках (перевірив {i.total||0}). Можливо, його купували без чека в програмі або назва в чеку надто скорочена.
          </div>}
          {i.status==="ok"&&(i.matches||[]).map((m,k)=><div key={m.receiptId+k} style={{marginTop:8,padding:"10px 12px",borderRadius:12,background:k===0?"#f0f9ff":"#f9fafb",border:`1px solid ${k===0?"#7cd4fd":"#eaecf0"}`}}>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <b style={{fontSize:17}} data-notr>{m.store||"Магазин не вказаний"}</b>
                <span style={{marginLeft:8,fontSize:12,fontWeight:700,padding:"2px 8px",borderRadius:999,background:m.exact?"#dcfae6":m.confidence>=0.7?"#d1e9ff":"#fef0c7",color:m.exact?"#067647":m.confidence>=0.7?"#175cd3":"#93370d"}}>{m.exact?"точний збіг коду":m.confidence>=0.7?"схоже, це він":"можливо"}</span>
                <div style={{fontSize:14,marginTop:3}}><span data-notr>{m.date}</span>{m.daysAgo!=null&&<> · {m.daysAgo===0?"сьогодні":<><span data-notr>{m.daysAgo}</span> дн. тому</>}</>} · чек на <span data-notr>{money(m.amount)}</span></div>
                <div style={{fontSize:14,color:"#475467"}} data-notr>{m.client}{m.project?` — ${m.project}`:""}</div>
                {m.receiptNo&&<div style={{fontSize:13,color:"#667085"}}>Чек № <span data-notr>{m.receiptNo}</span></div>}
                {m.why&&<div style={{fontSize:13,color:"#475467",marginTop:3}} data-notr>{m.why}</div>}
              </div>
              {m.photoUrl&&<a href={m.photoUrl} target="_blank" rel="noreferrer"><img src={m.photoUrl} alt="чек" style={{width:60,height:84,objectFit:"cover",borderRadius:8,border:"1px solid #d0d5dd"}}/></a>}
            </div>
            <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
              {m.photoUrl&&<a href={m.photoUrl} target="_blank" rel="noreferrer" style={{fontSize:14,fontWeight:600,padding:"8px 12px",borderRadius:10,background:"#fff",border:"1px solid #d0d5dd",color:"#344054",textDecoration:"none"}}>🧾 Відкрити чек</a>}
              {onOpenProject&&<button type="button" onClick={()=>{setOpen(false);onOpenProject(m.sid)}} style={{fontSize:14,fontWeight:600,padding:"8px 12px",borderRadius:10,background:"#fff",border:"1px solid #d0d5dd",color:"#344054"}}>Проєкт</button>}
            </div>
          </div>)}
        </div>)}
      </div>
    </div>,document.body)}
  </>;
}
