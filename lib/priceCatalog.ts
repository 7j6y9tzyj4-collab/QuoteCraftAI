import type {PriceRule} from "./types";
export const categories=["Ванна: обладнання","Демонтаж і прибирання","Двері","Гіпсокартон","Електрика та вентиляція","Підлога","Утеплення","Кухня","Фарбування та підготовка","Сантехніка","Плитка та гідроізоляція","Столярні роботи","Інші роботи"];
export function categoryOf(p:PriceRule):string{
 if(p.category)return p.category;
 const id=p.id;
 if(/paint|prime|stain|wallpaper|protect_room|fill_nail|caulk_trim/.test(id))return categories[0];
 if(/drywall|skim/.test(id))return categories[1];
 if(/tile|waterproof|niche|bench|backer|cement_board/.test(id))return categories[2];
 if(/floor|lvp|laminate|underlayment|carpet/.test(id))return categories[3];
 if(/light|electrical|outlet|switch|gfci|dimmer|circuit|fan|towel_warmer/.test(id))return categories[5];
 if(/glass|mirror|holder|towel_bar|robe_hook|accessories/.test(id))return categories[7];
 if(/sink|faucet|toilet|tub|shower|plumb|drain|water_lines|disposal/.test(id))return categories[4];
 if(/door|cabinet|vanity|shel|baseboard|trim|quarter_round/.test(id))return categories[6];
 if(/remove|demo|debris|cleanup|haul/.test(id))return categories[8];
 return categories[9];
}
export const bounds=(p:PriceRule)=>({min:p.rateMin??p.rate,max:p.rateMax??p.rate});
export function validPrice(p:PriceRule){const b=bounds(p);return [p.rate,b.min,b.max].every(n=>Number.isFinite(n)&&n>=0)&&b.min<=p.rate&&p.rate<=b.max;}
export function matches(p:PriceRule,query:string){return [p.name,p.id,categoryOf(p),...p.aliases].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());}
