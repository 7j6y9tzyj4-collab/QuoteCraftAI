import type {PriceRule} from "./types";
export type PriceReference={low:number;high:number;suggested:number;source:string;url:string;scope:string;checked:string;selection:string};
const homer="https://www.homerfixeditall.com/pricing";
const talents="https://www.thumbtack.com/il/chicago/electrical-repairs/5-talents-renovations/service/539904503615225868";
const h=(low:number,high:number,suggested:number,scope:string,selection="Вибрана ставка всередині прайсу; не середня ціна міста."):PriceReference=>({low,high,suggested,scope,source:"Homer Fixed It · Chicago",url:homer,checked:"2026-09-14",selection});
const t=(rate:number,scope:string):PriceReference=>({low:rate,high:rate,suggested:rate,scope,source:"5 Talents Renovations · Thumbtack · Chicago",url:talents,checked:"2026-09-14",selection:"Опублікована ставка виконавця; не середня ціна міста."});
export const chicagoPrices:Record<string,PriceReference>={
 bathroom_mirror_install_each:h(35,100,75,"Готове дзеркало; важкі/нестандартні вироби потребують окремої оцінки.","Узгоджена з власником ставка $75 у межах прайсу."),
 vanity_light_install_each:h(100,250,125,"Звичайний світильник на готовому підключенні. Нова проводка окремо.","Узгоджена ставка $125. Орієнтир для світильників загалом, не окрема ціна для кожної моделі."),
 light_fixture_replace:h(100,250,125,"Проста заміна на готовому підключенні.","Узгоджена з власником ставка $125 у межах прайсу."),
 toilet_paper_holder_install_each:h(35,60,45,"Один звичайний аксесуар ванної."),
 towel_bar_install_each:h(35,60,45,"Один звичайний аксесуар ванної."),
 robe_hook_install_each:h(35,60,45,"Один звичайний аксесуар ванної."),
 shower_head_install_each:h(50,100,75,"Заміна душової головки на готовій трубі."),
 ceiling_fan_replace:h(150,300,225,"Заміна звичайного стельового вентилятора; опора й живлення готові."),
 garbage_disposal_replace:h(150,250,200,"Заміна подрібнювача на готових підключеннях."),
 replace_outlet_each:t(100,"Заміна наявної стандартної розетки; у прайсі матеріали/кріплення включені, де не зазначено інше."),
 replace_switch_each:t(100,"Заміна наявного стандартного вимикача; у прайсі матеріали/кріплення включені, де не зазначено інше."),
 gfci_install_each:t(150,"Саме заміна наявної GFCI; нова точка потребує окремої оцінки. У прайсі матеріали/кріплення включені, де не зазначено інше."),
 bath_fan_replace:t(300,"Заміна вентилятора ванної; новий канал вентиляції окремо. Сам вентилятор не включений."),
 underlayment_install_sqft:t(1.5,"Монтаж підкладки за sq ft; матеріал підкладки не включений.")
};
export function applyChicagoPrices(prices:PriceRule[]):PriceRule[]{
 return prices.map(p=>chicagoPrices[p.id]?{...p,rate:chicagoPrices[p.id].suggested,rateMin:chicagoPrices[p.id].low,rateMax:chicagoPrices[p.id].high}:p);
}
