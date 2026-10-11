"use client";
import {useEffect,useRef,useState} from "react";

// Кнопка «🔄 Оновити» в шапці: перезавантажує програму (значок на екрані iPhone не має кнопки оновлення).
// Коли на сайті з'явилась нова версія — кнопка стає зеленою «Нова версія».
export default function UpdateButton(){
  const first=useRef<string|null>(null);
  const [fresh,setFresh]=useState(false);
  useEffect(()=>{
    let on=true;
    const check=async()=>{
      try{
        const r=await fetch("/api/version",{cache:"no-store"});
        const {v}=await r.json();
        if(!on||!v)return;
        if(first.current===null)first.current=v;
        else if(v!==first.current)setFresh(true);
      }catch{/* офлайн — пропускаємо */}
    };
    check();
    const onVis=()=>{if(document.visibilityState==="visible")check()};
    document.addEventListener("visibilitychange",onVis);
    const t=setInterval(check,5*60*1000);
    return()=>{on=false;document.removeEventListener("visibilitychange",onVis);clearInterval(t)};
  },[]);
  return <button onClick={()=>window.location.reload()} title="Оновити програму"
    style={{borderRadius:13,padding:"10px 12px",fontWeight:800,background:fresh?"#12b76a":"#2f6df6",color:"#fff",whiteSpace:"nowrap"}}>
    🔄 {fresh?"Нова версія":"Оновити"}
  </button>;
}
