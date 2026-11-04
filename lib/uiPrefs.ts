"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "./supabase";

// ⚙ Налаштування → Вигляд: режим, блоки головної, нижнє меню, розмір тексту.
// Зберігається на пристрої (миттєво) і в user_settings.ui (щоб було однаково на всіх пристроях).
export type HomeBlock="hero"|"inbox"|"push"|"leads"|"awaiting"|"translator"|"due"|"metrics"|"recent";
export type Tab="home"|"calc"|"saved"|"pay"|"clients"|"prices";
export type Mode="simple"|"standard"|"full";
export type UiPrefs={mode:Mode;home:Record<HomeBlock,boolean>;tabs:Tab[];text:"normal"|"large";lang:"uk"|"en";onboarded?:boolean};

export const HOME_BLOCKS:{k:HomeBlock;label:string}[]=[
  {k:"hero",label:"＋ Новий естімейт (великий блок)"},
  {k:"inbox",label:"👷 Нове від помічника / чеки з пошти"},
  {k:"push",label:"🔔 Нагадування увімкнути сповіщення"},
  {k:"leads",label:"📥 Заявки з сайту"},
  {k:"awaiting",label:"⏳ Чекають відповіді"},
  {k:"translator",label:"🎧 Перекладач"},
  {k:"due",label:"💵 Чекають оплати"},
  {k:"metrics",label:"📊 Кількість і сума естімейтів"},
  {k:"recent",label:"🕘 Останні естімейти"},
];
export const TABS:{k:Tab;icon:string;label:string}[]=[
  {k:"home",icon:"⌂",label:"Home"},{k:"calc",icon:"🧮",label:"Calculator"},{k:"saved",icon:"▣",label:"Estimates"},
  {k:"pay",icon:"$",label:"Оплати"},{k:"clients",icon:"👤",label:"Клієнти"},{k:"prices",icon:"⚙",label:"Prices"},
];
const all=(v:boolean)=>Object.fromEntries(HOME_BLOCKS.map(b=>[b.k,v])) as Record<HomeBlock,boolean>;
export const PRESETS:Record<Mode,Omit<UiPrefs,"text"|"lang"|"onboarded">>={
  simple:{mode:"simple",home:{...all(false),hero:true,inbox:true,awaiting:true,due:true},tabs:["home","calc","pay","clients","prices"]},
  standard:{mode:"standard",home:all(true),tabs:["home","calc","saved","pay","clients","prices"]},
  full:{mode:"full",home:all(true),tabs:["home","calc","saved","pay","clients","prices"]},
};
export const DEFAULT_UI:UiPrefs={...PRESETS.standard,text:"normal",lang:"uk"};
const KEY="qc_ui";

function clean(x:any):UiPrefs{
  const base=PRESETS[(x?.mode as Mode)]||PRESETS.standard;
  const home={...base.home,...(x?.home||{})};
  let tabs=(Array.isArray(x?.tabs)?x.tabs:base.tabs).filter((t:any)=>TABS.some(T=>T.k===t)) as Tab[];
  if(!tabs.includes("prices"))tabs=[...tabs,"prices"]; // там налаштування — прибирати не можна
  if(!tabs.includes("home"))tabs=["home",...tabs];
  return {mode:base.mode,home,tabs:[...new Set(tabs)],text:x?.text==="large"?"large":"normal",lang:x?.lang==="en"?"en":"uk",onboarded:!!x?.onboarded};
}

export function useUiPrefs(user:User|null){
  const [ui,setUi]=useState<UiPrefs>(DEFAULT_UI);
  useEffect(()=>{try{const v=localStorage.getItem(KEY);if(v)setUi(clean(JSON.parse(v)))}catch{}},[]);
  useEffect(()=>{if(!user)return;
    supabase.from("user_settings").select("ui").eq("user_id",user.id).maybeSingle().then(({data}:{data:any})=>{
      if(data?.ui){const v=clean(data.ui);setUi(v);try{localStorage.setItem(KEY,JSON.stringify(v))}catch{}}
    });
  },[user]);
  function save(next:UiPrefs){
    const v=clean(next);setUi(v);
    try{localStorage.setItem(KEY,JSON.stringify(v))}catch{}
    if(user)supabase.from("user_settings").upsert({user_id:user.id,ui:v,updated_at:new Date().toISOString()},{onConflict:"user_id"}).then(()=>{});
  }
  return {ui,save};
}
