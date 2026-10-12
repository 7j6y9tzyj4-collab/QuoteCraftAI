// Розрахунок з клієнтом: робота + матеріали за чеками − оплати = залишок.
export type StatementLine={id:string;description:string;amount:number};
export type Receipt={id:string;date:string;store:string;items:string;amount:number;
  /** шлях у Supabase Storage (bucket receipts) */ photoPath?:string;
  /** запасний варіант без акаунта: маленька копія фото */ photoData?:string;
  /** номер чека (Receipt #, Order #) — для пошуку дублікатів */ receiptNo?:string;
  /** відбиток зображення — той самий файл двічі не додаємо */ hash?:string;
  /** для «Мої витрати»: Інструменти / Матеріали / Витратні / Інше */ category?:string};
export type CrewMember={id:string;name:string;rate:number;/** це я — мої години рахуються, але не входять у витрати на помічників */self?:boolean};
export type WorkEntry={id:string;date:string;workerId:string;hours:number;note?:string};
export type Payout={id:string;date:string;workerId:string;amount:number};
export type StatusKey="active"|"waiting"|"done";
export type Payment={id:string;date:string;amount:number;method:string};
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
  const materials=r2(s.receipts.reduce((a,r)=>a+(Number(r.amount)||0),0));
  const total=r2(labor+materials);
  const paid=r2(s.payments.reduce((a,p)=>a+(Number(p.amount)||0),0));
  return {labor,materials,total,paid,balance:r2(total-paid)};
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
  active:{label:"В роботі",color:"#b54708",bg:"#fffaeb"},
  waiting:{label:"Чекаю оплату",color:"#175cd3",bg:"#eff8ff"},
  done:{label:"Завершено",color:"#067647",bg:"#ecfdf3"},
};
/** авто: залишок 0 і оплата була — «Завершено», інакше «В роботі»; ручний вибір має пріоритет */
export function statementStatus(s:Statement):StatusKey{
  if(s.status&&STATUS_META[s.status])return s.status;
  const t=statementTotals(s);
  return t.total>0&&t.paid>0&&t.balance<=0.005?"done":"active";
}

// ---- команда: години, нараховано, виплачено, винен ----
export type CrewRow={id:string;name:string;rate:number;self:boolean;hours:number;accrued:number;paid:number;owed:number};
export function crewSummary(s:Statement){
  const crew=s.crew||[];
  const rows:CrewRow[]=crew.map(c=>{
    const hours=r2((s.workLog||[]).filter(w=>w.workerId===c.id).reduce((a,w)=>a+(Number(w.hours)||0),0));
    const accrued=r2(hours*(Number(c.rate)||0));
    const paid=r2((s.payouts||[]).filter(p=>p.workerId===c.id).reduce((a,p)=>a+(Number(p.amount)||0),0));
    return {id:c.id,name:c.name,rate:Number(c.rate)||0,self:!!c.self,hours,accrued,paid,owed:r2(accrued-paid)};
  });
  const sum=(k:"hours"|"accrued"|"paid"|"owed")=>r2(rows.reduce((a,r)=>a+r[k],0));
  const helpers=rows.filter(r=>!r.self);
  const cost=r2(helpers.reduce((a,r)=>a+r.accrued,0));
  return {rows,hours:sum("hours"),accrued:sum("accrued"),paid:sum("paid"),owed:sum("owed"),cost,helperOwed:r2(helpers.reduce((a,r)=>a+r.owed,0))};
}
