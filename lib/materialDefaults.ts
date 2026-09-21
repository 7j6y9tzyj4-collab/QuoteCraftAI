import type {PriceRule} from "./types";
const cents=(v:number)=>Math.round(v*100)/100;
export function materialDefaults(p:PriceRule):PriceRule{
 const specs:Record<string,[number,number,string]>={
 paint_walls_sqft:[37.98*2*1.1/400,37.98*2*1.1/250,"BEHR Premium Plus eggshell $37.98/gal, 2 шари, 250–400 sq ft/gal/шар, запас 10%. Лише фарба за витратою; ґрунт, плівка, стрічка й валики окремо. https://www.homedepot.com/p/202761520"],
 prime_surface_sqft:[23.98*1.1/400,23.98*1.1/300,"KILZ 2 $23.98/gal, 1 шар, 300–400 sq ft/gal, запас 10%. Лише ґрунт за витратою. https://www.homedepot.com/p/100096395"],
 drywall_install_sqft:[13.48/32,13.48/32,"Лише drywall 1/2 in 4×8 ft $13.48/лист, за витратою, без запасу. Кріплення окремо. https://www.homedepot.com/p/202530243"],
 cement_board_install_sqft:[15.85/15,15.85/15,"Лише Durock 3×5 ft $15.85/лист, без запасу. Спеціальні гвинти, стрічка й розчин окремо. https://www.homedepot.com/p/304163165"],
 subfloor_osb_sqft:[20.28/32,20.28/32,"Лише OSB $20.28/лист 4×8 ft, без запасу. Клей і кріплення окремо. https://www.homedepot.com/p/100054132"],
 sheet_membrane_sqft:[123.95/54,123.95/54,"Лише KERDI $123.95/54 sq ft, без нахльостів, кутів і розчину. https://www.homedepot.com/p/202608388"],
 lvp_install_sqft:[59.97/20.1,59.97/20.1,"Приклад: Lifeproof Sterling Oak 22 MIL $59.97/20.1 sq ft. Без запасу; вибери свою модель. Пороги й підкладка за потреби окремо. https://www.homedepot.com/p/309083456"],
 replace_outlet_each:[1.50,1.50,"Лише Leviton TR 15 A. Накладка та інші компоненти окремо. https://www.homedepot.com/p/100662608"],
 replace_switch_each:[.85,.85,"Лише Leviton single-pole 15 A. Накладка та інші компоненти окремо. https://www.homedepot.com/p/100026991"],
 gfci_install_each:[23.48,23.48,"Лише Leviton GFCI TR 15 A. Перевір комплектацію. https://www.homedepot.com/p/206860596"],
 dimmer_install_each:[28.37,28.37,"Лише Lutron Diva LED+. Перевір сумісність і комплектацію. https://www.homedepot.com/p/203670402"],
 toilet_replace:[4.45,4.45,"Лише кільце й болти Oatey Johni-Ring. Унітаз і підводка НЕ включені. https://www.homedepot.com/p/312148579"]
 };
 const spec=specs[p.id];if(!spec)return p;
 return {...p,materialMin:cents(spec[0]),materialMax:cents(spec[1]),materialRate:cents(spec[1]),materialStatus:"partial",materialNote:spec[2]+" Ціну перевірено 14.09.2026, ZIP 60171. Для купівлі цілих упаковок використай калькулятор упаковок."};
}
