"use client";
import {isFresh,type Statement} from "@/lib/statement";

// 🆕 Що помічники записали за останні 36 год — із назвою проєкту. Натиснув рядок → відкривається саме той проєкт на потрібній вкладці.
export type FreshTab="crew"|"rec"|"photo";
export type FreshRow={sid:string;tab:FreshTab;text:string;where:string;at:string};
const money=(n:number)=>"$"+(Math.round(n*100)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export function freshRows(list:Statement[]):FreshRow[]{
  const out:FreshRow[]=[];
  for(const s of list){
    const where=s.own?"Мої витрати":`${s.client||"Без імені"}${s.project?` — ${s.project}`:""}`;
    const crew=(id:string)=>(s.crew||[]).find(c=>c.id===id)?.name||"";
    for(const w of (s.workLog||[]).filter(isFresh))out.push({sid:s.id,tab:"crew",where,at:w.at||"",text:`⏱ ${w.by||crew(w.workerId)}: ${w.hours} год за ${w.date}${w.note?` — ${w.note}`:""}`});
    for(const r of (s.receipts||[]).filter(isFresh))out.push({sid:s.id,tab:"rec",where,at:r.at||"",text:`🧾 ${r.by}: чек ${r.store||""} ${money(Number(r.amount)||0)}`});
    for(const p of (s.photos||[]).filter(isFresh))out.push({sid:s.id,tab:"photo",where,at:p.at||"",text:`📸 ${p.by}: фото за ${p.date}`});
  }
  return out.sort((a,b)=>b.at.localeCompare(a.at));
}
const when=(at:string)=>{const d=new Date(at);if(isNaN(d.getTime()))return "";const h=Math.round((Date.now()-d.getTime())/3600e3);return h<1?"щойно":h<24?`${h} год тому`:"вчора"};

export default function HelperFresh({list,onOpen}:{list:Statement[];onOpen:(sid:string,tab:FreshTab)=>void}){
  const rows=freshRows(list);if(!rows.length)return null;
  return <section className="panel noPrint" style={{border:"2px solid #fdb022",background:"#fffcf5"}}>
    <div className="head"><h2 style={{fontSize:17}}>🆕 Записали помічники · {rows.length}</h2></div>
    {rows.map((r,i)=><button key={i} onClick={()=>onOpen(r.sid,r.tab)} style={{display:"flex",gap:10,alignItems:"center",width:"100%",textAlign:"left",background:"transparent",padding:"9px 0",borderTop:i?"1px solid #fedf89":"none",color:"#101828"}}>
      <span style={{flex:1,minWidth:0}}><span data-notr style={{display:"block",fontWeight:600}}>{r.text}</span>
        <small style={{display:"block",color:"#175cd3",fontWeight:700}}>→ <span data-notr>{r.where}</span></small>
        <small className="muted">{when(r.at)}</small></span>
      <b style={{color:"#175cd3",whiteSpace:"nowrap",fontSize:13}}>Відкрити ›</b>
    </button>)}
    <small className="muted">Тримається 36 годин. У проєкті новий запис підсвічений жовтим з позначкою «НОВЕ».</small>
  </section>;
}
