"use client";
import {useEffect,useState} from "react";

// Фото (чек, фото роботи) відкривається поверх сторінки з кнопкою «Закрити», а не в новій вкладці:
// у застосунку на iPhone з окремої вкладки нема як повернутись.
export default function PhotoLightbox(){
  const [src,setSrc]=useState("");
  useEffect(()=>{
    const onClick=(e:MouseEvent)=>{
      const a=(e.target as HTMLElement|null)?.closest?.("a");
      if(!a||!a.querySelector("img"))return;
      const href=a.getAttribute("href")||"";
      const img=a.querySelector("img") as HTMLImageElement;
      // лише посилання-картинки: мініатюра веде на те саме фото (сховище, data:, blob:)
      const isPhoto=/^(data:image|blob:)/.test(href)||/\/storage\/v1\/object\//.test(href)||href===img.getAttribute("src")||/\.(jpe?g|png|webp|heic)(\?|$)/i.test(href);
      if(!isPhoto)return;
      e.preventDefault();e.stopPropagation();setSrc(href);
    };
    document.addEventListener("click",onClick,true);
    return()=>document.removeEventListener("click",onClick,true);
  },[]);
  useEffect(()=>{
    if(!src)return;
    const k=(e:KeyboardEvent)=>{if(e.key==="Escape")setSrc("")};
    window.addEventListener("keydown",k);const prev=document.body.style.overflow;document.body.style.overflow="hidden";
    return()=>{window.removeEventListener("keydown",k);document.body.style.overflow=prev};
  },[src]);
  if(!src)return null;
  return <div className="noPrint" style={{position:"fixed",inset:0,zIndex:5000,background:"#000",display:"flex",flexDirection:"column"}}>
    <div style={{flex:1,overflow:"auto",WebkitOverflowScrolling:"touch",display:"flex",alignItems:"flex-start",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)setSrc("")}}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={{width:"100%",height:"auto",display:"block",touchAction:"pinch-zoom pan-x pan-y"}}/>
    </div>
    <button onClick={()=>setSrc("")} aria-label="Close" style={{position:"fixed",top:"calc(10px + env(safe-area-inset-top))",right:12,zIndex:5001,width:46,height:46,borderRadius:23,background:"rgba(255,255,255,.95)",color:"#101828",fontSize:24,fontWeight:700,lineHeight:"46px",padding:0,boxShadow:"0 2px 10px rgba(0,0,0,.4)"}}>×</button>
    <button onClick={()=>setSrc("")} style={{margin:0,borderRadius:0,padding:"16px 12px calc(16px + env(safe-area-inset-bottom))",background:"#2563eb",color:"#fff",fontSize:17,fontWeight:700}}>← Назад</button>
  </div>;
}
