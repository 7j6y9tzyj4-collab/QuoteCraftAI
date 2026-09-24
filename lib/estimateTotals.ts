import type {Item} from "./types";

// Єдина формула для Estimates (та сама, що в Calculator без складності/локації):
//   праця     = кількість × unitPrice (ставка праці з Prices)
//   матеріали = кількість × materialRate (базові монтажні матеріали з Prices; 0 — клієнт купує)
//   рядок     = праця + матеріали
const r2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export const itemMaterialRate=(i:Item)=>Number(i.materialRate)||0;
export const itemLabor=(i:Item)=>r2((Number(i.quantity)||0)*(Number(i.unitPrice)||0));
export const itemMaterials=(i:Item)=>r2((Number(i.quantity)||0)*itemMaterialRate(i));
export const itemTotal=(i:Item)=>r2(itemLabor(i)+itemMaterials(i));
export function estimateTotals(items:Item[]){
  let labor=0,materials=0;
  for(const i of items){labor+=itemLabor(i);materials+=itemMaterials(i);}
  return {labor:r2(labor),materials:r2(materials),subtotal:r2(labor+materials)};
}
