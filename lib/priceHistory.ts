// Історія цін і план/факт: рахуємо зі збережених естімейтів (ставки в рядках «заморожені» на момент естімейту).
import type {SavedCalc} from "./calcTypes";
import type {Estimate,PriceRule} from "./types";
import type {Statement} from "./statement";
import {computeCalcLine,computeCalcTotals} from "./calcEngine";
import {legacyIdMap} from "./catalog";
import {tierSummary} from "./tiers";

export type PriceRec={taskId:string;name:string;unit:string;date:string;client:string;project:string;qty:number;rate:number;labor:number;source:"calc"|"old"};
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;

export function historyRecords(saved:SavedCalc[],old:Estimate[]):PriceRec[]{
  const out:PriceRec[]=[];
  for(const s of saved||[]){
    for(const li of s.items||[]){
      const qty=Number(li.quantity)||0;
      if(!li.taskId||qty<=0||li.optional)continue;
      const c=computeCalcLine(li,s.locationMultiplier??1,s.includeFinish!==false);
      out.push({taskId:li.taskId,name:li.name,unit:String(li.unit||""),date:s.updatedAt,client:s.client||"",project:s.project||"",qty,rate:r2(c.labor/qty),labor:r2(c.labor),source:"calc"});
    }
  }
  for(const e of old||[]){
    for(const it of e.items||[]){
      const qty=Number(it.quantity)||0,rate=Number(it.unitPrice)||0;
      if(!it.serviceId||qty<=0||rate<=0)continue;
      const id=(legacyIdMap as Record<string,string>)[it.serviceId]||it.serviceId;
      out.push({taskId:id,name:it.description,unit:String(it.unit||""),date:e.createdAt,client:e.client||"",project:e.project||"",qty,rate:r2(rate),labor:r2(qty*rate),source:"old"});
    }
  }
  return out.filter(r=>r.date&&!isNaN(new Date(r.date).getTime())).sort((a,b)=>b.date.localeCompare(a.date));
}

// середня ставка по роках (зважена на кількість) і зміна рік до року
export function yearStats(recs:PriceRec[]){
  const by:Record<string,{qty:number;labor:number;n:number}>={};
  for(const r of recs){const y=r.date.slice(0,4);const b=(by[y]||={qty:0,labor:0,n:0});b.qty+=r.qty;b.labor+=r.labor;b.n++}
  const years=Object.keys(by).sort();
  return years.map((y,i)=>{
    const avg=by[y].qty?r2(by[y].labor/by[y].qty):0;
    const prev=i>0&&by[years[i-1]].qty?by[years[i-1]].labor/by[years[i-1]].qty:0;
    return {year:y,avg,count:by[y].n,change:prev?Math.round((avg/prev-1)*1000)/10:null as number|null};
  });
}

// «Підняти всі ціни на X%»: праця (і діапазон), за бажанням — матеріали
const roundRate=(n:number)=>n>=20?Math.round(n):n>=5?Math.round(n*2)/2:Math.round(n*100)/100;
export function raisePrices(prices:PriceRule[],pct:number,withMaterials:boolean):PriceRule[]{
  const k=1+(Number(pct)||0)/100;
  return prices.map(p=>{
    const n:PriceRule={...p,aliases:[...p.aliases],rate:roundRate(p.rate*k)};
    if(typeof p.rateMin==="number")n.rateMin=Math.min(roundRate(p.rateMin*k),n.rate);
    if(typeof p.rateMax==="number")n.rateMax=Math.max(roundRate(p.rateMax*k),n.rate);
    if(withMaterials&&(p.materialRate||0)>0){n.materialRate=roundRate((p.materialRate||0)*k);n.materialOwn=true}
    return n;
  });
}

// План з естімейту: робота (зі знижкою) і матеріали (+supplies +оздоблення)
export function planFromCalc(s:SavedCalc){
  if(s.tiers?.enabled&&typeof s.tiers.chosen==="number"){
    const x=tierSummary(s.items||[],s.tiers,s.tiers.chosen,{loc:s.locationMultiplier??1,includeFinish:s.includeFinish!==false,discountType:s.discountType,discountValue:s.discountValue});
    return {labor:r2(x.totals.labor-x.discount),materials:r2(x.totals.materials+x.totals.supplies+x.totals.finish),total:x.total};
  }
  const t=computeCalcTotals(s.items||[],s.locationMultiplier??1,s.includeFinish!==false);
  const v=Math.max(0,Number(s.discountValue)||0);
  const disc=Math.min(s.discountType==="amount"?v:t.labor*v/100,t.labor);
  return {labor:r2(t.labor-disc),materials:r2(t.materials+t.supplies+t.finish),total:r2(t.lineTotal-disc)};
}

// який естімейт належить розрахунку: явний calcId → посилання клієнту → той самий клієнт+проєкт (якщо один)
export function findCalcFor(st:Statement,saved:SavedCalc[]):SavedCalc|null{
  if(st.calcId==="none")return null;
  if(st.calcId){const c=saved.find(x=>x.id===st.calcId);if(c)return c}
  if(st.quoteToken){const c=saved.find(x=>x.shareToken===st.quoteToken);if(c)return c}
  const n=(x:string)=>String(x||"").trim().toLowerCase();
  if(!n(st.client))return null;
  const same=saved.filter(x=>n(x.client)===n(st.client)&&n(x.project)===n(st.project));
  return same.length===1?same[0]:null;
}
