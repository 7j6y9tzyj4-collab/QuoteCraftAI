"use client";
import {useEffect} from "react";
// iPhone Safari: коли відкрита клавіатура, position:fixed «відривається» і нижня панель пливе по екрану.
// Поки клавіатура відкрита (або поле в фокусі) — ховаємо nav; закрили — панель знову внизу.
export default function KeyboardGuard(){
  useEffect(()=>{
    const vv=window.visualViewport;
    const update=()=>{
      const kb=vv?window.innerHeight-vv.height>120:false;
      const el=document.activeElement as HTMLElement|null;
      const typing=!!el&&/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)&&(el as HTMLInputElement).type!=="checkbox"&&(el as HTMLInputElement).type!=="file";
      document.body.classList.toggle("kb-open",kb||typing);
    };
    vv?.addEventListener("resize",update);vv?.addEventListener("scroll",update);
    document.addEventListener("focusin",update);document.addEventListener("focusout",()=>setTimeout(update,80));
    update();
    return()=>{vv?.removeEventListener("resize",update);vv?.removeEventListener("scroll",update);document.removeEventListener("focusin",update)};
  },[]);
  return null;
}
