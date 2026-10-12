// Розрахунок з клієнтом: робота + матеріали за чеками − оплати = залишок.
export type StatementLine={id:string;description:string;amount:number};
export type Receipt={id:string;date:string;store:string;items:string;amount:number;
  /** шлях у Supabase Storage (bucket receipts) */ photoPath?:string;
  /** запасний варіант без акаунта: маленька копія фото */ photoData?:string;
  /** номер чека (Receipt #, Order #) — для пошуку дублікатів */ receiptNo?:string;
  /** відбиток зображення — той самий файл двічі не додаємо */ hash?:string;
  /** для «Мої витрати»: Інструменти / Матеріали / Витратні / Інше */ category?:string};
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
