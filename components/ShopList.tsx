"use client";
import {useEffect,useRef,useState} from "react";

// 🛒 Список покупок по проєкту: диктуєш голосом або пишеш → окремі позиції з галочками.
// Один компонент і для власника (Оплати), і для помічника (його посилання) — різниться тільки call().
type Item={id:string;text:string;done:boolean;by:string|null;created_at:string};
type Lang="uk"|"en";
const P={
  uk:{h:"✅ Доробки (punch list)",ph:"Що доробити? Напр.: підфарбувати кут у ванній, замінити кришку розетки, силікон біля ванни",empty:"Доробок немає. Пройдись з клієнтом по об'єкту й надиктуй дрібниці, які лишились.",clear:"Прибрати зроблене",bought:"зроблено"},
  en:{h:"✅ Punch list",ph:"What to fix? e.g. touch up paint in bathroom corner, replace outlet cover, caulk around tub",empty:"No punch items. Walk the job with the client and dictate what's left.",clear:"Remove done",bought:"done"},
};
const L={
  uk:{h:"🛒 Список покупок",ph:"Що купити? Напр.: 2 мішки тинсету, затирка сіра, 3 листи драйволу",add:"＋ Додати",mic:"🎙 Сказати",stop:"⏹ Готово",rec:"🎙 Говори… натисни «Готово», коли закінчиш",tr:"Розпізнаю…",adding:"Додаю…",
      empty:"Список порожній. Надиктуй або впиши, що треба купити.",clear:"Прибрати куплене",short:"Запис надто короткий.",nomic:"Нема доступу до мікрофона.",bought:"куплено"},
  en:{h:"🛒 Shopping list",ph:"What to buy? e.g. 2 bags thinset, grey grout, 3 sheets of drywall",add:"＋ Add",mic:"🎙 Speak",stop:"⏹ Done",rec:"🎙 Speak… tap Done when finished",tr:"Recognizing…",adding:"Adding…",
      empty:"The list is empty. Dictate or type what to buy.",clear:"Remove bought",short:"Recording too short.",nomic:"No microphone access.",bought:"bought"},
};
export default function ShopList({call,lang="uk",style,kind="shop",hideEmpty=false,authHeaders}:{call:(body:any)=>Promise<{items:Item[]}>;lang?:Lang;style?:React.CSSProperties;kind?:"shop"|"punch";hideEmpty?:boolean;authHeaders?:Record<string,string>}){
  const t=kind==="punch"?{...L[lang],...P[lang]}:L[lang];
  const [items,setItems]=useState<Item[]|null>(null);
  const [text,setText]=useState("");const [busy,setBusy]=useState("");const [msg,setMsg]=useState("");
  const rec=useRef<MediaRecorder|null>(null);const chunks=useRef<Blob[]>([]);
  const run=async(body:any)=>{try{const r=await call({...body,kind});setItems(r.items||[]);return true}catch(e){setMsg(e instanceof Error?e.message:String(e));return false}};
  useEffect(()=>{void run({action:"list"})},[]);// eslint-disable-line react-hooks/exhaustive-deps
  async function add(s:string){
    if(!s.trim())return;setBusy("add");setMsg("");
    if(await run({action:"add",text:s}))setText("");setBusy("");
  }
  async function mic(){
    if(rec.current){rec.current.stop();return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const type=["audio/mp4","audio/webm;codecs=opus","audio/webm"].find(x=>typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported?.(x))||"";
      const r=type?new MediaRecorder(stream,{mimeType:type}):new MediaRecorder(stream);rec.current=r;chunks.current=[];
      r.ondataavailable=e=>{if(e.data?.size)chunks.current.push(e.data)};
      r.onstop=async()=>{
        stream.getTracks().forEach(x=>x.stop());rec.current=null;setBusy("tr");setMsg("");
        try{
          const blob=new Blob(chunks.current,{type:r.mimeType||"audio/mp4"});
          if(blob.size<800){setMsg(t.short);setBusy("");return}
          const f=new FormData();f.append("audio",blob,`shop.${(r.mimeType||"").includes("webm")?"webm":"mp4"}`);
          const j=await fetch("/api/transcribe",{method:"POST",body:f,headers:authHeaders}).then(x=>x.json());
          const said=String(j?.text||"").trim();setBusy("");
          if(!said){setMsg(j?.error||t.short);return}
          await add(said);
        }catch(e){setBusy("");setMsg(e instanceof Error?e.message:String(e))}
      };
      r.start(1000);setBusy("rec");
    }catch{setMsg(t.nomic)}
  }
  const btn:React.CSSProperties={padding:"12px 10px",borderRadius:12,fontWeight:800,fontSize:15,border:"none"};
  const open=(items||[]).filter(i=>!i.done),done=(items||[]).filter(i=>i.done);
  const row=(i:Item)=><div key={i.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderTop:"1px solid #eaecf0"}}>
    <input type="checkbox" checked={i.done} onChange={e=>void run({action:"toggle",id:i.id,done:e.target.checked,text:i.text})} style={{width:24,height:24,flex:"none"}}/>
    <span data-notr style={{flex:1,fontSize:16,textDecoration:i.done?"line-through":"none",color:i.done?"#98a2b3":"#101828"}}>{i.text}{i.by&&i.by!=="owner"?<small style={{color:"#98a2b3"}}> · {i.by}</small>:null}</span>
    <button onClick={()=>void run({action:"del",id:i.id})} aria-label="×" style={{border:"none",background:"none",fontSize:20,color:"#98a2b3",padding:"0 4px"}}>×</button>
  </div>;
  if(hideEmpty&&(!items||!items.length))return null;
  return <div style={style}>
    <h3 style={{marginTop:0}}>{t.h}{open.length?` · ${open.length}`:""}</h3>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <button onClick={mic} disabled={busy==="tr"||busy==="add"} style={{...btn,background:busy==="rec"?"#d92d20":"#2563eb",color:"#fff"}}>{busy==="rec"?t.stop:busy==="tr"?t.tr:t.mic}</button>
      <button onClick={()=>void add(text)} disabled={!text.trim()||!!busy} style={{...btn,background:"#079455",color:"#fff",opacity:text.trim()?1:.5}}>{busy==="add"?t.adding:t.add}</button>
    </div>
    <textarea value={text} onChange={e=>setText(e.target.value)} placeholder={t.ph} rows={2} style={{width:"100%",padding:10,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16,marginTop:8,boxSizing:"border-box"}}/>
    {busy==="rec"&&<small style={{color:"#d92d20",display:"block"}}>{t.rec}</small>}
    {msg&&<small style={{color:"#b42318",display:"block"}}>{msg}</small>}
    {items&&!items.length&&<small style={{color:"#667085",display:"block",marginTop:6}}>{t.empty}</small>}
    {open.map(row)}
    {done.length>0&&<><small style={{color:"#98a2b3",display:"block",marginTop:8}}>✓ {t.bought}: {done.length}</small>{done.map(row)}
      <button onClick={()=>void run({action:"clear"})} style={{...btn,background:"#eef2f7",color:"#344054",marginTop:8,width:"100%",fontSize:14}}>{t.clear}</button></>}
  </div>;
}
