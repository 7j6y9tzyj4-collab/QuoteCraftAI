// «Supplied by customer»: що клієнт купує сам. Оздоблення (Finish) для таких рядків = 0.
// І навпаки: якщо власник нічого такого не казав, AI не має писати «supplied» у примітках,
// бо це суперечить колонці Finish у кошторисі.

const GROUPS:Array<{words:RegExp;match:RegExp}>=[
  {words:/tile|плитк|мозаїк|mosaic/,match:/tile|mosaic|плитк|мозаїк|backsplash/},
  {words:/vanit|тумб/,match:/vanity_install|vanity_top/},
  {words:/faucet|кран|змішувач|valve|shower (?:system|trim|head)/,match:/faucet|valve|shower_system|shower_trim|shower_head|vanity_connect/},
  {words:/toilet|унітаз/,match:/toilet/},
  {words:/mirror|дзеркал/,match:/mirror/},
  {words:/medicine|аптечк|linen|пенал/,match:/medicine|tall_cabinet/},
  {words:/light|fixture|світильн|лампа/,match:/light/},
  {words:/fan|вентилятор|витяжк/,match:/fan|hood/},
  {words:/accessor|аксесуар|towel|рушник/,match:/accessor|towel|robe|paper_holder/},
  {words:/glass|скл|shower door|двері душ/,match:/glass|shower_door|enclosure/},
  {words:/\btub\b|bathtub|ванну\b|ванна\b/,match:/tub_install|acrylic_tub|freestanding_tub/},
  {words:/\blvp\b|vinyl|ламінат|вініл|floor(?:ing)?\b/,match:/lvp/},
  {words:/\bdoor\b|двері/,match:/door_install|pocket_door|barn_door/},
  {words:/outlet|switch|розетк|вимикач/,match:/outlet|switch|gfci|dimmer/},
  {words:/paint|фарб/,match:/paint/},
];

const SUPPLY_RE=/(?:supplied|provided|bought|purchased)\s+by\s+(?:the\s+)?(?:customer|client|owner|homeowner)|customer[-\s]supplied|client[-\s]supplied|(?:customer|client|owner|homeowner)\s+(?:supplies|provides|buys|purchases|will\s+(?:buy|supply|provide|purchase))|клієнт\w*\s+(?:купує|купить|дає|надає|привезе|сам)|(?:купує|купить|надає)\s+клієнт|свої\w*\s+(?:матеріал|плитк)|від\s+клієнта/i;
const ALL_RE=/(?:all|every)\s+(?:finish(?:es)?|fixtures|finish materials|materials)|всі\s+(?:матеріали|прилади|оздоблення)|все\s+купує/i;

/** які групи товарів власник назвав «купує клієнт» (по реченнях) */
export function customerSuppliedGroups(text:string):{all:boolean;groups:RegExp[]}{
  const groups:RegExp[]=[];let all=false;
  // Дивимось лише на фрагмент біля «supplied by customer»: сам фрагмент між комами +
  // короткі сусідні фрагменти-перелік («vanity, mirror and toilet supplied by customer»).
  // Довге речення через коми не повинно цілком ставати «купує клієнт».
  for(const sentence of text.toLowerCase().split(/[.;\n!?]+/)){
    const parts=sentence.split(/,/).map(p=>p.trim());
    parts.forEach((part,idx)=>{
      if(!SUPPLY_RE.test(part))return;
      const scope=[part];
      for(let k=idx-1;k>=0&&parts[k].split(/\s+/).filter(Boolean).length<=3;k--)scope.push(parts[k]);
      const txt=scope.join(" , ");
      if(ALL_RE.test(txt))all=true;
      for(const g of GROUPS)if(g.words.test(txt))groups.push(g.match);
    });
  }
  // «her door», «his own vanity», «її двері» — річ клієнта; дивимось лише на слово після присвійного
  const POSS_RE=/(?:^|[^a-zа-яіїєґ'])(?:her|his|their|customer'?s|client'?s|homeowner'?s|owner'?s|її|його|їхн\w*)\s+(?:own\s+)?([a-zа-яіїєґ']+)/gi;
  for(const m of text.toLowerCase().matchAll(POSS_RE)){
    for(const g of GROUPS)if(g.words.test(m[1]))groups.push(g.match);
  }
  return {all,groups};
}

// «supplied by the customer» — прибрати; «(customer-)supplied X» → «new X»
const cleanSupplied=(t:string)=>{
  let out=t.replace(/\s*,?\s*\b(?:supplied|provided)\s+by\s+(?:the\s+)?(?:customer|client|owner|homeowner)\b/gi,"")
    .replace(/\b(?:customer|client)[-\s]supplied\b/gi,"new")
    .replace(/\bsupplied\b/gi,"new")
    .replace(/\bnew\s+new\b/gi,"new")
    .replace(/\s{2,}/g," ").replace(/\s+([.,])/g,"$1").trim();
  return out.charAt(0).toUpperCase()+out.slice(1);
};

export function applyCustomerSupplied(result:any,text:string,idKey:"taskId"|"serviceId"){
  if(!Array.isArray(result?.items))return;
  const {all,groups}=customerSuppliedGroups(text);
  const anySupply=all||groups.length>0;
  for(const i of result.items){
    const id=String(i?.[idKey]||"");
    // звіряємо з кодом позиції, а не з описом («faucet for vanity» — це кран, а не тумба)
    const hay=id==="CUSTOM"?String(i?.description||"").toLowerCase():id;
    const supplied=all||groups.some(g=>g.test(hay));
    if(supplied)i.customerSupplied=true;
    // AI не має сам вигадувати «supplied», якщо власник цього не казав
    if(!supplied){
      for(const k of ["note","description"])if(typeof i[k]==="string")i[k]=cleanSupplied(i[k]);
    }
  }
  return anySupply;
}
