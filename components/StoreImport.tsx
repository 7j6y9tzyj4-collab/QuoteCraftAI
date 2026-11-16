"use client";
import {useState} from "react";
import {OWN_ID,type Receipt,type Statement} from "@/lib/statement";
import {readTable,parseStoreExport,placeRows,toReceipt,importAmount,type Placed,type ParseResult} from "@/lib/storeImport";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const STORES=["Home Depot","Lowe's","Menards","Floor & Decor","Інший магазин"];

// Оплати → 🏬 Імпорт покупок з магазину: файл Export з Home Depot (Purchase History) / Lowe's / Menards → чеки по проєктах.
export default function StoreImport({list,onAdd}:{list:Statement[];onAdd:(items:{sid:string;r:Receipt}[])=>void}){
  const [open,setOpen]=useState(false);
  const [store,setStore]=useState("Home Depot");
  const [taxPct,setTaxPct]=useState<number>(()=>{try{return Number(localStorage.getItem("qc_import_tax"))||10.25}catch{return 10.25}});
  const [res,setRes]=useState<ParseResult|null>(null);
  const [placed,setPlaced]=useState<Placed[]>([]);
  const [pick,setPick]=useState<Record<string,string>>({});
  const [msg,setMsg]=useState("");
  const projects=list.filter(s=>!s.own);
  async function onFile(f:File|undefined){
    if(!f)return;setMsg("Читаю файл…");setRes(null);
    try{
      const t=await readTable(f);
      const st=/lowe/i.test(f.name)?"Lowe's":/menard/i.test(f.name)?"Menards":store;setStore(st);
      const r=parseStoreExport(t,st);setRes(r);
      const p=placeRows(r.rows,list,taxPct);setPlaced(p);
      const pk:Record<string,string>={};for(const x of p)pk[x.row.key]=x.dup?"skip":x.sid||"";setPick(pk);
      setMsg(r.problem?`⚠ ${r.problem}`:"");
    }catch(e){setMsg("Не вдалося прочитати: "+(e instanceof Error?e.message:String(e)))}
  }
  function retax(v:number){setTaxPct(v);try{localStorage.setItem("qc_import_tax",String(v))}catch{}if(res)setPlaced(placeRows(res.rows,list,v))}
  const ready=placed.filter(p=>pick[p.row.key]&&pick[p.row.key]!=="skip");
  const noPlace=placed.filter(p=>!p.dup&&!pick[p.row.key]);
  function save(){
    const items=ready.map(p=>{const r=toReceipt({...p,amount:importAmount(p.row,taxPct)});return {sid:pick[p.row.key],r:{...r,paidBy:"biz"}}});
    onAdd(items);setMsg(`✓ Додано ${items.length} чек. на ${money(items.reduce((a,x)=>a+x.r.amount,0))}`);setRes(null);setPlaced([]);
  }
  if(!open)return <button className="estimate" onClick={()=>setOpen(true)} style={{background:"#fff7ed"}}>
    <span><b>🏬 Імпорт покупок з магазину</b><small>Файл Export з Home Depot / Lowe&apos;s / Menards → чеки по проєктах, без дублікатів</small></span>
    <span style={{textAlign:"right",alignSelf:"center"}}>›</span>
  </button>;
  return <div className="estimate" style={{background:"#fff7ed",display:"block"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><b>🏬 Імпорт покупок з магазину</b><button className="secondary" style={{padding:"4px 10px"}} onClick={()=>{setOpen(false);setRes(null);setPlaced([]);setMsg("")}}>✕</button></div>
    <small className="muted" style={{display:"block",marginTop:4}}>Home Depot: Мій акаунт → Purchase History → вибери дати → <b>Export</b> (CSV або Excel). Програма збере товари в чеки, знайде проєкт за Job Name / PO і пропустить ті, що вже є.</small>
    <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
      <select value={store} onChange={e=>setStore(e.target.value)} style={{padding:8}}>{STORES.map(s=><option key={s}>{s}</option>)}</select>
      <label className="secondary" style={{padding:"8px 12px",borderRadius:10,cursor:"pointer",fontWeight:700}}>📄 Вибрати файл<input type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{display:"none"}} onChange={e=>{void onFile(e.target.files?.[0]);e.target.value=""}}/></label>
    </div>
    {msg&&<small style={{display:"block",marginTop:6,color:msg.startsWith("✓")?"#067647":"#b54708",fontWeight:700}}>{msg}</small>}
    {res?.problem&&res.headers.length>0&&<small className="muted" style={{display:"block",marginTop:4}}>Колонки у файлі: {res.headers.filter(Boolean).join(" · ")}</small>}
    {res&&!res.problem&&<>
      {!res.hasTax&&<label style={{display:"flex",alignItems:"center",gap:6,marginTop:8,fontSize:13}}>У файлі сума без податку. Податок, %:<input type="number" step="0.01" value={taxPct} onChange={e=>retax(Number(e.target.value)||0)} style={{width:80,padding:6}}/></label>}
      <small className="muted" style={{display:"block",marginTop:6}}>Знайдено {placed.length} чек. · вже є в програмі: {placed.filter(p=>p.dup).length} · нових: {placed.length-placed.filter(p=>p.dup).length}</small>
      <div style={{display:"grid",gap:6,marginTop:8,maxHeight:420,overflow:"auto"}}>
        {placed.map(p=><div key={p.row.key} style={{background:"#fff",borderRadius:10,padding:"6px 8px",fontSize:13,opacity:p.dup&&pick[p.row.key]==="skip"?0.6:1}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8}}><span><b>{p.row.date}</b> · {p.row.store}{p.row.job?<> · <span style={{color:"#175cd3"}}>Job: {p.row.job}</span></>:null}{p.row.card?` · ****${p.row.card}`:""}</span><b style={{color:p.amount<0?"#b54708":undefined}}>{money(p.amount)}</b></div>
          {p.row.items&&<div className="muted" style={{fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.amount<0?"↩ повернення: ":""}{p.row.items}</div>}
          {p.dup&&<div style={{color:"#067647",fontSize:12,fontWeight:700}}>✓ вже є: {p.dup.label}</div>}
          <select value={pick[p.row.key]||""} onChange={e=>setPick(k=>({...k,[p.row.key]:e.target.value}))} style={{width:"100%",marginTop:4,padding:"5px 8px",fontSize:13,borderColor:!pick[p.row.key]?"#f79009":undefined}}>
            <option value="">— куди? —</option>
            <option value="skip">⏭ Пропустити{p.dup?" (вже є)":""}</option>
            {projects.map(s=><option key={s.id} value={s.id}>{s.client||"Без імені"}{s.project?` — ${s.project}`:""}</option>)}
            <option value={OWN_ID}>🧰 Мої витрати</option>
          </select>
          {p.why&&pick[p.row.key]===p.sid&&<small style={{color:"#175cd3"}}>за {p.why}</small>}
        </div>)}
      </div>
      <button className="primary" disabled={!ready.length} onClick={save} style={{width:"100%",marginTop:8}}>Додати {ready.length} чек. · {money(ready.reduce((a,p)=>a+importAmount(p.row,taxPct),0))}{noPlace.length?` (ще ${noPlace.length} без проєкту)`:""}</button>
      <small className="muted" style={{display:"block",marginTop:4}}>Оплату записую як «💼 Бізнес-картка» — якщо платив помічник, зміни в чеку. Фото чеків з файлу нема; їх можна докинути пізніше — програма поєднає за сумою.</small>
    </>}
  </div>;
}
