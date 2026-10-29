"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {mailScript} from "@/lib/mailScript";

// Prices → 📧 Чеки з пошти: ключ + скрипт для script.google.com (один раз).
export default function MailReceiptsSetup({user}:{user:User|null}){
  const [key,setKey]=useState("");
  const [open,setOpen]=useState(false);
  const [msg,setMsg]=useState("");
  const [count,setCount]=useState<number|null>(null);
  useEffect(()=>{if(!user)return;
    supabase.from("user_settings").select("mail_key").eq("user_id",user.id).maybeSingle().then(({data}:{data:any})=>setKey(data?.mail_key||""));
    supabase.from("mail_receipts").select("id",{count:"exact",head:true}).eq("user_id",user.id).then(({count}:{count:number|null})=>setCount(count));
  },[user]);
  async function ensureKey(){
    if(key)return key;
    const k=crypto.randomUUID();
    const {error}=await supabase.from("user_settings").upsert({user_id:user!.id,mail_key:k,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    if(error){setMsg("Не вдалося: "+error.message);return ""}
    setKey(k);return k;
  }
  async function copy(){
    const k=await ensureKey();if(!k)return;
    const text=mailScript(k,location.origin);
    try{await navigator.clipboard.writeText(text);setMsg("Скрипт скопійовано ✓")}catch{setOpen(true);setMsg("Виділи текст нижче і скопіюй.")}
    setOpen(true);
  }
  if(!user)return null;
  return <div style={{marginTop:20}}>
    <h2>📧 Чеки з пошти</h2>
    <p className="muted" style={{fontSize:14}}>Чеки Home Depot, Menards, Floor &amp; Decor, Lowe&apos;s з твого Gmail самі потрапляють в Оплати: за назвою роботи на чеку, за графіком робіт або AI; незрозумілі — у «Розібрати».{count?` Уже прийшло: ${count}.`:""}</p>
    <div className="actions"><button className="primary" onClick={copy}>{key?"📋 Скопіювати скрипт ще раз":"📋 Підключити: скопіювати скрипт"}</button></div>
    {msg&&<p className="muted" style={{fontSize:14}}>{msg}</p>}
    {open&&key&&<>
      <ol style={{fontSize:14,lineHeight:1.6,paddingLeft:20}}>
        <li>На комп&apos;ютері відкрий <b>script.google.com</b> (той самий Google, де пошта) → <b>New project</b>.</li>
        <li>Видали все в редакторі, встав скрипт (⌘V) → 💾 Save.</li>
        <li>Зверху вибери функцію <b>setup</b> → <b>▶ Run</b> → Review permissions → свій акаунт → Advanced → Go to project → <b>Allow</b>.</li>
        <li>Готово: нові чеки йтимуть кожні 15 хв. Перевіряються листи за останні 3 дні.</li>
      </ol>
      <textarea readOnly value={mailScript(key,location.origin)} style={{fontFamily:"ui-monospace,monospace",fontSize:11,minHeight:160}} onFocus={e=>e.currentTarget.select()}/>
    </>}
  </div>;
}
