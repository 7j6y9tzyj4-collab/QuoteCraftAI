import {computeCalcLine} from "./calcEngine";
import type {CalcItem,CalcTotals} from "./calcTypes";
import {COMPANY_NAME,COMPANY_CONTACT} from "./calcPdf";
import {tierSummary,type Tiers} from "./tiers";

// Знімок естімейту з калькулятора для сторінки клієнта (/q/<token>).
// Зберігаємо готові суми, щоб посилання не змінювалось, коли міняються ціни в Prices.
export type QuoteLine={name:string;note:string;qty:number;unit:string;labor:number;materials:number;finish:number;total:number};
export type QuoteSnapshot={
  v:1;
  company:string;contact:string;
  client:string;project:string;date:string;
  lines:QuoteLine[];
  optional:QuoteLine[];
  totals:{labor:number;materials:number;finish:number;subtotal:number;discount:number;discountLabel:string;total:number;low:number;high:number;depositPct?:number;deposit?:number};
  notes:string;
  /** приблизні розміри з фото — попередній естімейт */
  measurementNotes?:string;
  /** три варіанти: клієнт обирає один і приймає */
  tiers?:{name:string;lines:QuoteLine[];totals:{labor:number;materials:number;finish:number;discount:number;total:number;deposit:number}}[];
  /** який варіант обрав клієнт (0,1,2) */
  chosenTier?:number;
  /** які опційні позиції клієнт додав, коли приймав (індекси в optional) */
  chosenOptions?:number[];
};
export type QuoteStatus="sent"|"viewed"|"accepted";

export const unitLabel=(u:string)=>({each:"each",sqft:"sq ft",hour:"hour",linear_ft:"lin ft",room:"room"} as Record<string,string>)[u]||u;
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;

export function buildQuoteSnapshot(input:{client:string;project:string;items:CalcItem[];locationMultiplier:number;includeFinish:boolean;totals:CalcTotals;discount:number;discountLabel:string;grandTotal:number;notes:string;depositPct?:number;measurementNotes?:string;tiers?:Tiers;discountType?:"percent"|"amount";discountValue?:number}):QuoteSnapshot{
  const line=(li:CalcItem):QuoteLine=>{
    const c=computeCalcLine(li,input.locationMultiplier,input.includeFinish);
    const note=li.note&&!/^Verified /.test(li.note)?li.note:"";
    return {name:li.name,note,qty:Number(li.quantity)||0,unit:unitLabel(li.unit),labor:r2(c.labor),materials:r2(c.materials+c.supplies),finish:r2(c.finish),total:r2(c.lineTotal)};
  };
  const t=input.totals;
  return {
    v:1,company:COMPANY_NAME,contact:COMPANY_CONTACT,
    client:input.client,project:input.project,
    date:new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"}),
    lines:input.items.filter(i=>!i.optional).map(line),
    optional:input.items.filter(i=>i.optional).map(line),
    totals:{labor:r2(t.labor),materials:r2(t.materials+t.supplies),finish:r2(t.finish),subtotal:r2(t.lineTotal),discount:r2(input.discount),discountLabel:input.discountLabel,
      total:r2(input.grandTotal),low:r2(Math.max(0,t.low-input.discount)),high:r2(Math.max(0,t.high-input.discount)),
      depositPct:input.depositPct||0,deposit:r2(input.grandTotal*(input.depositPct||0)/100)},
    notes:input.notes||"",
    measurementNotes:input.measurementNotes||undefined,
    tiers:input.tiers?.enabled?[0,1,2].map(i=>{
      const s=tierSummary(input.items,input.tiers!,i,{loc:input.locationMultiplier,includeFinish:input.includeFinish,discountType:input.discountType,discountValue:input.discountValue,depositPct:input.depositPct});
      return {name:input.tiers!.names[i]||["Good","Better","Best"][i],lines:s.items.filter(x=>!x.optional).map(line),
        totals:{labor:r2(s.totals.labor),materials:r2(s.totals.materials+s.totals.supplies),finish:r2(s.totals.finish),discount:s.discount,total:s.total,deposit:s.deposit}};
    }):undefined,
  };
}

/** Сума з урахуванням опцій, які клієнт обрав на сторінці (індекси в q.optional). */
export function quoteWithOptions(q:QuoteSnapshot,chosen:number[]|undefined){
  const opts=(chosen||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<q.optional.length);
  const add=opts.reduce((a,i)=>a+(q.optional[i]?.total||0),0);
  const total=r2(q.totals.total+add);
  const pct=q.totals.depositPct||0;
  return {options:opts,add:r2(add),total,deposit:r2(total*pct/100),depositPct:pct};
}

/** Що клієнт прийняв і скільки завдатку (з варіантом Good/Better/Best або опціями). */
export function acceptedAmounts(q:QuoteSnapshot&{chosenTier?:number;chosenOptions?:number[]}){
  if(q.tiers?.length&&typeof q.chosenTier==="number"){
    const t=q.tiers[q.chosenTier];
    return {total:t?.totals.total||0,deposit:t?.totals.deposit||0,label:t?.name||""};
  }
  const w=quoteWithOptions(q,q.chosenOptions);
  return {total:w.total,deposit:w.deposit,label:w.options.length?`+ опції: ${w.options.map(i=>q.optional[i].name).join(", ")}`:""};
}
