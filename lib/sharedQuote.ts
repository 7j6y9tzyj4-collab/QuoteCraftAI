import {computeCalcLine} from "./calcEngine";
import type {CalcItem,CalcTotals} from "./calcTypes";
import {COMPANY_NAME,COMPANY_CONTACT} from "./calcPdf";

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
};
export type QuoteStatus="sent"|"viewed"|"accepted";

export const unitLabel=(u:string)=>({each:"each",sqft:"sq ft",hour:"hour",linear_ft:"lin ft",room:"room"} as Record<string,string>)[u]||u;
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;

export function buildQuoteSnapshot(input:{client:string;project:string;items:CalcItem[];locationMultiplier:number;includeFinish:boolean;totals:CalcTotals;discount:number;discountLabel:string;grandTotal:number;notes:string;depositPct?:number;measurementNotes?:string}):QuoteSnapshot{
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
  };
}
