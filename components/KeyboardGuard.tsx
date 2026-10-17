"use client";
import {useEffect} from "react";
// iPhone Safari: коли відкрита клавіатура, position:fixed «відривається» і нижня панель пливе по екрану.
// Поки курсор у текстовому полі — ховаємо nav; вийшов з поля — панель знову внизу.
export default function KeyboardGuard(){
  useEffect(()=>{
    const isText=(el:Element|null)=>{
      if(!el)return false;
      const t=el.tagName;
      if(t==="TEXTAREA")return true;
      if(t==="INPUT"){const ty=(el as HTMLInputElement).type;return !/^(checkbox|radio|file|button|submit|range|color)$/.test(ty)}
      return (el as HTMLElement).isContentEditable===true;
    };
    const update=()=>document.body.classList.toggle("kb-open",isText(document.activeElement));
    const later=()=>setTimeout(update,100);
    document.addEventListener("focusin",update);
    document.addEventListener("focusout",later);
    window.addEventListener("pageshow",later);
    document.addEventListener("visibilitychange",later);
    update();
    return()=>{document.removeEventListener("focusin",update);document.removeEventListener("focusout",later);window.removeEventListener("pageshow",later);document.removeEventListener("visibilitychange",later)};
  },[]);
  return null;
}
