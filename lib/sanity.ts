import {computeCalcTotals} from "./calcEngine";
import type {CalcItem,SavedCalc} from "./calcTypes";

// Перевірка «чи не замало»: частка матеріалів у сумі порівняно з твоїми схожими естімейтами.
export const kindOf=(project:string,items:{name:string;category?:string}[])=>{
  const t=(project+" "+items.map(i=>i.name+" "+(i.category||"")).join(" ")).toLowerCase();
  if(/bath|shower|tub|toilet|powder|ванн|душ|туалет/.test(t))return "bath";
  if(/kitchen|cabinet|backsplash|кухн/.test(t))return "kitchen";
  return "other";
};
const median=(xs:number[])=>{const a=[...xs].sort((x,y)=>x-y);const m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2};
const share=(items:CalcItem[],loc:number)=>{const t=computeCalcTotals(items,loc,false);const lm=t.labor+t.materials+t.supplies;return lm>0?{mat:(t.materials+t.supplies)/lm,labor:t.labor,total:lm}:null};

export type SanityNote={level:"warn"|"info";text:string};

export function sanityCheck(cur:{id?:string;project:string;items:CalcItem[];loc:number},saved:SavedCalc[]):SanityNote[]{
  const me=share(cur.items,cur.loc);
  if(!me||me.total<400)return [];
  const kind=kindOf(cur.project,cur.items);
  const others=saved.filter(s=>s.id!==cur.id&&(s.items||[]).length>=3).map(s=>({k:kindOf(s.project||"",s.items||[]),v:share(s.items||[],s.locationMultiplier??1)})).filter(x=>x.v&&x.v.total>=1000);
  let pool=others.filter(o=>o.k===kind);
  if(pool.length<2)pool=others;
  if(pool.length<2)return [];
  const med=median(pool.map(o=>o.v!.mat));
  const pct=(x:number)=>Math.round(x*100)+"%";
  const label=pool[0].k===kind&&kind!=="other"?(kind==="bath"?"ванних":"кухонь"):"інших";
  const out:SanityNote[]=[];
  if(med>0.05&&me.mat<med*0.6)out.push({level:"warn",text:`Матеріали ${pct(me.mat)} від суми — у твоїх ${label} естімейтах зазвичай ~${pct(med)}. Перевір, чи нічого не забув (сміття/вивезення, клей, гідроізоляція, сантехнічні дрібниці).`});
  else if(me.mat>Math.max(med*1.7,med+0.15))out.push({level:"info",text:`Матеріали ${pct(me.mat)} від суми — більше, ніж зазвичай у твоїх ${label} естімейтах (~${pct(med)}). Може, десь задвоєно матеріал?`});
  return out;
}
