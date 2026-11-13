// Розрахунок з клієнтом: робота + матеріали за чеками − оплати = залишок.
export type StatementLine={id:string;description:string;amount:number};
export type Receipt={id:string;date:string;store:string;items:string;amount:number;
  /** шлях у Supabase Storage (bucket receipts) */ photoPath?:string;
  /** запасний варіант без акаунта: маленька копія фото */ photoData?:string;
  /** номер чека (Receipt #, Order #) — для пошуку дублікатів */ receiptNo?:string;
  /** останні 4 цифри картки з чека */ card?:string;
  /** хто платив: "biz" — бізнес-картка власника; ім'я помічника — його власні гроші (треба повернути); "other" — готівка/інше; порожньо — невідомо */ paidBy?:string;
  /** відбиток зображення — той самий файл двічі не додаємо */ hash?:string;
  /** для «Мої витрати»: Інструменти / Матеріали / Витратні / Інше */ category?:string;
  /** хто додав (помічник за посиланням) */ by?:string;
  /** коли додав помічник (ISO) — для позначки «нове» */ at?:string;
  /** звідки: "mail" — прийшов з пошти */ src?:string;
  /** чому чек саме тут (назва роботи на чеку / за графіком / AI / вручну) */ why?:string};
export type CrewMember={id:string;name:string;rate:number;/** це я — мої години рахуються, але не входять у витрати на помічників */self?:boolean};
export type WorkEntry={id:string;date:string;workerId:string;hours:number;note?:string;/** хто записав (помічник за посиланням); нема — записав власник */by?:string;at?:string};
/** запис від помічника, доданий за останні 36 год */
export const isFresh=(x:{by?:string;at?:string})=>!!x.by&&!!x.at&&Date.now()-new Date(x.at).getTime()<36*3600e3;
export type Payout={id:string;date:string;workerId:string;amount:number};
export type StatusKey="planned"|"active"|"waiting"|"done";
export type Payment={id:string;date:string;amount:number;method:string};
/** рішення клієнта: питання → відповідь; history — що було до того, як передумав */
export type Decision={id:string;question:string;answer:string;date:string;history?:{answer:string;date:string}[]};
export type ScheduleStep={id:string;label:string;amount:number;due?:string};
export type Statement={
  id:string;
  client:string;
  project:string;
  labor:StatementLine[];
  receipts:Receipt[];
  payments:Payment[];
  notes:string;
  updatedAt:string;
  /** з якого естімейту (посилання клієнту /q/<token>) */
  quoteToken?:string;
  /** з якого збереженого естімейту калькулятора (план/факт); "none" — не прив'язувати */
  calcId?:string;
  /** години роботи — щоб рахувати реальну $/год */
  hours?:number;
  /** «Мої витрати»: мої інструменти й матеріали для роботи (не клієнтський розрахунок) */
  own?:boolean;
  /** графік оплат: депозит / етапи / фінал */
  schedule?:ScheduleStep[];
  decisions?:Decision[];
  /** доплати (change orders) */
  changes?:import("./changeOrder").ChangeOrder[];
  /** статус проєкту, вибраний вручну; нема — рахується автоматично */
  status?:StatusKey;
  /** команда проєкту: я і помічники, зі ставкою $/год */
  crew?:CrewMember[];
  /** облік годин по людях */
  workLog?:WorkEntry[];
  /** виплати помічникам */
  payouts?:Payout[];
  /** фото роботи (від мене або помічника за посиланням) */
  photos?:{id:string;path:string;date:string;by?:string;note?:string;at?:string}[];
  /** матеріали в рахунку: "receipts" — клієнт платить рівно за чеками (за замовчуванням);
   *  "estimate" — фіксовано за естімейтом (matPlan): більше — доплата клієнту, менше — різниця моя */
  matMode?:"receipts"|"estimate";
  matPlan?:number;
  /** коли попросив клієнта про відгук у Google */
  reviewAsked?:string;
};

