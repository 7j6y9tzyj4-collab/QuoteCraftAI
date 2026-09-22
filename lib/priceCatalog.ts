import type {PriceRule} from "./types";
export const categories=["Ванна: обладнання","Демонтаж і прибирання","Двері","Гіпсокартон","Електрика та вентиляція","Підлога","Утеплення","Кухня","Фарбування та підготовка","Сантехніка","Плитка та гідроізоляція","Столярні роботи","Інші роботи"];
export function categoryOf(p:PriceRule):string{
 if(p.category)return p.category;
 // Запасний варіант лише для позицій, доданих вручну або збережених під
 // старим id. Категорії названі явно — раніше бралися за номером у списку,
 // і після зміни списку все їхало не туди.
 const id=p.id;
 if(/paint|prime|stain|wallpaper|protect_room|fill_nail|caulk_trim/.test(id))return "Фарбування та підготовка";
 if(/drywall|skim/.test(id))return "Гіпсокартон";
 if(/insulat/.test(id))return "Утеплення";
 if(/tile|waterproof|niche|bench|backer|cement_board|grout|schluter|membrane|backsplash/.test(id))return "Плитка та гідроізоляція";
 if(/floor|lvp|laminate|underlayment|carpet|subfloor|transition/.test(id))return "Підлога";
 if(/light|electrical|outlet|switch|gfci|dimmer|circuit|fan|towel_warmer|recessed/.test(id))return "Електрика та вентиляція";
 if(/sink|faucet|toilet|tub|shower_valve|shower_trim|shower_head|handheld|plumb|drain|water_lines|disposal|dishwasher/.test(id))return "Сантехніка";
 if(/kitchen|cabinet|countertop|range_hood|hardware/.test(id))return "Кухня";
 if(/glass|mirror|holder|towel_bar|robe_hook|accessories|medicine|vanity|shower|bathtub|bathroom/.test(id))return "Ванна: обладнання";
 if(/door/.test(id))return "Двері";
 if(/baseboard|trim|quarter_round|casing|shoe_molding|caulk/.test(id))return "Столярні роботи";
 if(/remove|demo|debris|cleanup|haul|move_furniture/.test(id))return "Демонтаж і прибирання";
 return "Інші роботи";
}
export const bounds=(p:PriceRule)=>({min:p.rateMin??p.rate,max:p.rateMax??p.rate});
export function validPrice(p:PriceRule){const b=bounds(p);return [p.rate,b.min,b.max].every(n=>Number.isFinite(n)&&n>=0)&&b.min<=p.rate&&p.rate<=b.max;}
export function matches(p:PriceRule,query:string){return [p.name,p.id,categoryOf(p),...p.aliases].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());}
