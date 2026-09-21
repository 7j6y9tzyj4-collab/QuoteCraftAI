import type {Estimate,Item,PriceRule} from "./types";
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export const numeric=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
export function snapshot(p:PriceRule):Partial<Item>{return {laborScope:p.laborNote,laborMin:p.rateMin??p.rate,laborMax:p.rateMax??p.rate,materialRate:p.materialRate,materialMin:p.materialMin,materialMax:p.materialMax,materialStatus:p.materialStatus??"unknown",materialNote:p.materialNote};}
export function lineAmounts(i:Item){
 const excluded=i.customerMaterials||i.materialStatus==="none";
 // Existing estimates without materialStatus retain their original labor-only totals.
 const unknown=!excluded&&(i.materialStatus==="unknown"||i.materialStatus==="partial");
 const unpriced=i.materialStatus==="unknown";
 const rate=excluded||unpriced?0:i.materialRate??0;
 const labor=round(i.quantity*i.unitPrice),materials=round(i.quantity*rate);
 return {labor,materials,total:round(labor+materials),unknown,
  min:round(i.quantity*((i.laborMin??i.unitPrice)+(excluded||unpriced?0:i.materialMin??rate))),
  max:round(i.quantity*((i.laborMax??i.unitPrice)+(excluded||unpriced?0:i.materialMax??rate)))};
}
export function estimateAmounts(e:Estimate){
 const lines=e.items.map(lineAmounts);
 const labor=round(lines.reduce((s,l)=>s+l.labor,0)),materials=round(lines.reduce((s,l)=>s+l.materials,0));
 const subtotal=round(labor+materials),discount=round(Math.min(subtotal,Math.max(0,e.discount||0)));
 const tax=round((subtotal-discount)*Math.max(0,e.tax||0)/100),total=round(subtotal-discount+tax),deposit=round(total*Math.max(0,Math.min(100,e.deposit||0))/100);
 return {labor,materials,subtotal,discount,tax,total,deposit,unknown:lines.filter(l=>l.unknown).length,
 min:round(lines.reduce((s,l)=>s+l.min,0)),max:round(lines.reduce((s,l)=>s+l.max,0))};
}
export function validItem(i:Item){
 if(!i.description.trim()||!numeric(i.quantity)||i.quantity<=0||!numeric(i.unitPrice))return false;
 if([i.laborMin,i.laborMax,i.materialRate,i.materialMin,i.materialMax].some(n=>n!==undefined&&!numeric(n)))return false;
 if((i.laborMin??i.unitPrice)>i.unitPrice||(i.laborMax??i.unitPrice)<i.unitPrice)return false;
 if((i.materialStatus==="priced"||i.materialStatus==="partial")&&(!numeric(i.materialRate)||!numeric(i.materialMin)||!numeric(i.materialMax)||i.materialMin>i.materialRate||i.materialRate>i.materialMax))return false;
 return true;
}
export function validEstimate(e:Estimate){return e.items.every(validItem)&&[e.discount,e.tax,e.deposit].every(numeric)&&e.tax<=100&&e.deposit<=100;}
