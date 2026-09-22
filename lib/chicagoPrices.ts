import type {PriceRule} from "./types";
import {catalog} from "./catalog";

/**
 * Ринкові орієнтири. Дані живуть у lib/catalog.ts; тут лише зручний доступ за id
 * і масове застосування ринкових ставок із вкладки Prices.
 */
export type PriceReference={low:number;high:number;suggested:number;source:string;url:string;scope:string;checked:string;selection:string;keepOwnRate?:boolean};

export const chicagoPrices:Record<string,PriceReference>=Object.fromEntries(
  catalog.filter(t=>t.marketLow!==undefined&&t.marketHigh!==undefined).map(t=>[t.id,{
    low:t.marketLow as number,
    high:t.marketHigh as number,
    suggested:t.marketSuggested??t.rate,
    source:t.source,
    url:t.sourceUrl||"",
    scope:t.notes,
    checked:t.checked||"",
    selection:t.notes,
    keepOwnRate:t.keepOwnRate
  }])
);

export function applyChicagoPrices(prices:PriceRule[]):PriceRule[]{
 return prices.map(p=>{
  const ref=chicagoPrices[p.id];
  // keepOwnRate: показуємо ринкове джерело, але не перезаписуємо власну ставку власника.
  if(!ref||ref.keepOwnRate)return p;
  return {...p,rate:ref.suggested,rateMin:ref.low,rateMax:ref.high};
 });
}
