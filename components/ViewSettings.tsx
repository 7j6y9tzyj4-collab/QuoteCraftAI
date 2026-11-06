"use client";
import {useState} from "react";
import {HOME_BLOCKS,TABS,PRESETS,type UiPrefs,type Mode,type Tab} from "@/lib/uiPrefs";

// ⚙ Налаштування → 🎨 Вигляд програми
export default function ViewSettings({ui,onSave,isAdmin}:{ui:UiPrefs;onSave:(u:UiPrefs)=>void;isAdmin?:boolean}){
  const [tb,setTb]=useState("");
  async function buildTr(){setTb("Перекладаю…");try{for(let k=0;k<40;k++){const r=await fetch("/api/i18n-build",{method:"POST"});const j=await r.json();if(!r.ok)throw new Error(j.error);setTb(`Перекладаю… лишилось ${j.remaining} з ${j.total}`);if(!j.remaining)break}setTb("✓ Переклад оновлено");}catch(e){setTb("Помилка: "+(e instanceof Error?e.message:String(e)))}}
  const pill=(on:boolean):React.CSSProperties=>({padding:"10px 12px",borderRadius:12,fontWeight:800,fontSize:14,background:on?"#101828":"#eef2f7",color:on?"#fff":"#344054",flex:1});
  const modes:{k:Mode;t:string;d:string}[]=[{k:"simple",t:"Простий",d:"тільки головне"},{k:"standard",t:"Стандартний",d:"як зараз"},{k:"full",t:"Повний",d:"усе"}];
  const move=(t:Tab,dir:-1|1)=>{const a=[...ui.tabs];const i=a.indexOf(t);const j=i+dir;if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];onSave({...ui,tabs:a})};
  const toggleTab=(t:Tab)=>{if(t==="prices"||t==="home")return;onSave({...ui,tabs:ui.tabs.includes(t)?ui.tabs.filter(x=>x!==t):[...ui.tabs.filter(x=>x!=="prices"),t,"prices"]})};
  return <div style={{marginTop:20}}>
    <h2>🌐 Мова / Language</h2>
    <div style={{display:"flex",gap:6}}>
      <button data-notr onClick={()=>{if(ui.lang!=="uk"){onSave({...ui,lang:"uk"});setTimeout(()=>location.reload(),300)}}} style={pill(ui.lang==="uk")}>🇺🇦 Українська</button>
      <button data-notr onClick={()=>onSave({...ui,lang:"en"})} style={pill(ui.lang==="en")}>🇺🇸 English</button>
    </div>
    {isAdmin&&<button className="secondary" onClick={buildTr} disabled={!!tb} style={{marginTop:8,padding:"8px 12px",fontSize:13}}>{tb||"🔄 Оновити англійський переклад (адмін)"}</button>}

    <h2 style={{marginTop:20}}>🎨 Стиль</h2>
    <div style={{display:"flex",gap:6}}>
      <button onClick={()=>{if(ui.theme!=="classic"){onSave({...ui,theme:"classic"});setTimeout(()=>location.reload(),300)}}} style={pill(ui.theme!=="business")}>Класичний<small style={{display:"block",fontWeight:500,opacity:.8}}>яскравий, з емодзі</small></button>
      <button onClick={()=>onSave({...ui,theme:"business"})} style={pill(ui.theme==="business")}>Бізнес<small style={{display:"block",fontWeight:500,opacity:.8}}>строгий, як Jobber</small></button>
    </div>

    <h2 style={{marginTop:20}}>🎨 Вигляд програми</h2>
    <p className="muted" style={{fontSize:14}}>Режим швидко ставить готовий набір. Далі можна підправити все вручну нижче.</p>
    <div style={{display:"flex",gap:6}}>{modes.map(m=><button key={m.k} onClick={()=>onSave({...PRESETS[m.k],text:ui.text,lang:ui.lang,onboarded:ui.onboarded,theme:ui.theme})} style={pill(ui.mode===m.k)}>{m.t}<small style={{display:"block",fontWeight:500,opacity:.8}}>{m.d}</small></button>)}</div>

    <h3 style={{marginTop:16}}>Що показувати на головній</h3>
    <div style={{display:"grid",gap:4}}>{HOME_BLOCKS.map(b=><label key={b.k} style={{display:"flex",gap:10,alignItems:"center",fontSize:15,fontWeight:500,padding:"6px 0"}}>
      <input type="checkbox" checked={!!ui.home[b.k]} onChange={e=>onSave({...ui,home:{...ui.home,[b.k]:e.target.checked}})} style={{width:22,height:22,flex:"none"}}/>{b.label}</label>)}</div>

    <h3 style={{marginTop:16}}>Нижнє меню</h3>
    <p className="muted" style={{fontSize:13,margin:"0 0 6px"}}>Галочка — показувати; стрілки — порядок. Home і Prices (тут налаштування) лишаються завжди.</p>
    <div style={{display:"grid",gap:6}}>
      {[...ui.tabs,...TABS.map(t=>t.k).filter(k=>!ui.tabs.includes(k))].map(k=>{const t=TABS.find(x=>x.k===k)!;const on=ui.tabs.includes(k);const fixed=k==="prices"||k==="home";
        return <div key={k} style={{display:"flex",gap:8,alignItems:"center",padding:"6px 10px",borderRadius:12,background:on?"#f8fafc":"#fff",border:"1px solid #eaecf0",opacity:on?1:.6}}>
          <input type="checkbox" checked={on} disabled={fixed} onChange={()=>toggleTab(k)} style={{width:22,height:22,flex:"none"}}/>
          <span style={{flex:1,fontWeight:700}}>{t.icon} {t.label}</span>
          {on&&<><button className="secondary" onClick={()=>move(k,-1)} style={{padding:"4px 10px"}}>↑</button><button className="secondary" onClick={()=>move(k,1)} style={{padding:"4px 10px"}}>↓</button></>}
        </div>})}
    </div>

    <h3 style={{marginTop:16}}>Розмір тексту</h3>
    <div style={{display:"flex",gap:6}}>
      <button onClick={()=>onSave({...ui,text:"normal"})} style={pill(ui.text==="normal")}>Звичайний</button>
      <button onClick={()=>onSave({...ui,text:"large"})} style={{...pill(ui.text==="large"),fontSize:17}}>Великий</button>
    </div>
  </div>;
}
