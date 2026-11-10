"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {EMPTY_COMPANY,cleanCompany,setCompany,type Company} from "@/lib/company";

// ⚙ Налаштування → 🏢 Профіль компанії: назва, ім'я для підпису, контакти, ліцензія, логотип.
// Це бачать клієнти: естімейти, рахунки, PDF, повідомлення, сторінка помічника.
async function shrinkLogo(file:File):Promise<string>{
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise<HTMLImageElement>((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url});
    const sc=Math.min(1,400/Math.max(img.width,img.height));const c=document.createElement("canvas");
    c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);c.getContext("2d")!.drawImage(img,0,0,c.width,c.height);
    return c.toDataURL(file.type==="image/png"?"image/png":"image/jpeg",0.9);
  }finally{URL.revokeObjectURL(url)}
}

export default function CompanyProfile({user,onChange}:{user:User|null;onChange?:(c:Company)=>void}){
  const [c,setC]=useState<Company>(EMPTY_COMPANY);
  const [saved,setSaved]=useState<Company>(EMPTY_COMPANY);
  const [msg,setMsg]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{if(!user)return;
    supabase.from("user_settings").select("company").eq("user_id",user.id).maybeSingle().then(({data}:{data:any})=>{const v=cleanCompany(data?.company);setC(v);setSaved(v)});
  },[user]);
  const set=(x:Partial<Company>)=>setC(v=>({...v,...x}));
  const dirty=JSON.stringify(c)!==JSON.stringify(saved);
  async function save(){
    if(!user)return;setBusy(true);setMsg("");
    const v=cleanCompany(c);
    const {error}=await supabase.from("user_settings").upsert({user_id:user.id,company:v,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    setBusy(false);
    if(error){setMsg("Не вдалося зберегти: "+error.message);return}
    setSaved(v);setCompany(v);onChange?.(v);setMsg("Збережено ✓ Нові естімейти й рахунки підуть з цими даними.");
  }
  if(!user)return null;
  const f=(k:keyof Company,label:string,ph:string,type="text")=><label>{label}<input type={type} value={c[k]} placeholder={ph} onChange={e=>set({[k]:e.target.value} as Partial<Company>)}/></label>;
  return <div style={{marginTop:20}}>
    <h2>🏢 Профіль компанії</h2>
    <p className="muted" style={{fontSize:14}}>Це бачать клієнти: естімейти, рахунки, PDF, повідомлення.</p>
    {!saved.name&&<p style={{fontSize:14,padding:10,borderRadius:10,background:"#fffaeb",color:"#b54708"}}>Заповніть назву компанії — без неї клієнт бачить «Your Company».</p>}
    <div className="grid">
      {f("name","Назва компанії","ABC Remodeling LLC")}
      {f("owner","Ваше ім'я (підпис у повідомленнях)","John")}
      {f("phone","Телефон","(555) 123-4567","tel")}
      {f("email","Email","you@company.com","email")}
      {f("license","Ліцензія / Insurance (необов'язково)","License #12345")}
      {f("website","Сайт (необов'язково)","www.company.com")}
      <label className="wide">💳 Бізнес-картки (останні 4 цифри)<input value={c.cards} placeholder="7416, 8295" inputMode="numeric" onChange={e=>set({cards:e.target.value})}/>
        <small className="muted">Чеки, оплачені цими картками, — твої. Якщо помічник платив іншою карткою, програма запише, що ці гроші треба йому повернути.</small></label>
      <label className="wide">⭐ Посилання на відгук у Google<input value={c.review} placeholder="https://g.page/r/…/review" onChange={e=>set({review:e.target.value.trim()})}/>
        <small className="muted">Google Business Profile → «Ask for reviews» / «Попросити відгуки» → скопіюйте посилання. Програма підставить його в SMS клієнту після завершення роботи.</small></label>
      <label className="wide">Адреса (необов'язково)<input value={c.address} placeholder="City, State" onChange={e=>set({address:e.target.value})}/></label>
    </div>
    <div style={{display:"flex",gap:12,alignItems:"center",marginTop:10}}>
      {c.logo?<img src={c.logo} alt="logo" style={{height:56,maxWidth:180,objectFit:"contain",border:"1px solid #eaecf0",borderRadius:8,padding:4,background:"#fff"}}/>:<span className="muted" style={{fontSize:14}}>Логотип не додано</span>}
      <label className="secondary" style={{padding:"10px 14px",borderRadius:13,fontWeight:800,cursor:"pointer",background:"#eef2f7",color:"#344054",fontSize:14}}>
        {c.logo?"Змінити логотип":"＋ Логотип"}
        <input type="file" accept="image/*" hidden onChange={async e=>{const fl=e.target.files?.[0];e.target.value="";if(fl){try{set({logo:await shrinkLogo(fl)})}catch{setMsg("Не вдалося прочитати картинку.")}}}}/>
      </label>
      {c.logo&&<button className="secondary" onClick={()=>set({logo:""})} style={{padding:"10px 12px"}}>Прибрати</button>}
    </div>
    <div className="actions" style={{marginTop:10}}><button className="primary" onClick={save} disabled={busy||!dirty}>{busy?"Зберігаю…":"Зберегти профіль"}</button></div>
    {msg&&<p className="muted" style={{fontSize:14}}>{msg}</p>}
  </div>;
}
