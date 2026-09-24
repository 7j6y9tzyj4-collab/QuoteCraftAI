import type {PriceRule} from "./types";
import {catalog} from "./catalog";

/**
 * defaults
 * --------
 * Перехідник: дані живуть в одному місці — lib/catalog.ts. Раніше тут лежав
 * власний список Prices, паралельний до каталогу калькулятора, через що та
 * сама робота могла коштувати по-різному залежно від вкладки.
 *
 * rate — заводська ціна за одиницю (праця + матеріал + supplies). rateMin і
 * rateMax — межі навколо неї; ринковий орієнтир окремо, у chicagoPrices.
 */
const r2=(n:number)=>Math.round(n*100)/100;

export const defaults:PriceRule[]=catalog.map(t=>({
  id:t.id,
  name:t.name,
  aliases:t.aliases,
  unit:t.unit,
  rate:t.rate,
  rateMin:r2(t.rate*t.lowMult),
  rateMax:r2(t.rate*t.highMult),
  category:t.category,
  materialRate:t.materialRate,
  materialNote:t.materialNote,
  finishRate:t.finishRate||0,
  finishNote:t.finishNote,
  materialStatus:t.materialStatus
}));
