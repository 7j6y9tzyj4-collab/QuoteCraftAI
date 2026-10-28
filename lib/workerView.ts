import {supabaseAdmin} from "./supabaseAdmin";
import type {Statement} from "./statement";
import type {SavedCalc} from "./calcTypes";
import {normDate} from "./receiptBatch";

// Дані для сторінки помічника /w/<token>: тільки його проєкти, без цін клієнта і мого заробітку.
export type WorkerLink={token:string;user_id:string;worker:string;rate:number;projects:string[];revoked:boolean};
export type WorkerDay={date:string;hours:number;note:string;pending:boolean};
export type WorkerProject={sid:string;client:string;project:string;address:string;phone:string;
  scope:{name:string;qty:number;unit:string;note:string;optional:boolean}[];notes:string;
  materials:{name:string;qty:number;unit:string;note:string}[];
  days:WorkerDay[];hours:number;receipts:number;photos:number};
export type WorkerView={worker:string;rate:number;projects:WorkerProject[];hours:number;earned:number;paid:number;owed:number};

const n=(s:string)=>String(s||"").trim().toLowerCase();

export async function loadLink(token:string):Promise<WorkerLink|null>{
  if(!/^[0-9a-f-]{36}$/i.test(token))return null;
  const {data}=await supabaseAdmin.from("worker_links").select("*").eq("token",token).maybeSingle();
  if(!data||data.revoked)return null;
  return data as WorkerLink;
}

export async function workerView(link:WorkerLink):Promise<WorkerView>{
  const uid=link.user_id;
  const [{data:st},{data:calcs},{data:clients},{data:inbox}]=await Promise.all([
    supabaseAdmin.from("user_statements").select("statements").eq("user_id",uid).maybeSingle(),
    supabaseAdmin.from("user_calc_estimates").select("id,data").eq("user_id",uid),
    supabaseAdmin.from("user_clients").select("data").eq("user_id",uid),
    supabaseAdmin.from("worker_inbox").select("sid,kind,payload,created_at").eq("token",link.token).is("applied_at",null),
  ]);
  const list=((st?.statements||[]) as Statement[]);
  const saved=((calcs||[]) as {id:string;data:SavedCalc}[]).map(r=>({...r.data,id:r.id}));
  const cl=((clients||[]) as {data:any}[]).map(r=>r.data||{});
  let hours=0,earned=0,paid=0;
  const projects:WorkerProject[]=[];
  for(const sid of link.projects){
    const s=list.find(x=>x.id===sid);if(!s)continue;
    const calc=saved.find(c=>c.id===s.calcId)||(s.quoteToken?saved.find(c=>c.shareToken===s.quoteToken):undefined)||saved.find(c=>n(c.client)===n(s.client)&&n(c.project)===n(s.project));
    const client=cl.find(c=>n(c.name)===n(s.client));
    const me=(s.crew||[]).find(c=>!c.self&&n(c.name)===n(link.worker));
    const days:WorkerDay[]=[];
    if(me)for(const w of s.workLog||[])if(w.workerId===me.id)days.push({date:normDate(w.date),hours:Number(w.hours)||0,note:w.note||"",pending:false});
    for(const i of (inbox||[]) as any[])if(i.sid===sid&&i.kind==="hours")days.push({date:normDate(i.payload?.date)||String(i.created_at).slice(0,10),hours:Number(i.payload?.hours)||0,note:String(i.payload?.note||""),pending:true});
    days.sort((a,b)=>b.date.localeCompare(a.date));
    const h=days.reduce((a,d)=>a+d.hours,0);
    const rate=me?Number(me.rate)||link.rate:link.rate;
    const p=me?(s.payouts||[]).filter(x=>x.workerId===me.id).reduce((a,x)=>a+(Number(x.amount)||0),0):0;
    hours+=h;earned+=h*rate;paid+=p;
    const items=(calc?.items||[]).filter(i=>!/^OPTION/i.test(i.name));
    projects.push({sid,client:s.client,project:s.project,address:String(client?.address||""),phone:String(client?.phone||""),
      scope:items.map(i=>({name:i.name,qty:Number(i.quantity)||0,unit:i.unit,note:String(i.note||""),optional:!!i.optional})),
      notes:String(calc?.notes||""),
      materials:items.filter(i=>(Number(i.materialRate)||0)>0&&!i.optional).map(i=>({name:i.name,qty:Number(i.quantity)||0,unit:i.unit,note:String(i.note||"")})),
      days,hours:Math.round(h*100)/100,
      receipts:s.receipts.length+((inbox||[]) as any[]).filter(i=>i.sid===sid&&i.kind==="receipt").length,
      photos:(s.photos||[]).length+((inbox||[]) as any[]).filter(i=>i.sid===sid&&i.kind==="photo").length});
  }
  const r2=(x:number)=>Math.round(x*100)/100;
  return {worker:link.worker,rate:link.rate,projects,hours:r2(hours),earned:r2(earned),paid:r2(paid),owed:r2(earned-paid)};
}
