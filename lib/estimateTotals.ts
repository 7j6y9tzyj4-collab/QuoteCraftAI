import type {Item} from "./types";

// Єдина формула для Estimates (та сама, що в Calculator без складності/локації):
//   праця      = кількість × unitPrice (ставка праці з Prices)
//   матеріали  = кількість × materialRate (монтажні матеріали за цінами магазинів)
//   оздоблення = кількість × finishRate (базова плитка/прилади — allowance; можна вимкнути)
const r2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export const itemMaterialRate=(i:Item)=>Number(i.materialRate)||0;
export const itemFinishRate=(i:Item)=>Number(i.finishRate)||0;
export const itemLabor=(i:Item)=>r2((Number(i.quantity)||0)*(Number(i.unitPrice)||0));
export const itemMaterials=(i:Item)=>r2((Number(i.quantity)||0)*itemMaterialRate(i));
export const itemFinish=(i:Item)=>r2((Number(i.quantity)||0)*itemFinishRate(i));
export const itemTotal=(i:Item,includeFinish=true)=>r2(itemLabor(i)+itemMaterials(i)+(includeFinish?itemFinish(i):0));
export function estimateTotals(items:Item[],includeFinish=true){
  let labor=0,materials=0,finish=0;
  for(const i of items){labor+=itemLabor(i);materials+=itemMaterials(i);if(includeFinish)finish+=itemFinish(i);}
  return {labor:r2(labor),materials:r2(materials),finish:r2(finish),subtotal:r2(labor+materials+finish)};
}
