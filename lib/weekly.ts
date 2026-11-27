import {supabaseAdmin} from "./supabaseAdmin";
import {statementTotals,statementStatus,crewSummary,dueNowOf,hoursBudget,type Statement} from "./statement";
import {normDate} from "./receiptBatch";

// 📊 Тижневий підсумок власнику (неділя ввечері): що заробив, кому винен, хто винен йому, що наступного тижня.
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
const usd=(n:number)=>"$"+Math.round(n).toLocaleString("en-US");
const iso=(d:Date)=>d.toLocaleDateString("sv-SE",{timeZone:"America/Chicago"});
const plus=(d:string,k:number)=>{const x=new Date(d+"T12:00:00");x.setDate(x.getDate()+k);return x.toLocaleDateString("sv-SE")};
const isMe=(name:string,self?:boolean)=>!!self||/^(я|me|vasyl|василь)$/i.test(String(name||"").trim());

export type Weekly={title:string;body:string;lines:string[]};
export async function weeklySummary(uid:string):Promise<Weekly|null>{
  const [{data:st},{data:set}]=await Promise.all([
    supabaseAdmin.from("user_statements").select("statements").eq("user_id",uid).maybeSingle(),
    supabaseAdmin.from("user_settings").select("schedule").eq("user_id",uid).maybeSingle()]);
  const list=((st?.statements||[]) as Statement[]).filter(s=>!s.own);
  if(!list.length)return null;
  const today=iso(new Date());const wd=new Date(today+"T12:00:00").getDay();
  const from=plus(today,-((wd+6)%7)),to=plus(from,6);          // понеділок…неділя цього тижня
  const inWeek=(d:string)=>{const x=normDate(d);return x>=from&&x<=to};
  let myH=0,myEarn=0,got=0,helperOwed=0,clientsOwe=0;const debtors:string[]=[];const over:string[]=[];
  for(const s of list){
    const t=statementTotals(s);const crew=s.crew||[];
    for(const w of s.workLog||[])if(inWeek(w.date)){const c=crew.find(x=>x.id===w.workerId);if(c&&isMe(c.name,c.self)){const h=Number(w.hours)||0;myH+=h;myEarn+=h*(Number(c.rate)||0)}}
    for(const p of s.payments||[])if(inWeek(p.date))got+=Number(p.amount)||0;
    helperOwed+=Math.max(0,crewSummary(s).helperOwed);
    const status=statementStatus(s);
    const due=s.dueNow?dueNowOf(s,t).now:(status==="waiting"||status==="done")?Math.max(0,t.balance):0;
    if(due>0.5){clientsOwe+=due;debtors.push(`${s.client} ${usd(due)}`)}
    const b=hoursBudget(s);
    if(b&&status==="active"&&b.level!=="ok"&&(s.workLog||[]).some(w=>inWeek(w.date)))over.push(`${s.client}: ${b.used}/${b.plan} год`);
  }
  type J={client?:string;title?:string;start?:string;days?:number;sat?:boolean};
  const jobs=(Array.isArray((set as any)?.schedule)?(set as any).schedule:[]) as J[];
  const nFrom=plus(to,1),nTo=plus(to,7);
  const endOf=(j:J)=>{const d=new Date(String(j.start)+"T12:00:00");let left=Math.max(1,Math.ceil(Number(j.days)||1));for(let g=0;g<400;g++){const w=d.getDay();if(w!==0&&(w!==6||j.sat)){left--;if(left<=0)break}d.setDate(d.getDate()+1)}return d.toLocaleDateString("sv-SE")};
  const next=[...new Set(jobs.filter(j=>j.start&&String(j.start)<=nTo&&endOf(j)>=nFrom).sort((a,b)=>String(a.start).localeCompare(String(b.start))).map(j=>String(j.client||"").trim()).filter(Boolean))];
  const lines:string[]=[];
  lines.push(myH>0?`Ти: ${r2(myH)} год ≈ ${usd(myEarn)}`:"Твоїх годин цього тижня не записано");
  if(got>0)lines.push(`Від клієнтів прийшло ${usd(got)}`);
  if(helperOwed>0.5)lines.push(`Винен помічникам ${usd(helperOwed)}`);
  if(clientsOwe>0.5)lines.push(`Тобі винні ${usd(clientsOwe)}: ${debtors.slice(0,3).join(", ")}`);
  if(over.length)lines.push(`⏱ Години на межі — ${over.slice(0,2).join("; ")}`);
  lines.push(next.length?`Наступний тиждень: ${next.slice(0,4).join(", ")}`:"На наступний тиждень у графіку порожньо");
  return {title:"📊 Підсумок тижня",body:lines.join("\n"),lines};
}
