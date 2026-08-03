import type {PriceRule} from "./types";

export const defaults:PriceRule[]=[
{id:"paint_door_each",name:"Paint door",aliases:["paint door","paint doors","пофарбувати двері","фарбування дверей"],unit:"each",rate:150},
{id:"paint_door_frame_each",name:"Paint door frame",aliases:["paint door frame","paint door casing","пофарбувати дверну коробку","фарбування дверної коробки"],unit:"each",rate:100},
{id:"paint_baseboards_linear_ft",name:"Paint baseboards",aliases:["paint baseboards","paint trim","пофарбувати плінтуси","фарбування плінтусів"],unit:"linear_ft",rate:2.5},
{id:"paint_window_each",name:"Paint window",aliases:["paint window","paint windows","пофарбувати вікно","пофарбувати вікна","фарбування вікна","фарбування вікон"],unit:"each",rate:100},
{id:"replace_outlet_each",name:"Replace electrical outlet",aliases:["replace outlet","electrical outlet","outlet","розетка","розетки","замінити розетку"],unit:"each",rate:75},
{id:"replace_switch_each",name:"Replace light switch",aliases:["replace switch","light switch","switch","вимикач","вимикачі","замінити вимикач"],unit:"each",rate:75},
{id:"kitchen_faucet_replace",name:"Replace kitchen faucet",aliases:["kitchen faucet","кухонний кран","кран на кухні","змішувач на кухні"],unit:"each",rate:250},
{id:"bathroom_faucet_replace",name:"Replace bathroom faucet",aliases:["bathroom faucet","кран у ванній","змішувач у ванній"],unit:"each",rate:225},
{id:"bath_fan_replace",name:"Replace bathroom exhaust fan",aliases:["bath fan","exhaust fan","вентилятор у ванній","витяжний вентилятор"],unit:"each",rate:225},
{id:"ceiling_fan_replace",name:"Replace ceiling fan",aliases:["ceiling fan","стельовий вентилятор","вентилятор на стелі"],unit:"each",rate:250},
{id:"paint_walls_sqft",name:"Paint walls",aliases:["paint walls","фарбування стін","пофарбувати стіни"],unit:"sqft",rate:2.5},
{id:"paint_wall_each",name:"Paint one wall",aliases:["paint one wall","пофарбувати одну стіну"],unit:"each",rate:250},
{id:"paint_room",name:"Paint room walls",aliases:["paint room","пофарбувати кімнату"],unit:"room",rate:650},
{id:"paint_ceiling_sqft",name:"Paint ceiling",aliases:["paint ceiling","фарбування стелі","пофарбувати стелю"],unit:"sqft",rate:2.75},
{id:"lvp_install_sqft",name:"Install LVP / laminate flooring",aliases:["lvp","laminate","ламінат","вінілова підлога"],unit:"sqft",rate:6},
{id:"floor_tile_sqft",name:"Install floor tile",aliases:["floor tile","плитка на підлогу"],unit:"sqft",rate:18},
{id:"wall_tile_sqft",name:"Install wall tile",aliases:["wall tile","плитка на стіну"],unit:"sqft",rate:22},
{id:"toilet_replace",name:"Remove and install toilet",aliases:["replace toilet","замінити унітаз","встановити унітаз"],unit:"each",rate:180},
{id:"vanity_install",name:"Install bathroom vanity",aliases:["install vanity","встановити тумбу","тумба у ванну"],unit:"each",rate:350},
{id:"drywall_minor",name:"Minor drywall repair",aliases:["drywall repair","ремонт гіпсокартону","шпаклювання"],unit:"each",rate:250},
{id:"door_install",name:"Install interior door",aliases:["interior door","міжкімнатні двері","встановити двері"],unit:"each",rate:350},
{id:"baseboard_install",name:"Install baseboard",aliases:["baseboard","плінтус"],unit:"linear_ft",rate:4.5},
{id:"garbage_disposal_replace",name:"Replace garbage disposal",aliases:["garbage disposal","подрібнювач відходів"],unit:"each",rate:250},
{id:"light_fixture_replace",name:"Replace light fixture",aliases:["light fixture","світильник","люстра"],unit:"each",rate:175}
];
