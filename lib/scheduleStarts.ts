"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "./supabase";
import type {Statement} from "./statement";

// Дата початку з «📅 Графік робіт» для кожного розрахунку (за sid або за іменем клієнта).
// Якщо початок у майбутньому — проєкт «Заплановано», а не «В роботі».
type J={client?:string;start?:string;sid?:string;days?:number;sat?:boolean;worker?:string};
export const todayISO=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"America/Chicago"});
const n=(s?:string)=>String(s||"").trim().toLowerCase();

export function useScheduleJobs(user:User|null){
  const [jobs,setJobs]=useState<J[]>([]);
  useEffect(()=>{
    if(!user)return;
    const load=()=>supabase.from("user_settings").select("schedule").eq("user_id",user.id).maybeSingle().then(({data}:{data:any})=>setJobs(Array.isArray(data?.schedule)?data.schedule:[]));
    load();
    window.addEventListener("qc-schedule-changed",load);window.addEventListener("qc-sync",load);
    return()=>{window.removeEventListener("qc-schedule-changed",load);window.removeEventListener("qc-sync",load)};
  },[user]);
  return jobs;
}

/** Найближчий початок у майбутньому для цього розрахунку (або ""). */
export function upcomingStart(s:Statement,jobs:J[],list:Statement[]){
  const t=todayISO();
  const mine=jobs.filter(j=>j.start&&j.start>t&&(j.sid?j.sid===s.id:n(j.client)===n(s.client)&&list.filter(x=>!x.own&&n(x.client)===n(s.client)).length===1));
  return mine.map(j=>j.start!).sort()[0]||"";
}
const pad=(x:number)=>String(x).padStart(2,"0");const isoD=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
/** робочі дні роботи: без неділь (і без субот, якщо sat=false) */
export function jobDates(j:J):string[]{
  if(!j.start)return [];const out:string[]=[];const d=new Date(j.start+"T12:00:00");let g=0;const need=Math.max(1,Math.ceil(Number(j.days)||1));
  while(out.length<need&&g++<400){const w=d.getDay();if(w!==0&&(j.sat||w!==6))out.push(isoD(d));d.setDate(d.getDate()+1)}
  return out;
}
/** найближчий мій вільний робочий день (роботи помічників мої дні не займають) */
export function nextFreeDay(jobs:J[]):string{
  const mine=new Set<string>();for(const j of jobs)if(!j.worker||/^\s*(я|me)\s*$/i.test(j.worker))for(const d of jobDates(j))mine.add(d);
  const d=new Date(todayISO()+"T12:00:00");
  for(let i=0;i<200;i++){const k=isoD(d);if(d.getDay()!==0&&d.getDay()!==6&&!mine.has(k))return k;d.setDate(d.getDate()+1)}
  return "";
}
export const shortDate=(iso:string)=>{const d=new Date(iso+"T12:00:00");return d.toLocaleDateString("uk-UA",{weekday:"short",day:"numeric",month:"short"})};
