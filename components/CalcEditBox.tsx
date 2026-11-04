"use client";
import {useRef,useState} from "react";
import type {CalcItem,CalcTask} from "@/lib/calcTypes";
import {computeCalcLine,computeCalcTotals} from "@/lib/calcEngine";

// ✏️ Змінити естімейт голосом або текстом: «підніми плитку до 14 за фут, додай демонтаж ванни, прибери фарбування».
type Op={op:string;i:number|null;quantity:number|null;labor_per_unit:number|null;line_total:number|null;material_per_unit:number|null;finish_per_unit:number|null;
  difficulty:"basic"|"standard"|"difficult"|null;optional:boolean|null;note:string|null;name:string|null;task_id:string|null;description:string|null;unit:CalcItem["unit"]|null;
  stated_price:number|null;stated_price_type:"unit"|"total"|null;discount_type:"percent"|"amount"|null;value:number|null;scope:"labor"|"total"|null;text:string|null};
type Snap={items:CalcItem[];discountType:"percent"|"amount";discountValue:number;depositPct:number;notes:string};

const r4=(n:number)=>Math.round(n*10000)/10000;
const dm=(li:CalcItem)=>(li.difficultyMultipliers&&li.difficultyMultipliers[li.difficulty])||1;

export default function CalcEditBox({items,tasks,loc,includeFinish,project,discountType,discountValue,depositPct,notes,measurements,applyTask,onChange}:{
  items:CalcItem[];tasks:CalcTask[];loc:number;includeFinish:boolean;project:string;measurements?:string;
  discountType:"percent"|"amount";discountValue:number;depositPct:number;notes:string;
  applyTask:(item:CalcItem,task:CalcTask)=>CalcItem;
  onChange:(s:Snap)=>void;
}){
  const [text,setText]=useState("");
  const [busy,setBusy]=useState("");
  const [msg,setMsg]=useState("");
  const [undo,setUndo]=useState<Snap|null>(null);
  const [review,setReview]=useState<{level:string;text:string;fix:string;done?:boolean}[]|null>(null);
  const rec=useRef<MediaRecorder|null>(null);const chunks=useRef<Blob[]>([]);
  const L=Number(loc)||1;

  function setLabor(li:CalcItem,perUnit:number):CalcItem{return {...li,laborRate:r4(Math.max(0,perUnit)/(dm(li)*L)),laborOwn:true,minPrice:0}}
  function setLineTotal(li:CalcItem,total:number):CalcItem{
    const q=Number(li.quantity)||1;const sp=Number(li.suppliesFixed)>0?0:(Number(li.suppliesPct)||0);
    const F=includeFinish?q*Number(li.finishRate||0):0;const M=q*Number(li.materialRate||0)+(Number(li.suppliesFixed)||0);
    let lab=(total-F-(Number(li.suppliesFixed)>0?Number(li.suppliesFixed):0))/(1+sp)-q*Number(li.materialRate||0);
    let next={...li,minPrice:0,laborOwn:true};
    if(lab<0){next={...next,materialRate:0,finishRate:0,finishOwn:true};lab=total/(1+sp)}
    void M;
    return {...next,laborRate:r4(lab/(q*dm(li)*L))};
  }
  function scaleTo(list:CalcItem[],value:number,scope:"labor"|"total",disc:number){
    let cur=list;
    for(let k=0;k<5;k++){
      const act=cur.filter(i=>!i.optional);const t=computeCalcTotals(act,L,includeFinish);
      const got=scope==="labor"?t.labor-disc:t.lineTotal-disc;if(!t.labor)break;
      const f=1+(value-got)/t.labor;if(Math.abs(value-got)<0.5)break;
      cur=cur.map(i=>i.optional?i:{...i,laborRate:r4(i.laborRate*f),laborOwn:true,minPrice:0});
    }
    return cur;
  }

  async function run(instruction:string){
    const ins=instruction.trim();if(!ins||!items.length){if(!items.length)setMsg("Спершу зроби естімейт.");return}
    setBusy("ai");setMsg("");
    try{
      const lines=items.map((li,i)=>{const c=computeCalcLine(li,L,includeFinish);const q=Number(li.quantity)||1;
        return {i,name:li.name,taskId:li.taskId,unit:li.unit,qty:q,difficulty:li.difficulty,laborPerUnit:Math.round(c.labor/q*100)/100,materialPerUnit:Number(li.materialRate)||0,finishPerUnit:Number(li.finishRate)||0,lineTotal:Math.round(c.lineTotal*100)/100,optional:!!li.optional,note:li.note||""}});
      const t=computeCalcTotals(items.filter(i=>!i.optional),L,includeFinish);
      const res=await fetch("/api/calc-edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lang:document.documentElement.lang,instruction:ins,lines,project,
        tasks:tasks.map(x=>({id:x.id,name:x.name,unit:x.unit,category:x.category})),discount:{type:discountType,value:discountValue},deposit_pct:depositPct,totals:{labor:Math.round(t.labor),total:Math.round(t.lineTotal)}})});
      const j=await res.json();if(!res.ok)throw new Error(j?.error||"AI error");
      const ops:Op[]=j.ops||[];
      if(!ops.length){setMsg(j.question||"Не зрозумів, що змінити. Скажи інакше.");return}
      const before:Snap={items,discountType,discountValue,depositPct,notes};
      let next=items.slice();const removed=new Set<number>();
      let dT=discountType,dV=discountValue,dep=depositPct,nts=notes;let target:Op|null=null;
      for(const o of ops){
        if(o.op==="update"&&o.i!=null&&next[o.i]){
          let li={...next[o.i]};
          if(o.quantity!=null&&o.quantity>0)li.quantity=o.quantity;
          if(o.difficulty)li.difficulty=o.difficulty;
          if(o.material_per_unit!=null)li.materialRate=Math.max(0,o.material_per_unit);
          if(o.finish_per_unit!=null){li.finishRate=Math.max(0,o.finish_per_unit);li.finishOwn=true}
          if(o.optional!=null)li.optional=o.optional||undefined;
          if(o.note)li.note=o.note;
          if(o.name)li.name=o.name;
          if(o.labor_per_unit!=null)li=setLabor(li,o.labor_per_unit);
          if(o.labor_per_unit==null&&o.line_total!=null&&o.line_total>=0&&Math.abs(o.line_total-computeCalcLine(next[o.i],L,includeFinish).lineTotal)>0.5)li=setLineTotal(li,o.line_total);
          next[o.i]=li;
        }else if(o.op==="remove"&&o.i!=null&&next[o.i]){removed.add(o.i)}
        else if(o.op==="add"){
          const task=o.task_id&&o.task_id!=="CUSTOM"?tasks.find(x=>x.id===o.task_id):undefined;
          const q=Number(o.quantity)||1;
          const blank:CalcItem={id:crypto.randomUUID(),taskId:"",name:o.description||task?.name||"Work",category:"Custom",unit:(o.unit||task?.unit||"each") as CalcItem["unit"],quantity:q,difficulty:o.difficulty||"standard",laborRate:0,materialRate:0,suppliesPct:0,suppliesFixed:0,minPrice:0,difficultyMultipliers:{basic:1,standard:1,difficult:1},lowMult:0.85,highMult:1.25,notes:"",note:o.note||undefined,...(o.optional?{optional:true}:{})};
          let li=task?{...applyTask(blank,task),quantity:q,difficulty:o.difficulty||"standard",note:o.note||undefined,...(o.optional?{optional:true}:{})}:blank;
          const sp=Number(o.stated_price);
          if(sp>0)li=o.stated_price_type==="total"?setLineTotal(li,sp):setLabor(li,sp);
          next.push(li);
        }
        else if(o.op==="discount"){dT=o.discount_type||dT;dV=Math.max(0,Number(o.value)||0)}
        else if(o.op==="deposit_pct"&&o.value!=null){dep=Math.min(100,Math.max(0,o.value))}
        else if(o.op==="notes_append"&&o.text){nts=[nts.trim(),o.text.trim()].filter(Boolean).join("\n\n")}
        else if(o.op==="target_total"&&(o.value||o.line_total||o.stated_price)){target={...o,value:o.value||o.line_total||o.stated_price}}
      }
      next=next.filter((_,i)=>!removed.has(i));
      if(target){
        const act=next.filter(i=>!i.optional);const t2=computeCalcTotals(act,L,includeFinish);
        const disc=dT==="percent"?t2.labor*dV/100:dV;
        next=scaleTo(next,Number(target.value),target.scope==="total"?"total":"labor",dT==="percent"?0:disc);
      }
      setUndo(before);
      onChange({items:next,discountType:dT,discountValue:dV,depositPct:dep,notes:nts});
      setMsg("✓ "+(j.summary||"Змінено."));setText("");
    }catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("")}
  }

  // 🔍 перевірка «очима досвідченого контрактора»
  async function check(){
    setBusy("rv");setMsg("");setReview(null);
    try{
      const lines=items.map(li=>{const c=computeCalcLine(li,L,includeFinish);return {name:li.name,qty:Number(li.quantity)||0,unit:li.unit,difficulty:li.difficulty,labor:Math.round(c.labor),materials:Math.round(c.materials+c.supplies),finish:Math.round(c.finish),total:Math.round(c.lineTotal),optional:!!li.optional,note:li.note||"",customerSupplies:!!li.finishOwn&&!Number(li.finishRate)}});
      const t=computeCalcTotals(items.filter(i=>!i.optional),L,includeFinish);
      const r=await fetch("/api/calc-review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lang:document.documentElement.lang,project,lines,notes,measurements:measurements||"",totals:{labor:Math.round(t.labor),total:Math.round(t.lineTotal)}})});
      const j=await r.json();if(!r.ok)throw new Error(j?.error||"AI error");
      setReview(j.items||[]);
    }catch(e){setMsg(e instanceof Error?e.message:String(e))}finally{setBusy("")}
  }

  async function mic(){
    if(rec.current){rec.current.stop();return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const type=["audio/mp4","audio/webm;codecs=opus","audio/webm"].find(t=>typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported?.(t))||"";
      const r=type?new MediaRecorder(stream,{mimeType:type}):new MediaRecorder(stream);rec.current=r;chunks.current=[];
      r.ondataavailable=e=>{if(e.data?.size)chunks.current.push(e.data)};
      r.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());rec.current=null;setBusy("tr");
        try{
          const blob=new Blob(chunks.current,{type:r.mimeType||"audio/mp4"});
          if(blob.size<800){setMsg("Запис надто короткий.");setBusy("");return}
          const f=new FormData();f.append("audio",blob,`edit.${(r.mimeType||"").includes("webm")?"webm":"mp4"}`);
          const res=await fetch("/api/transcribe",{method:"POST",body:f});const j=await res.json();
          const said=String(j?.text||"").trim();setBusy("");
          if(!said){setMsg("Не розібрав. Спробуй ще раз.");return}
          setText(said);await run(said);
        }catch(e){setBusy("");setMsg(e instanceof Error?e.message:String(e))}
      };
      r.start(1000);setBusy("rec");setMsg("🎙 Говори… натисни ще раз, щоб закінчити");
    }catch{setMsg("Нема доступу до мікрофона.")}
  }

  if(!items.length)return null;
  return <section className="panel noPrint" style={{borderColor:"#b2ccff",background:"#f5f8ff"}}>
    <b>✏️ Змінити естімейт</b>
    <small className="muted" style={{display:"block",margin:"2px 0 8px"}}>Скажи або напиши: «плитку по 14 за фут», «додай демонтаж ванни», «прибери фарбування», «зроби 5000 за роботу», «душову нішу як опцію».</small>
    <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Що змінити?" style={{minHeight:70}}/>
    <div className="actions" style={{marginTop:8}}>
      <button className={busy==="rec"?"primary":"secondary"} onClick={mic} disabled={busy==="ai"||busy==="tr"} style={busy==="rec"?{background:"#d92d20"}:undefined}>{busy==="rec"?"⏹ Стоп":busy==="tr"?"Розпізнаю…":"🎙 Голосом"}</button>
      <button className="primary" onClick={()=>run(text)} disabled={!text.trim()||!!busy}>{busy==="ai"?"Змінюю…":"Застосувати"}</button>
    </div>
    <button className="secondary" onClick={check} disabled={!!busy} style={{width:"100%",marginTop:8,background:"#fff",border:"1px solid #b2ccff",fontWeight:800}}>{busy==="rv"?"Перевіряю…":"🔍 Перевірити естімейт — що забув або занизив"}</button>
    {review&&<div style={{marginTop:10}}>
      {!review.length&&<p style={{fontSize:14,color:"#067647",margin:0}}>✓ Явних пропусків не знайшов.</p>}
      {review.map((r,k)=><div key={k} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 0",borderTop:"1px solid #dbe4ff",opacity:r.done?.5:1}}>
        <span>{r.level==="high"?"⚠️":"💡"}</span>
        <span style={{flex:1,fontSize:14}}>{r.text}</span>
        {r.fix&&!r.done&&<button className="secondary" disabled={!!busy} onClick={async()=>{setReview(v=>v&&v.map((x,i)=>i===k?{...x,done:true}:x));await run(r.fix)}} style={{padding:"6px 10px",fontSize:13,whiteSpace:"nowrap"}} title={r.fix}>＋ Додати</button>}
        {r.done&&<span style={{fontSize:13,color:"#067647"}}>✓</span>}
      </div>)}
    </div>}
    {msg&&<p style={{fontSize:14,margin:"8px 0 0",whiteSpace:"pre-line",color:msg.startsWith("✓")?"#067647":"#344054"}}>{msg}</p>}
    {undo&&<button className="secondary" onClick={()=>{onChange(undo);setUndo(null);setMsg("↩ Повернув як було.")}} style={{marginTop:8,padding:"8px 12px"}}>↩ Скасувати зміну</button>}
  </section>;
}
