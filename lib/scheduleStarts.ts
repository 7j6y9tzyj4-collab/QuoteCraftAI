"use client";
import {useEffect,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "./supabase";
import type {Statement} from "./statement";

// Дата початку з «📅 Графік робіт» для кожного розрахунку (за sid або за іменем клієнта).
// Якщо початок у майбутньому — проєкт «Заплановано», а не «В роботі».
type J={client?:string;start?:string;sid?:string};
export const todayISO=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"America/Chicago"});
const n=(s?:string)=>String(s||"").trim().toLowerCase();

export function useScheduleJobs(user:User|null){
  const [jobs,setJobs]=useState<J[]>([]);
  useEffect(()=>{
    if(!user)return;
    const load=()=>supabase.from("user_settings").select("schedule").eq("user_id",user.id).maybeSingle().then(({data}:{data:any})=>setJobs(Array.isArray(data?.schedule)?data.schedule:[]));
    load();
    window.addEventListener("qc-schedule-changed",load);
    return()=>window.removeEventListener("qc-schedule-changed",load);
  },[user]);
  return jobs;
}

/** Найближчий початок у майбутньому для цього розрахунку (або ""). */
export function upcomingStart(s:Statement,jobs:J[],list:Statement[]){
  const t=todayISO();
  const mine=jobs.filter(j=>j.start&&j.start>t&&(j.sid?j.sid===s.id:n(j.client)===n(s.client)&&list.filter(x=>!x.own&&n(x.client)===n(s.client)).length===1));
  return mine.map(j=>j.start!).sort()[0]||"";
}
export const shortDate=(iso:string)=>{const d=new Date(iso+"T12:00:00");return d.toLocaleDateString("uk-UA",{weekday:"short",day:"numeric",month:"short"})};