export const DEFAULT_STATEMENT_NOTES="Copies of all store receipts are available on request. Payment can be made in cash, by check, or via Zelle. Thank you!";

export const newStatement=():Statement=>({
  id:crypto.randomUUID(),client:"",project:"",
  labor:[{id:crypto.randomUUID(),description:"Agreed work (per estimate)",amount:0}],
  receipts:[],payments:[],notes:DEFAULT_STATEMENT_NOTES,updatedAt:new Date().toISOString(),
});

const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
export function statementTotals(s:Statement){
  const labor=r2(s.labor.reduce((a,l)=>a+(Number(l.amount)||0),0));
  // receipts — реально витрачено за чеками; materials — скільки матеріалів у рахунку клієнту
  const receipts=r2(s.receipts.reduce((a,r)=>a+(Number(r.amount)||0),0));
  const plan=r2(Number(s.matPlan)||0);const fixed=s.matMode==="estimate"&&plan>0&&!s.own;
  const materials=fixed?Math.max(plan,receipts):receipts;
  const total=r2(labor+materials);
  const paid=r2(s.payments.reduce((a,p)=>a+(Number(p.amount)||0),0));
  return {labor,materials,receipts,fixed,matPlan:fixed?plan:0,matOver:fixed?r2(Math.max(0,receipts-plan)):0,matKeep:fixed?r2(Math.max(0,plan-receipts)):0,total,paid,balance:r2(total-paid)};
}

// ---- Мої витрати (інструменти й матеріали для себе) ----
export const OWN_ID="own-expenses";
export const OWN_CATS=["Інструменти","Матеріали","Витратні","Інше"] as const;
export const newOwnStatement=():Statement=>({id:OWN_ID,client:"Мої витрати",project:"Інструменти й матеріали для роботи",labor:[],receipts:[],payments:[],notes:"",updatedAt:new Date().toISOString(),own:true});
// здогадка категорії з переліку покупок (можна змінити вручну)
const TOOL=/\b(drill|driver|saw|blade|bit|bits|grinder|sander|level|ladder|tool|tools|knife|trowel|float|mixer|vacuum|vac|battery|charger|clamp|hammer|wrench|plier|pliers|chisel|tape measure|laser|wet saw|multi.?tool|oscillating|nailer|stapler|compressor|bucket)\b/i;
const CONSUMABLE=/\b(gloves|tape|bag|bags|sponge|rag|mask|respirator|sandpaper|plastic sheet|drop cloth|cleaner|wipes|glue)\b/i;
export function guessOwnCategory(items:string):string{
  if(TOOL.test(items||""))return "Інструменти";
  if(CONSUMABLE.test(items||""))return "Витратні";
  return "Матеріали";
}

// ---- статус проєкту: автоматично за залишком, але можна змінити вручну ----
export const STATUS_META:Record<StatusKey,{label:string;color:string;bg:string}>={
  planned:{label:"Заплановано",color:"#6941c6",bg:"#f4f3ff"},
  active:{label:"В роботі",color:"#b54708",bg:"#fffaeb"},
  waiting:{label:"Чекаю оплату",color:"#175cd3",bg:"#eff8ff"},
  done:{label:"Завершено",color:"#067647",bg:"#ecfdf3"},
};
/** авто: старт у графіку ще попереду — «Заплановано»; залишок 0 і оплата була — «Завершено», інакше «В роботі»; ручний вибір має пріоритет */
export function statementStatus(s:Statement,upcomingStart?:string):StatusKey{
  if(s.status&&STATUS_META[s.status])return s.status;
  if(upcomingStart)return "planned";
  const t=statementTotals(s);
  return t.total>0&&t.paid>0&&t.balance<=0.005?"done":"active";
}

