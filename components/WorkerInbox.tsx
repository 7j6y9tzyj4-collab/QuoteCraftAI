"use client";
import {useCallback,useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";

// 👷 Що помічник надіслав за посиланням і ще не додано в розрахунки (worker_inbox, applied_at = null).
// Перевіряємо при відкритті, поверненні в програму і щохвилини, поки вона відкрита.
export type InboxSum={total:number;text:string;workers:string[]};
const EMPTY:InboxSum={total:0,text:"",workers:[]};

export function useWorkerInbox(user:User|null){
  const [sum,setSum]=useState<InboxSum>(EMPTY);
  const check=useCallback(async()=>{
    if(!user)return;
    const {data,error}=await supabase.from("worker_inbox").select("worker,kind,payload").eq("user_id",user.id).is("applied_at",null);
    if(error){setSum(EMPTY);return}
    const by:Record<string,{h:number;r:number;p:number}>={};
    for(const it of (data||[]) as any[]){const w=String(it.worker||"Помічник");by[w]||={h:0,r:0,p:0};
      if(it.kind==="hours")by[w].h+=Number(it.payload?.hours)||0;else if(it.kind==="receipt")by[w].r++;else by[w].p++}
    const text=Object.entries(by).map(([w,v])=>`${w}: ${[v.h?`${v.h} год`:"",v.r?`чеків ${v.r}`:"",v.p?`фото ${v.p}`:""].filter(Boolean).join(", ")}`).join(" · ");
    setSum({total:(data||[]).length,text,workers:Object.keys(by)});
  },[user]);
  useEffect(()=>{
    if(!user)return;
    void check();
    const i=setInterval(()=>{if(document.visibilityState==="visible")void check()},60000);
    const on=()=>{if(document.visibilityState==="visible")void check()};
    document.addEventListener("visibilitychange",on);window.addEventListener("focus",on);window.addEventListener("qc-inbox-applied",on);
    return()=>{clearInterval(i);document.removeEventListener("visibilitychange",on);window.removeEventListener("focus",on);window.removeEventListener("qc-inbox-applied",on)};
  },[user,check]);
  return {sum,check};
}

export function WorkerInboxBanner({sum,onOpen}:{sum:InboxSum;onOpen:()=>void}){
  if(!sum.total)return null;
  return <button onClick={onOpen} className="noPrint" style={{width:"100%",textAlign:"left",display:"flex",gap:12,alignItems:"center",background:"#fffaeb",border:"2px solid #fdb022",borderRadius:16,padding:14,marginBottom:13,color:"#101828"}}>
    <span style={{fontSize:26}}>👷</span>
    <span style={{flex:1}}><b style={{display:"block"}}>Нове від помічника</b><small style={{color:"#475467"}}>{sum.text}</small></span>
    <b style={{color:"#175cd3",whiteSpace:"nowrap"}}>Додати →</b>
  </button>;
}
