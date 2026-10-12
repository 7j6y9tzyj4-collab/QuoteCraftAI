// Good / Better / Best: три варіанти в одному естімейті.
// Праця однакова; матеріали й оздоблення множаться на коефіцієнт варіанта;
// окремі рядки можна включити лише в деякі варіанти (напр. теплу підлогу — тільки в Best).
import type {CalcItem} from "./calcTypes";
import {computeCalcTotals} from "./calcEngine";

export type Tiers={enabled:boolean;names:[string,string,string];mult:[number,number,number];chosen?:number};
export const DEFAULT_TIERS:Tiers={enabled:true,names:["Good","Better","Best"],mult:[1,1.4,2]};
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;

export const inTier=(li:CalcItem,i:number)=>!li.tiers||li.tiers.includes(i);
export function tierItems(items:CalcItem[],t:Tiers,i:number):CalcItem[]{
  const k=Number(t.mult[i])||1;
  return items.filter(li=>inTier(li,i)).map(li=>({...li,materialRate:r2((Number(li.materialRate)||0)*k),finishRate:r2((Number(li.finishRate)||0)*k)}));
}
export function tierSummary(items:CalcItem[],t:Tiers,i:number,o:{loc:number;includeFinish:boolean;discountType?:"percent"|"amount";discountValue?:number;depositPct?:number}){
  const its=tierItems(items,t,i);
  const totals=computeCalcTotals(its,o.loc,o.includeFinish);
  const v=Math.max(0,Number(o.discountValue)||0);
  const discount=r2(Math.min(o.discountType==="amount"?v:totals.labor*v/100,totals.labor));
  const total=r2(Math.max(0,totals.lineTotal-discount));
  return {items:its,totals,discount,total,deposit:r2(total*(Number(o.depositPct)||0)/100)};
}