// ---- команда: години, нараховано, виплачено, винен ----
export type CrewRow={id:string;name:string;rate:number;self:boolean;hours:number;accrued:number;paid:number;owed:number;/** чеки, оплачені його карткою — повернути */reimb:number};
export function crewSummary(s:Statement){
  const crew=s.crew||[];
  const rows:CrewRow[]=crew.map(c=>{
    const hours=r2((s.workLog||[]).filter(w=>w.workerId===c.id).reduce((a,w)=>a+(Number(w.hours)||0),0));
    const accrued=r2(hours*(Number(c.rate)||0));
    const paid=r2((s.payouts||[]).filter(p=>p.workerId===c.id).reduce((a,p)=>a+(Number(p.amount)||0),0));
    const reimb=c.self?0:r2(s.receipts.filter(r=>r.paidBy&&r.paidBy.trim().toLowerCase()===String(c.name||"").trim().toLowerCase()).reduce((a,r)=>a+(Number(r.amount)||0),0));
    return {id:c.id,name:c.name,rate:Number(c.rate)||0,self:!!c.self,hours,accrued,paid,reimb,owed:r2(accrued+reimb-paid)};
  });
  const sum=(k:"hours"|"accrued"|"paid"|"owed")=>r2(rows.reduce((a,r)=>a+r[k],0));
  const helpers=rows.filter(r=>!r.self);
  const cost=r2(helpers.reduce((a,r)=>a+r.accrued,0));
  return {rows,hours:sum("hours"),accrued:sum("accrued"),paid:sum("paid"),owed:sum("owed"),cost,helperOwed:r2(helpers.reduce((a,r)=>a+r.owed,0))};
}

// «Я» у команді проєкту — це власник: якщо ім'я «Я»/«Me», а позначку self забули, ставимо її.
const ME_RE=/^\s*(я|me|i|myself)\s*$/i;
export function normalizeCrew(list:Statement[]):{list:Statement[];changed:boolean}{
  let changed=false;
  const out=list.map(s=>{
    if(!s.crew?.some(c=>!c.self&&ME_RE.test(c.name||"")))return s;
    changed=true;
    return {...s,crew:s.crew.map(c=>!c.self&&ME_RE.test(c.name||"")?{...c,self:true,rate:0}:c)};
  });
  return {list:out,changed};
}

// $/год по роботі: робота (без чеків) ÷ години (облік команди або поле «Годин роботи»)
export function jobRate(s:Statement){
  const labor=r2(s.labor.reduce((a,l)=>a+(Number(l.amount)||0),0));
  const logged=r2((s.workLog||[]).reduce((a,w)=>a+(Number(w.hours)||0),0));
  const hours=logged>0?logged:Number(s.hours)||0;
  return {labor,hours,rate:hours>0?r2(labor/hours):0};
}

// 💰 Прибуток по проєкту: робота за контрактом − праця помічників (чеки клієнт оплачує окремо, тому не впливають).
export function profitOf(s:Statement){
  const t=statementTotals(s);const crew=crewSummary(s);
  const labor=t.labor,cost=crew.cost,profit=r2(labor+t.matKeep-cost);
  const base=labor+t.matKeep;const margin=base>0?Math.round(profit/base*100):null;
  const helperHours=r2(crew.rows.filter(r=>!r.self).reduce((a,r)=>a+r.hours,0));
  return {labor,cost,profit,margin,helperHours,matKeep:t.matKeep,low:margin!==null&&cost>0&&margin<25,cash:r2(t.paid-t.receipts-cost)};
}

/** хто платив за чек: бізнес-картка власника → "biz"; інша картка й чек додав помічник → помічник; інша картка, додав власник → "" (уточнити) */
export function payerFor(card:string|undefined,by:string|undefined,biz:string[]):string|undefined{
  const c=String(card||"").trim();
  if(c&&biz.includes(c))return "biz";
  if(by)return c?by:"";       // помічник додав, картка не бізнесова → платив він; картка не прочиталась → уточнити
  return c?"":undefined;      // власник додав чек з чужою карткою — уточнити; без картки — як раніше (вважаємо бізнес)
}
