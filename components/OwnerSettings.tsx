"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";

export type OwnerPrefs={telegram_bot_token:string;telegram_chat_id:string;stripe_secret_key:string;min_job_price:number;remind_days:number};
export const EMPTY_PREFS:OwnerPrefs={telegram_bot_token:"",telegram_chat_id:"",stripe_secret_key:"",min_job_price:0,remind_days:3};

// Prices → ACCOUNT: Telegram-сповіщення, оплата завдатку карткою (Stripe), мінімальна ціна роботи.
export default function OwnerSettings({user,onChange}:{user:User|null;onChange?:(p:OwnerPrefs)=>void}){
  const [p,setP]=useState<OwnerPrefs>(EMPTY_PREFS);
  const [saved,setSaved]=useState<OwnerPrefs>(EMPTY_PREFS);
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const [chats,setChats]=useState<{id:string;name:string}[]|null>(null);
  const [noTable,setNoTable]=useState(false);
  useEffect(()=>{
    if(!user)return;
    supabase.from("user_settings").select("*").eq("user_id",user.id).maybeSingle().then(({data,error}:{data:any;error:any})=>{
      if(error){setNoTable(true);return}
      const v={...EMPTY_PREFS,...Object.fromEntries(Object.entries(data||{}).filter(([,x])=>x!==null))} as OwnerPrefs;
      setP(v);setSaved(v);onChange?.(v);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user]);
  const set=(x:Partial<OwnerPrefs>)=>setP(v=>({...v,...x}));
  const dirty=JSON.stringify(p)!==JSON.stringify(saved);
  async function save(){
    if(!user)return;
    setBusy(true);setMsg("");
    const row={user_id:user.id,telegram_bot_token:p.telegram_bot_token.trim()||null,telegram_chat_id:p.telegram_chat_id.trim()||null,
      stripe_secret_key:p.stripe_secret_key.trim()||null,min_job_price:Math.max(0,Number(p.min_job_price)||0),remind_days:Math.max(1,Math.round(Number(p.remind_days)||3)),updated_at:new Date().toISOString()};
    if(row.stripe_secret_key&&!/^(sk|rk)_(live|test)_/.test(row.stripe_secret_key)){setBusy(false);setMsg("Stripe ключ має починатися з sk_live_ / sk_test_ (або rk_…).");return}
    const {error}=await supabase.from("user_settings").upsert(row,{onConflict:"user_id"});
    setBusy(false);
    if(error){setMsg("Не вдалося зберегти: "+error.message);return}
    setSaved(p);onChange?.(p);setMsg("Збережено.");
  }
  async function api(body:object){
    const {data:{session}}=await supabase.auth.getSession();
    const r=await fetch("/api/notify-test",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||""}`},body:JSON.stringify(body)});
    const d=await r.json();if(!r.ok)throw new Error(d?.error||"Помилка");return d;
  }
  async function findChat(){
    setMsg("");setChats(null);
    try{const d=await api({action:"find_chat",bot_token:p.telegram_bot_token.trim()});
      if(!d.chats.length){setMsg("Не бачу повідомлень. Відкрий свого бота в Telegram, натисни Start (або напиши йому будь-що) і натисни ще раз.");return}
      if(d.chats.length===1){set({telegram_chat_id:d.chats[0].id});setMsg(`Знайшов: ${d.chats[0].name}. Натисни «Зберегти».`)}else setChats(d.chats);
    }catch(e){setMsg(e instanceof Error?e.message:String(e))}
  }
  async function test(){setMsg("");try{await api({action:"test"});setMsg("Надіслав тест — перевір Telegram.")}catch(e){setMsg(e instanceof Error?e.message:String(e))}}
  if(!user)return null;
  if(noTable)return <div style={{marginTop:20}}><h2>Сповіщення й оплата</h2><p className="muted">Потрібна таблиця user_settings у Supabase (SQL від Claude).</p></div>;
  return <div style={{marginTop:20}}>
    <h2>🔔 Сповіщення в Telegram</h2>
    <p className="muted" style={{fontSize:14}}>Прийде, коли клієнт відкрив або прийняв естімейт, оплатив завдаток, нова заявка з сайту, і нагадування, якщо клієнт не відкривав кілька днів.
      <br/>1) У Telegram відкрий <b>@BotFather</b> → /newbot → скопіюй токен сюди. 2) Відкрий свого нового бота й натисни Start. 3) «Знайти мій chat id» → «Зберегти» → «Тест».</p>
    <label>Токен бота<input value={p.telegram_bot_token} onChange={e=>set({telegram_bot_token:e.target.value})} placeholder="123456789:AA…" autoComplete="off"/></label>
    <label>Chat id<input value={p.telegram_chat_id} onChange={e=>set({telegram_chat_id:e.target.value})} placeholder="натисни «Знайти»" inputMode="numeric"/></label>
    {chats&&<div className="actions" style={{flexWrap:"wrap"}}>{chats.map(c=><button key={c.id} className="secondary" onClick={()=>{set({telegram_chat_id:c.id});setChats(null)}}>{c.name||c.id}</button>)}</div>}
    <label>Нагадати, якщо клієнт не відкрив за (днів)<input type="number" min={1} max={14} value={p.remind_days} onChange={e=>set({remind_days:Number(e.target.value)})}/></label>
    <div className="actions" style={{flexWrap:"wrap"}}>
      <button className="secondary" onClick={findChat} disabled={!p.telegram_bot_token.trim()}>Знайти мій chat id</button>
      <button className="secondary" onClick={test} disabled={dirty||!saved.telegram_chat_id}>Тест</button>
    </div>

    <h2 style={{marginTop:20}}>💳 Завдаток карткою (Stripe)</h2>
    <p className="muted" style={{fontSize:14}}>Після «Accept» клієнт побачить кнопку «Pay deposit». Гроші йдуть на твій рахунок Stripe (комісія Stripe ~2.9% + 30¢). Ключ: dashboard.stripe.com → Developers → API keys → Secret key. Порожнє поле — кнопки оплати не буде.</p>
    <label>Stripe secret key<input type="password" value={p.stripe_secret_key} onChange={e=>set({stripe_secret_key:e.target.value})} placeholder="sk_live_…" autoComplete="off"/></label>

    <h2 style={{marginTop:20}}>📏 Мінімальна ціна роботи</h2>
    <p className="muted" style={{fontSize:14}}>Якщо естімейт менший — калькулятор попередить і запропонує додати доплату за малу роботу. 0 — вимкнено.</p>
    <label>Мінімум, $<input type="number" min={0} step={50} value={p.min_job_price} onChange={e=>set({min_job_price:Number(e.target.value)})}/></label>

    <div className="actions" style={{marginTop:10}}><button className="primary" onClick={save} disabled={busy||!dirty}>{busy?"Зберігаю…":"Зберегти налаштування"}</button></div>
    {msg&&<p className="muted" style={{fontSize:14}}>{msg}</p>}
  </div>;
}
