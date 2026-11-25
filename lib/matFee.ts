import type {CalcItem} from "./calcTypes";
import {computeCalcLine} from "./calcEngine";

// 🛒 Плата за закупівлю й доставку матеріалів — відсоток від матеріалів.
// В естімейті це окремий рядок (сума від ОЦІНКИ матеріалів, оновлюється сама);
// у розрахунку (Оплати) — відсоток від ФАКТИЧНИХ чеків (Statement.matFee).
export const MAT_FEE_TASK="mat_fee";
export const MAT_FEE_DEFAULT=15;
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
export const matFeeName=(pct:number)=>`Material purchasing & delivery (${pct}% of materials)`;
const NAME_RE=/^Material purchasing & delivery \((\d+(?:\.\d+)?)% of materials\)/;
export const isMatFeeLine=(name:string)=>NAME_RE.test(String(name||""));
/** відсоток з назви рядка (для прийнятих естімейтів, де є лише знімок рядків) */
export const matFeePctOfLine=(name:string)=>{const m=String(name||"").match(NAME_RE);return m?Number(m[1])||0:0};
export const isMatFeeItem=(li:{taskId?:string;name?:string})=>li.taskId===MAT_FEE_TASK||isMatFeeLine(li.name||"");

/** оцінка матеріалів в естімейті (без опційних і без самого рядка плати) */
export function matFeeBase(items:CalcItem[],loc:number,includeFinish:boolean){
  return r2(items.filter(li=>!li.optional&&!isMatFeeItem(li)).reduce((a,li)=>{const c=computeCalcLine(li,loc,includeFinish);return a+c.materials+c.supplies+c.finish},0));
}

/** Тримає рядок плати в естімейті в актуальному стані. Повертає той самий масив, якщо міняти нічого. */
export function syncMatFee(items:CalcItem[],pct:number,loc:number,includeFinish:boolean):CalcItem[]{
  const p=Math.max(0,Math.min(50,Number(pct)||0));
  const cur=items.find(isMatFeeItem);
  const base=matFeeBase(items,loc,includeFinish);
  const amount=r2(base*p/100);
  if(!(p>0)||!(amount>0))return cur?items.filter(li=>!isMatFeeItem(li)):items;
  const locMult=Number(loc)||1;
  const rate=r2(amount/locMult);           // праця множиться на коефіцієнт локації — компенсуємо, щоб сума була рівно p%
  const name=matFeeName(p);
  if(cur){
    const last=items[items.length-1]===cur;
    if(cur.name===name&&Math.abs((Number(cur.laborRate)||0)-rate)<0.005&&cur.quantity===1&&!cur.optional&&last)return items;
    const next:CalcItem={...cur,name,laborRate:rate,quantity:1,materialRate:0,finishRate:0,suppliesPct:0,suppliesFixed:0,minPrice:0,optional:false};
    return [...items.filter(li=>li!==cur),next];
  }
  const item={id:crypto.randomUUID(),taskId:MAT_FEE_TASK,name,category:"Materials",unit:"each",quantity:1,difficulty:"standard",
    laborRate:rate,materialRate:0,finishRate:0,suppliesPct:0,suppliesFixed:0,minPrice:0,difficultyMultipliers:{basic:1,standard:1,difficult:1},lowMult:1,highMult:1,
    notes:"Shopping, pick-up, delivery to the job site and returns of unused materials. The final amount is based on the actual store receipts.",source:"QuoteCraft"} as unknown as CalcItem;
  return [...items,item];
}
