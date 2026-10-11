"use client";
import {useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {BACKUP_TABLES,photoPathsOf,chicagoDate} from "@/lib/backupTables";

// «Скачати резервну копію»: усі твої дані з акаунта одним JSON-файлом (фото чеків — списком шляхів).
// Щоночі копія робиться й автоматично (сховище Supabase, bucket backups, 30 днів).
export default function BackupPanel({user}:{user:User|null}){
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  async function download(){
    if(!user){setMsg("Спершу увійди в акаунт.");return}
    setBusy(true);setMsg("");
    try{
      const tables:Record<string,any[]>={};const counts:Record<string,number>={};const skipped:string[]=[];
      for(const t of BACKUP_TABLES){
        const {data,error}=await supabase.from(t).select("*").eq("user_id",user.id).limit(5000);
        if(error){skipped.push(t);continue}
        tables[t]=data||[];counts[t]=(data||[]).length;
      }
      const day=chicagoDate();
      const out={app:"QuoteCraft",version:1,user_id:user.id,email:user.email||"",exported_at:new Date().toISOString(),date:day,manual:true,counts,skipped,receipt_photos:photoPathsOf(tables),tables};
      const blob=new Blob([JSON.stringify(out,null,1)],{type:"application/json"});
      const url=URL.createObjectURL(blob);const a=document.createElement("a");
      a.href=url;a.download=`QuoteCraft backup ${day}.json`;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
      const est=(counts.user_calc_estimates||0)+(counts.estimates||0);
      const st=(tables.user_statements?.[0]?.statements||[]).length;
      setMsg(`Готово: естімейтів ${est}, розрахунків ${st}, фото чеків ${out.receipt_photos.length} (списком).`+(skipped.length?` Пропущено: ${skipped.join(", ")}.`:""));
    }catch(e){setMsg("Не вдалося: "+(e instanceof Error?e.message:String(e)))}
    finally{setBusy(false)}
  }
  return <div style={{marginBottom:20}}>
    <h2>Резервна копія</h2>
    <p className="muted" style={{fontSize:14}}>Щоночі копія робиться автоматично (30 днів). Тут — скачати свіжу копію собі (ціни, естімейти, Оплати, посилання, шаблони). Відновлення — тільки вручну.</p>
    <button className="secondary full" disabled={busy} onClick={download}>{busy?"Збираю…":"⬇ Скачати резервну копію"}</button>
    {msg&&<p className="muted" style={{marginTop:6}}>{msg}</p>}
  </div>;
}
