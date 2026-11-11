import {supabaseAdmin} from "./supabaseAdmin";
import type {Statement} from "./statement";
import type {SavedCalc} from "./calcTypes";
import {normDate} from "./receiptBatch";

// Дані для сторінки помічника /w/<token>: тільки його проєкти, без цін клієнта і мого заробітку.
export type WorkerLink={token:string;user_id:string;worker:string;rate:number;projects:string[];revoked:boolean};
export type WorkerDay={date:string;hours:number;note:string;pending:boolean};
export type WorkerProject={sid:string;client:string;project:string;address:string;phone:string;
  scope:{name:string;qty:number;unit:string;note:string;optional:boolean}[];notes:string;
  myReceipts:{id:string;date:string;store:string;amount:number;pending:boolean;mine:boolean;card:string;items:string;photo:boolean;payer:"mine"|"biz"|"none"}[];reimb:number;
  materials:{name:string;qty:number;unit:string;note:string}[];
  days:WorkerDay[];hours:number;receipts:number;photos:number};
export type WorkerView={company:string;worker:string;rate:number;projects:WorkerProject[];hours:number;earned:number;paid:number;reimb:number;owed:number;
  /** головна помічника: цей тиждень, де сьогодні, найближчі роботи, остання виплата */
  week:{hours:number;earned:number};today:{sid:string;client:string;title:string;address:string;phone:string}[];
  soon:{client:string;title:string;start:string}[];lastPaid:{date:string;amount:number}|null};

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
  const tISO=new Date().toLocaleDateString("sv-SE",{timeZone:"America/Chicago"});
  const shift=(iso:string,k:number)=>{const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+k);return d.toLocaleDateString("sv-SE")};
  const wd=new Date(tISO+"T12:00:00").getDay();const weekFrom=shift(tISO,-((wd+6)%7)); // з понеділка
  let wkH=0,wkE=0;let lastPaid:{date:string;amount:number}|null=null;
  const list=((st?.statements||[]) as Statement[]);
  const saved=((calcs||[]) as {id:string;data:SavedCalc}[]).map(r=>({...r.data,id:r.id}));
  const cl=((clients||[]) as {data:any}[]).map(r=>r.data||{});
  let hours=0,earned=0,paid=0,reimbAll=0;
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
    // чеки, оплачені його карткою (прийняті власником) — їх треба повернути
    const rb=s.receipts.filter(r=>n(r.paidBy||"")===n(link.worker)).reduce((a,r)=>a+(Number(r.amount)||0),0);
    hours+=h;earned+=h*rate;paid+=p;reimbAll+=rb;
    for(const d of days)if(d.date>=weekFrom&&d.date<=tISO){wkH+=d.hours;wkE+=d.hours*rate}
    if(me)for(const x of s.payouts||[])if(x.workerId===me.id){const dt=normDate(x.date);if(!lastPaid||dt>lastPaid.date)lastPaid={date:dt,amount:Number(x.amount)||0}}
    const items=(calc?.items||[]).filter(i=>!/^OPTION/i.test(i.name));
    projects.push({reimb:Math.round(rb*100)/100,sid,client:s.client,project:s.project,address:String(client?.address||""),phone:String(client?.phone||""),
      // немає естімейту з калькулятора — показуємо рядки «Робота» з проєкту (без сум) і погоджені доплати
      scope:items.length?items.map(i=>({name:i.name,qty:Number(i.quantity)||0,unit:i.unit,note:String(i.note||""),optional:!!i.optional}))
        :[...s.labor.filter(l=>String(l.description||"").trim()&&!/^Agreed work \(per estimate\)$/i.test(String(l.description).trim())).map(l=>({name:String(l.description).replace(/^Change order #\d+:\s*/i,""),qty:1,unit:"each",note:"",optional:false})),
          ...(s.changes||[]).filter(c=>c.status==="accepted").flatMap(c=>c.lines.filter(x=>String(x.description||"").trim()).map(x=>({name:String(x.description),qty:1,unit:"each",note:"",optional:false})))]
          .filter((x,i,a)=>a.findIndex(y=>y.name===x.name)===i),
      notes:"", // умови для клієнта (оплата, що не входить) помічнику не показуємо
      materials:items.filter(i=>(Number(i.materialRate)||0)>0&&!i.optional).map(i=>({name:i.name,qty:Number(i.quantity)||0,unit:i.unit,note:String(i.note||"")})),
      days,hours:Math.round(h*100)/100,
      // чеки, які додав саме цей помічник (уже прийняті + ще не переглянуті власником)
      myReceipts:[...s.receipts.filter(r=>n(r.by||"")===n(link.worker)).map(r=>({id:r.id,date:normDate(r.date),store:String(r.store||""),amount:Number(r.amount)||0,pending:false,mine:n(r.paidBy||"")===n(link.worker),card:String(r.card||""),items:String(r.items||"").slice(0,300),photo:!!r.photoPath,payer:(n(r.paidBy||"")===n(link.worker)?"mine":r.paidBy==="biz"?"biz":"none") as "mine"|"biz"|"none"})),
        ...((inbox||[]) as any[]).filter(i=>i.sid===sid&&i.kind==="receipt").map(i=>({id:String(i.payload?.id||""),date:normDate(i.payload?.date)||String(i.created_at).slice(0,10),store:String(i.payload?.store||""),amount:Number(i.payload?.amount)||0,pending:true,mine:n(i.payload?.paidBy||"")===n(link.worker),card:String(i.payload?.card||""),items:String(i.payload?.items||"").slice(0,300),photo:!!i.payload?.photoPath,payer:(n(i.payload?.paidBy||"")===n(link.worker)?"mine":i.payload?.paidBy==="biz"?"biz":"none") as "mine"|"biz"|"none"}))]
        .sort((a,b)=>b.date.localeCompare(a.date)),
      receipts:s.receipts.length+((inbox||[]) as any[]).filter(i=>i.sid===sid&&i.kind==="receipt").length,
      photos:(s.photos||[]).length+((inbox||[]) as any[]).filter(i=>i.sid===sid&&i.kind==="photo").length});
  }
  const r2=(x:number)=>Math.round(x*100)/100;
  const {data:set}=await supabaseAdmin.from("user_settings").select("company,schedule").eq("user_id",uid).maybeSingle();
  // графік: роботи, де призначений цей помічник
  type J={client?:string;title?:string;start?:string;days?:number;sat?:boolean;sid?:string;worker?:string};
  const jobs=(Array.isArray((set as any)?.schedule)?(set as any).schedule:[] as J[]).filter((j:J)=>j.start&&n(j.worker||"")===n(link.worker)) as J[];
  const endOf=(j:J)=>{const d=new Date(String(j.start)+"T12:00:00");let left=Math.max(1,Math.ceil(Number(j.days)||1));for(let g=0;g<400;g++){const w=d.getDay();if(w!==0&&(w!==6||j.sat)){left--;if(left<=0)break}d.setDate(d.getDate()+1)}return d.toLocaleDateString("sv-SE")};
  const projOf=(j:J)=>projects.find(p=>j.sid?p.sid===j.sid:n(p.client)===n(j.client||""));
  const today:WorkerView["today"]=[];
  for(const j of jobs)if(String(j.start)<=tISO&&endOf(j)>=tISO){const p=projOf(j);today.push({sid:p?.sid||"",client:String(j.client||p?.client||""),title:String(j.title||p?.project||""),address:p?.address||"",phone:p?.phone||""})}
  // нема в графіку — показуємо об'єкти, де він записував години за останні 3 дні
  const from3=shift(tISO,-3);
  for(const p of projects)if(!today.some(x=>x.sid===p.sid)&&p.days.some(d=>d.date>=from3&&d.date<=tISO))today.push({sid:p.sid,client:p.client,title:p.project,address:p.address,phone:p.phone});
  const soon=jobs.filter(j=>String(j.start)>tISO&&String(j.start)<=shift(tISO,14)).sort((a,b)=>String(a.start).localeCompare(String(b.start))).slice(0,4).map(j=>({client:String(j.client||""),title:String(j.title||""),start:String(j.start)}));
  return {week:{hours:r2(wkH),earned:r2(wkE)},today,soon,lastPaid,company:String((set as any)?.company?.name||""),worker:link.worker,rate:link.rate,projects,hours:r2(hours),earned:r2(earned),paid:r2(paid),reimb:r2(reimbAll),owed:r2(earned+reimbAll-paid)};
}
