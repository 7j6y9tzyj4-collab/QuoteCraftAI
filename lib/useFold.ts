"use client";
import {useEffect,useState} from "react";

// ▸/▾ Згортання блоків у проєкті (чеки, години, оплати…). Стан запам'ятовується на пристрої для всіх проєктів.
const KEY="qc_fold";
let cache:Record<string,boolean>|null=null;
const subs=new Set<()=>void>();
function read(){if(cache)return cache;try{cache=JSON.parse(localStorage.getItem(KEY)||"{}")}catch{cache={}}return cache!}
export function useFold(k:string,defOpen=false){
  const [,force]=useState(0);
  useEffect(()=>{const f=()=>force(x=>x+1);subs.add(f);return()=>{subs.delete(f)}},[]);
  const v=typeof window==="undefined"?defOpen:(read()[k]??defOpen);
  const set=(open:boolean)=>{const c={...read(),[k]:open};cache=c;try{localStorage.setItem(KEY,JSON.stringify(c))}catch{};subs.forEach(f=>f())};
  return [v,()=>set(!v),set] as const;
}
