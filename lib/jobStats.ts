import type {Statement} from "./statement";
import {jobRate,statementStatus} from "./statement";
import {kindOf} from "./sanity";

// Завершені роботи з годинами: скільки виходить $/год (робота без чеків ÷ години) — для підказок у калькуляторі.
export function finishedJobs(list:Statement[]){
  return list.filter(s=>!s.own&&statementStatus(s)==="done").map(s=>{
    const r=jobRate(s);
    return {name:`${s.client||"Без імені"}${s.project?` — ${s.project}`:""}`,kind:kindOf(s.project||"",s.labor.map(l=>({name:l.description}))),...r};
  }).filter(j=>j.hours>0&&j.labor>0);
}

export function timeHint(labor:number,project:string,items:{name:string;category?:string}[],list:Statement[]){
  const jobs=finishedJobs(list);
  if(jobs.length<2||labor<=0)return null;
  const tl=jobs.reduce((a,j)=>a+j.labor,0),th=jobs.reduce((a,j)=>a+j.hours,0);
  const avg=Math.round(tl/th*100)/100;
  const hours=Math.round(labor/avg);
  const kind=kindOf(project,items);
  const low=jobs.filter(j=>j.kind===kind&&j.rate<avg*0.8).sort((a,b)=>a.rate-b.rate)[0]||null;
  return {avg,hours,days:Math.max(1,Math.round(hours/9)),count:jobs.length,low};
}
