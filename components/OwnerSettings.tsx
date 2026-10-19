"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";

export type OwnerPrefs={zelle:string;min_job_price:number};
export const EMPTY_PREFS:OwnerPrefs={zelle:"",min_job_price:0};

// Prices → ACCOUNT: Zelle для завдатку (показується клієнту після Accept) і мінімальна ціна роботи.
export default function OwnerSettings({user,onChange}:{user:User|null;onChange?:(p:OwnerPrefs)=>void}){
  const [p,setP]=useState<OwnerPrefs>(EMPTY_PREFS);
  const [saved,setSaved]=useState<OwnerPrefs>(EMPTY_PREFS);
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const [noTable,setNoTable]=useState(false);
  useEffect(()=>{
    if(!user)return;
    supabase.from("user_settings").select("zelle,min_job_price").eq("user_id",user.id).maybeSingle().then(({data,error}:{data:any;error:any})=>{
      if(error){setNoTable(true);return}
      const v:OwnerPrefs={zelle:data?.zelle||"",min_job_price:Number(data?.min_job_price)||0};
      setP(v);setSaved(v);onChange?.(v);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user]);
  const set=(x:Partial<OwnerPrefs>)=>setP(v=>({...v,...x}));
  const dirty=JSON.stringify(p)!==JSON.stringify(saved);
  async function save(){
    if(!user)return;
    setBusy(true);setMsg("");
    const v:OwnerPrefs={zelle:p.zelle.trim(),min_job_price:Math.max(0,Number(p.min_job_price)||0)};
    const {error}=await supabase.from("user_settings").upsert({user_id:user.id,zelle:v.zelle||null,min_job_price:v.min_job_price,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    setBusy(false);
    if(error){setMsg("Не вдалося зберегти: "+error.message);return}
    setP(v);setSaved(v);onChange?.(v);setMsg("Збережено.");
  }
  if(!user)return null;
  if(noTable)return null;
  return <div style={{marginTop:20}}>
    <h2>💵 Завдаток через Zelle</h2>
    <p className="muted" style={{fontSize:14}}>Після «Accept» клієнт побачить суму завдатку і куди скинути на Zelle. Порожнє поле — не показується.</p>
    <label>Zelle (телефон або email)<input value={p.zelle} onChange={e=>set({zelle:e.target.value})} placeholder="(773) 957-7709"/></label>

    <h2 style={{marginTop:20}}>📏 Мінімальна ціна роботи</h2>
    <p className="muted" style={{fontSize:14}}>Якщо естімейт менший — калькулятор попередить і запропонує додати доплату за малу роботу. 0 — вимкнено.</p>
    <label>Мінімум, $<input type="number" min={0} step={50} value={p.min_job_price} onChange={e=>set({min_job_price:Number(e.target.value)})}/></label>

    <div className="actions" style={{marginTop:10}}><button className="primary" onClick={save} disabled={busy||!dirty}>{busy?"Зберігаю…":"Зберегти"}</button></div>
    {msg&&<p className="muted" style={{fontSize:14}}>{msg}</p>}
  </div>;
}
