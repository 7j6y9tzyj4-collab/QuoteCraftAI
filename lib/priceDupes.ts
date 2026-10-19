import type {PriceRule} from "./types";

// Пари схожих позицій прайсу з різною ставкою (напр. «Install Mirror (package)» $50 і «Install Bathroom Mirror» $75).
const FILLER=new Set(["and","the","a","an","of","for","with","to","on","in","per","package","pkg","new","existing","standard","basic","each","only","one"]);
const toks=(name:string)=>new Set(name.toLowerCase().replace(/\(.*?\)/g," ").replace(/&/g," and ").replace(/[^a-z0-9 ]+/g," ").split(/\s+/).map(w=>w.replace(/(ing|s)$/,"")).filter(w=>w.length>1&&!FILLER.has(w)));

const isPkg=(p:PriceRule)=>/package|повний ремонт/i.test(p.name+" "+(p.category||""));

export type DupePair={a:PriceRule;b:PriceRule;score:number};

export function findPriceDupes(prices:PriceRule[]):DupePair[]{
  const t=prices.map(p=>({p,s:toks(p.name)}));
  const out:DupePair[]=[];
  for(let i=0;i<t.length;i++)for(let j=i+1;j<t.length;j++){
    const A=t[i],B=t[j];
    if(A.p.unit!==B.p.unit||A.s.size<2||B.s.size<2)continue;
    let inter=0;A.s.forEach(w=>{if(B.s.has(w))inter++});
    const union=A.s.size+B.s.size-inter;
    const score=inter/union;
    // пакетна ціна для повного ремонту й окрема робота — різні речі, не дублікати
    if(isPkg(A.p)!==isPkg(B.p)||score<0.7)continue;
    const ra=A.p.rate||0,rb=B.p.rate||0;
    if(Math.abs(ra-rb)<=Math.max(ra,rb)*0.15)continue;
    out.push({a:A.p,b:B.p,score});
  }
  return out.sort((x,y)=>y.score-x.score);
}
