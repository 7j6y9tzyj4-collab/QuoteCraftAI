import type {CalcItem,CalcTotals} from "./calcTypes";

/**
 * Same formula as the standalone construction-estimator app:
 *   labor      = quantity × laborRate × difficultyMultiplier × locationMultiplier
 *   materials  = quantity × materialRate
 *   supplies   = suppliesFixed (if set)  OR  suppliesPct × (labor + materials)
 *   lineTotal  = max(labor + materials + supplies, minPrice)
 *   low        = lineTotal × lowMult   (defaults to 0.85)
 *   high       = lineTotal × highMult  (defaults to 1.25)
 */
export function computeCalcLine(li:CalcItem,locationMultiplier:number,includeFinish=true){
  const diffMult=(li.difficultyMultipliers&&li.difficultyMultipliers[li.difficulty])||1;
  const locMult=Number(locationMultiplier)||1;
  const qty=Number(li.quantity)||0;

  let labor=qty*Number(li.laborRate||0)*diffMult*locMult;
  const materials=qty*Number(li.materialRate||0);
  const supplies=Number(li.suppliesFixed)>0
    ?Number(li.suppliesFixed)
    :(Number(li.suppliesPct)||0)*(labor+materials);

  // базове оздоблення (плитка, прилади) — allowance за цінами магазинів, без множників
  const finish=includeFinish?qty*Number(li.finishRate||0):0;
  let lineTotal=labor+materials+supplies+finish;
  const minPrice=Number(li.minPrice)||0;
  // доплата до мінімальної ціни — це праця: колонки Labor/Materials/Finish мають сходитися з Total
  if(lineTotal<minPrice){labor+=minPrice-lineTotal;lineTotal=minPrice}

  const lowMult=li.lowMult??0.85;
  const highMult=li.highMult??1.25;

  return{labor,materials,supplies,finish,lineTotal,low:lineTotal*lowMult,high:lineTotal*highMult};
}

export function computeCalcTotals(items:CalcItem[],locationMultiplier:number,includeFinish=true):CalcTotals{
  const totals:CalcTotals={labor:0,materials:0,supplies:0,finish:0,lineTotal:0,low:0,high:0};
  items.forEach(li=>{
    const c=computeCalcLine(li,locationMultiplier,includeFinish);
    totals.labor+=c.labor;
    totals.finish+=c.finish;
    totals.materials+=c.materials;
    totals.supplies+=c.supplies;
    totals.lineTotal+=c.lineTotal;
    totals.low+=c.low;
    totals.high+=c.high;
  });
  return totals;
}
