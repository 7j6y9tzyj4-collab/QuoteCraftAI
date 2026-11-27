"use client";
import {useEffect,useRef,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import type {Statement} from "@/lib/statement";
import {changeTotal,newChangeOrder,DEFAULT_CHANGE_NOTES,type ChangeOrder,type ChangeSnapshot} from "@/lib/changeOrder";
import {companyName,companyContact} from "@/lib/company";
import SignaturePad,{type SigHandle} from "@/app/q/[token]/SignaturePad";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const CYR=/[а-яіїєґё]/i;
async function translate(texts:string[]):Promise<string[]>{
  const r=await fetch("/api/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({texts})});
  const d=await r.json();if(!r.ok)throw new Error(d?.error||"translate error");
  return d.texts;
}
const STATUS:Record<ChangeOrder["status"],string>={draft:"чернетка",sent:"надіслано",viewed:"👁 переглянув",accepted:"✓ погоджено"};

// Доплати по ходу роботи: створив → «🔗 Надіслати» → клієнт тисне Approve → сума сама додається в «Роботу».
export default function ChangeOrders({st,user,onPatch,setMsg}:{st:Statement;user:User|null;onPatch:(p:Partial<Statement>)=>void;setMsg:(m:string)=>void}){
  const list=st.changes||[];
  const [busyId,setBusyId]=useState("");
  const stRef=useRef(st);stRef.current=st;
  const rec=useRef<MediaRecorder|null>(null);const chunks=useRef<Blob[]>([]);
  const [voice,setVoice]=useState<""|"rec"|"work">("");
  const [signId,setSignId]=useState("");const [signName,setSignName]=useState("");const [signBusy,setSignBusy]=useState(false);const [signErr,setSignErr]=useState("");
  const sigRef=useRef<SigHandle>(null);

  const save=(changes:ChangeOrder[],extra:Partial<Statement>={})=>onPatch({changes,...extra});
  const setCo=(id:string,patch:Partial<ChangeOrder>)=>save(list.map(c=>c.id===id?{...c,...patch}:c));

  // погоджено → рядок у «Роботі»
  function acceptInto(s:Statement,id:string,patch:Partial<ChangeOrder>):Partial<Statement>{
    const changes=(s.changes||[]).map(c=>c.id===id?{...c,...patch}:c);
    const co=changes.find(c=>c.id===id)!;
    if(co.laborLineId&&s.labor.some(l=>l.id===co.laborLineId))return {changes};
    const lineId=crypto.randomUUID();
    const desc=`Change order #${co.no}${co.title?`: ${co.title}`:""}`;
    return {changes:changes.map(c=>c.id===id?{...c,laborLineId:lineId}:c),labor:[...s.labor,{id:lineId,description:desc,amount:changeTotal(co)}]};
  }

  // при відкритті — перевіряємо, чи клієнт уже погодив
  useEffect(()=>{
    const pending=(st.changes||[]).filter(c=>c.token&&c.status!=="accepted");
    if(!pending.length||!user)return;
    let on=true;
    supabase.from("shared_quotes").select("token,status,accepted_at,accepted_name").in("token",pending.map(c=>c.token!)).then(({data}:{data:any[]|null})=>{
      if(!on||!data)return;
      let s=stRef.current;let patch:Partial<Statement>={};const okNos:number[]=[];
      for(const row of data){
        const co=(s.changes||[]).find(c=>c.token===row.token);if(!co)continue;
        if(row.status==="accepted"){
          patch=acceptInto(s,co.id,{status:"accepted",acceptedAt:row.accepted_at||undefined,acceptedName:row.accepted_name||undefined});
          s={...s,...patch};okNos.push(co.no);
        }else if(row.status!==co.status&&(row.status==="viewed"||row.status==="sent")){
          patch={changes:(s.changes||[]).map(c=>c.id===co.id?{...c,status:row.status}:c)};s={...s,...patch};
        }
      }
      if(s!==stRef.current)onPatch({changes:s.changes,labor:s.labor});
      if(okNos.length)setMsg(`Клієнт погодив доплату #${okNos.join(", #")} — суму додано в «Роботу».`);
    });
    return()=>{on=false};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[st.id,user]);

  function add(){
    const no=Math.max(0,...list.map(c=>c.no))+1;
    save([...list,{...newChangeOrder(no),notes:DEFAULT_CHANGE_NOTES}]);
  }
  // українською → англійською (назва, рядки, примітка)
  async function toEnglish(co:ChangeOrder):Promise<ChangeOrder|null>{
    setBusyId(co.id);
    try{
      const src=[co.title,...co.lines.map(l=>l.description),co.notes||""];
      const out=await translate(src);
      const next:ChangeOrder={...co,title:out[0],lines:co.lines.map((l,i)=>({...l,description:out[i+1]})),notes:out[src.length-1]};
      setCo(co.id,{title:next.title,lines:next.lines,notes:next.notes});
      return next;
    }catch(e){setMsg("Не вдалося перекласти: "+(e instanceof Error?e.message:String(e)));return null}
    finally{setBusyId("")}
  }
  // сторінка клієнта для доплати (створити або оновити) → токен
  async function ensureLink(co0:ChangeOrder):Promise<{token:string;co:ChangeOrder}|null>{
    let co=co0;
    // якщо є українські літери — спершу перекладаємо, клієнт бачить англійською
    if(CYR.test([co.title,...co.lines.map(l=>l.description),co.notes||""].join(" "))){const t=await toEnglish(co);if(!t)return null;co=t}
    if(!user){setMsg("Увійди в акаунт, щоб надіслати посилання.");return null}
    const total=changeTotal(co);
    if(!co.lines.some(l=>l.description.trim()&&l.amount)){setMsg("Додай опис і суму доплати.");return null}
    const data:ChangeSnapshot={v:1,kind:"change",company:companyName(),contact:companyContact(),client:st.client,project:st.project,
      date:new Date().toLocaleDateString("en-US"),no:co.no,title:co.title,lines:co.lines.filter(l=>l.description.trim()||l.amount).map(l=>({description:l.description,amount:Number(l.amount)||0})),total,notes:co.notes||""};
    try{
      let token=co.token||"";
      if(token){
        const {data:row,error}=await supabase.from("shared_quotes").update({data,updated_at:new Date().toISOString()}).eq("token",token).select("token").maybeSingle();
        if(error)throw error;if(!row)token="";
      }
      if(!token){
        token=crypto.randomUUID();
        const {error}=await supabase.from("shared_quotes").insert({token,user_id:user.id,data,status:"sent"});
        if(error)throw error;
      }
      const next={...co,token,status:co.status==="draft"?"sent" as const:co.status};
      setCo(co.id,{token,status:next.status});
      return {token,co:next};
    }catch(e){setMsg("Не вдалося надіслати: "+(e instanceof Error?e.message:String((e as any)?.message||e)));return null}
  }
  async function send(co0:ChangeOrder){
    const r=await ensureLink(co0);if(!r)return;
    const link=`${window.location.origin}/q/${r.token}`;
    const nav=navigator as Navigator&{share?:(d:ShareData)=>Promise<void>};
    if(nav.share&&/iPhone|iPad|Android/i.test(navigator.userAgent)){try{await nav.share({text:link});setMsg("Посилання на доплату надіслано.");return}catch{/* скасував */}}
    try{await navigator.clipboard.writeText(link);setMsg("Посилання на доплату скопійовано: "+link)}catch{setMsg("Посилання: "+link)}
  }
  // 🎤 продиктував на об'єкті → готова доплата англійською з цінами
  async function dictate(){
    if(rec.current){rec.current.stop();return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const type=["audio/mp4","audio/webm;codecs=opus","audio/webm"].find(x=>typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported?.(x))||"";
      const r=type?new MediaRecorder(stream,{mimeType:type}):new MediaRecorder(stream);rec.current=r;chunks.current=[];
      r.ondataavailable=e=>{if(e.data?.size)chunks.current.push(e.data)};
      r.onstop=async()=>{
        stream.getTracks().forEach(x=>x.stop());rec.current=null;setVoice("work");
        try{
          const blob=new Blob(chunks.current,{type:r.mimeType||"audio/mp4"});
          if(blob.size<800){setMsg("Запис закороткий — спробуй ще раз.");return}
          const f=new FormData();f.append("audio",blob,`co.${(r.mimeType||"").includes("webm")?"webm":"mp4"}`);
          const j=await fetch("/api/transcribe",{method:"POST",body:f}).then(x=>x.json());
          const said=String(j?.text||"").trim();
          if(!said){setMsg(j?.error||"Не розчув — спробуй ще раз.");return}
          const d=await fetch("/api/change-draft",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:said,project:stRef.current.project})}).then(x=>x.json());
          if(!Array.isArray(d?.lines)||!d.lines.length){setMsg(d?.error||"Не вдалося скласти доплату.");return}
          const cur=stRef.current.changes||[];const no=Math.max(0,...cur.map(c=>c.no))+1;
          const co:ChangeOrder={...newChangeOrder(no),title:String(d.title||""),notes:DEFAULT_CHANGE_NOTES,lines:d.lines.map((l:{description:string;amount:number})=>({id:crypto.randomUUID(),description:l.description,amount:Number(l.amount)||0}))};
          onPatch({changes:[...cur,co]});
          setMsg(d.priced?`Доплату #${no} складено з твоїми цінами — перевір і давай клієнту на підпис.`:`Доплату #${no} складено: приблизно ${d.hours} год роботи. Перевір ціни й давай клієнту на підпис.`);
        }catch(e){setMsg(e instanceof Error?e.message:String(e))}
        finally{setVoice("")}
      };
      r.start(1000);setVoice("rec");
    }catch{setMsg("Нема доступу до мікрофона.")}
  }
  // ✍️ клієнт підписує пальцем прямо на моєму телефоні
  async function signHere(){
    const co=(stRef.current.changes||[]).find(c=>c.id===signId);if(!co)return;
    const name=signName.trim();const sig=sigRef.current?.get()||"";
    if(name.length<2){setSignErr("Впиши ім’я клієнта.");return}
    if(!sig){setSignErr("Клієнт має розписатись у рамці.");return}
    setSignBusy(true);setSignErr("");
    try{
      const r=await ensureLink(co);if(!r){setSignErr("Не вдалося зберегти доплату — перевір опис і суму.");return}
      const res=await fetch("/api/quote-accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:r.token,name,sig})});
      const j=await res.json();if(!res.ok)throw new Error(j?.error||"Server error");
      onPatch(acceptInto(stRef.current,co.id,{token:r.token,status:"accepted",acceptedName:name,acceptedAt:j?.accepted_at||new Date().toISOString()}));
      setMsg(`✍️ ${name} підписав(ла) доплату #${co.no} — ${money(changeTotal(r.co))} додано в «Роботу».`);
      setSignId("");setSignName("");
    }catch(e){setSignErr(e instanceof Error?e.message:String(e))}
    finally{setSignBusy(false)}
  }
  function manual(co:ChangeOrder){
    if(!confirm(`Клієнт погодив доплату #${co.no} (${money(changeTotal(co))}) усно? Сума додасться в «Роботу».`))return;
    onPatch(acceptInto(st,co.id,{status:"accepted",manual:true,acceptedAt:new Date().toISOString()}));
  }
  function remove(co:ChangeOrder){
    if(!confirm(`Видалити доплату #${co.no}?`))return;
    save(list.filter(c=>c.id!==co.id));
    if(co.token&&user)supabase.from("shared_quotes").delete().eq("token",co.token).then(()=>{});
  }

  return <section className="panel">
    <div className="head"><h2>Доплати (change orders)</h2><button className="add" onClick={add}>＋ Доплата</button></div>
    <button className={voice==="rec"?"primary":"secondary"} disabled={voice==="work"} onClick={dictate} style={{width:"100%",marginTop:6,padding:"12px 10px",fontWeight:700}}>{voice==="rec"?"⏹ Зупинити й скласти доплату":voice==="work"?"Складаю доплату…":"🎤 Продиктувати доплату"}</button>
    {voice==="rec"&&<small className="muted" style={{display:"block",marginTop:4}}>Кажи, що клієнт попросив додати. Назвеш ціну — візьму твою; не назвеш — порахую сам.</small>}
    {!list.length&&<p className="muted" style={{fontSize:14}}>Додаткова робота після прийнятого естімейту: створи доплату → «🔗 Надіслати» → клієнт тисне Approve → сума сама додається в «Роботу».</p>}
    {list.map(co=>{
      const locked=co.status==="accepted";
      const t=changeTotal(co);
      return <div key={co.id} style={{marginTop:12,padding:12,borderRadius:14,background:locked?"#ecfdf3":"#f8fafc",border:"1px solid #e4e7ec"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
          <b>#{co.no} {co.title||"Доплата"}</b>
          <span style={{fontSize:13,color:locked?"#067647":"#667085",whiteSpace:"nowrap"}}>{STATUS[co.status]}{locked&&co.acceptedName?` — ${co.acceptedName}`:""}{locked&&co.manual?" (усно)":""}</span>
        </div>
        {!locked&&<label style={{marginTop:8}}>Назва<input value={co.title} placeholder="можна українською: додаткова розетка в коморі" onChange={e=>setCo(co.id,{title:e.target.value})}/></label>}
        {co.lines.map(l=><div key={l.id} style={{display:"grid",gridTemplateColumns:locked?"1fr 110px":"1fr 110px 42px",gap:8,marginTop:8}}>
          {locked?<><span style={{fontSize:14}}>{l.description}</span><span style={{textAlign:"right",fontSize:14}}>{money(l.amount)}</span></>:<>
            <input placeholder="Що робимо (можна українською)" value={l.description} onChange={e=>setCo(co.id,{lines:co.lines.map(x=>x.id===l.id?{...x,description:e.target.value}:x)})}/>
            <input type="number" step="0.01" value={l.amount} onChange={e=>setCo(co.id,{lines:co.lines.map(x=>x.id===l.id?{...x,amount:Number(e.target.value)||0}:x)})}/>
            <button className="remove" onClick={()=>setCo(co.id,{lines:co.lines.filter(x=>x.id!==l.id)})}>×</button>
          </>}
        </div>)}
        {!locked&&<button className="secondary" style={{marginTop:8,padding:"6px 10px",fontSize:13}} onClick={()=>setCo(co.id,{lines:[...co.lines,{id:crypto.randomUUID(),description:"",amount:0}]})}>＋ Рядок</button>}
        {!locked&&<details style={{marginTop:8}}><summary style={{fontSize:13}}>Примітка для клієнта</summary><textarea rows={3} value={co.notes||""} onChange={e=>setCo(co.id,{notes:e.target.value})}/></details>}
        <div style={{display:"flex",justifyContent:"space-between",marginTop:10,fontSize:15}}><span>Разом доплата</span><b>{money(t)}</b></div>
        {!locked&&<div className="actions" style={{marginTop:8,flexWrap:"wrap"}}>
          <button className="secondary" disabled={busyId===co.id} onClick={()=>toEnglish(co)}>{busyId===co.id?"Перекладаю…":"🌐 Перекласти на англійську"}</button>
          <button className="primary" disabled={busyId===co.id} onClick={()=>send(co)}>🔗 {co.token?"Оновити й надіслати":"Надіслати клієнту"}</button>
          <button className="primary" style={{background:"#067647"}} disabled={busyId===co.id} onClick={()=>{setSignErr("");setSignName(signName||st.client||"");setSignId(co.id)}}>✍️ Підписати тут</button>
          <button className="secondary" onClick={()=>manual(co)}>✓ Погоджено усно</button>
          <button className="secondary" style={{color:"#b42318",flex:"0 0 auto"}} onClick={()=>remove(co)}>Видалити</button>
        </div>}
        {co.token&&<small className="muted" style={{display:"block",marginTop:6}}><a href={`/q/${co.token}`} target="_blank" rel="noreferrer">відкрити сторінку клієнта</a></small>}
      </div>;
    })}
    {signId&&(()=>{const co=list.find(c=>c.id===signId);if(!co)return null;return <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(16,24,40,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div data-notr style={{background:"#fff",width:"100%",maxWidth:560,maxHeight:"92vh",overflowY:"auto",borderRadius:"18px 18px 0 0",padding:"18px 16px calc(18px + env(safe-area-inset-bottom))"}}>
        <b style={{fontSize:18}}>Change order #{co.no}{co.title?` — ${co.title}`:""}</b>
        <div style={{marginTop:8}}>{co.lines.filter(l=>l.description.trim()||l.amount).map(l=><div key={l.id} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"6px 0",borderTop:"1px solid #eaecf0",fontSize:15}}><span>{l.description}</span><span style={{whiteSpace:"nowrap"}}>{money(l.amount)}</span></div>)}</div>
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:"2px solid #101828",fontSize:18}}><b>Total added</b><b>{money(changeTotal(co))}</b></div>
        <small style={{color:"#667085",display:"block"}}>By signing, I approve this additional work and its price. All other terms of the original estimate stay the same.</small>
        <label style={{marginTop:10,display:"block"}}>Your name<input value={signName} onChange={e=>setSignName(e.target.value)} autoComplete="off"/></label>
        <SignaturePad ref={sigRef} label="Sign here"/>
        {signErr&&<p style={{color:"#b42318",margin:"4px 0"}}>{signErr}</p>}
        <div className="actions" style={{marginTop:6}}>
          <button className="secondary" disabled={signBusy} onClick={()=>setSignId("")}>Cancel</button>
          <button className="primary" disabled={signBusy} onClick={signHere}>{signBusy?"Saving…":"Approve & sign"}</button>
        </div>
      </div>
    </div>})()}
  </section>;
}
