// Автотест цін: п'ять реальних кошторисів власника + кімната 10x10.
// Запуск: npm run verify. Падає, якщо будь-який підсумок зсунувся більш ніж на $0.01.
import {catalog} from "../lib/catalog.ts";
import {computeCalcTotals} from "../lib/calcEngine.ts";
import type {CalcItem} from "../lib/calcTypes.ts";

const byId=new Map(catalog.map(t=>[t.id,t]));
function item(id:string,quantity:number,difficulty:"basic"|"standard"|"difficult"="standard"):CalcItem{
  const t=byId.get(id); if(!t)throw new Error("нема позиції "+id);
  return {id,taskId:id,name:t.name,category:t.category,unit:t.unit,quantity,difficulty,laborRate:t.laborRate,materialRate:t.materialRate,suppliesPct:t.suppliesPct,suppliesFixed:t.suppliesFixed,minPrice:t.minPrice,difficultyMultipliers:t.difficultyMultipliers,lowMult:t.lowMult,highMult:t.highMult,notes:t.notes};
}
type Case={name:string;items:[string,number][];labor:number;materials:number};
const cases:Case[]=[
 {name:"Sumit 1 (basement, файл $7,986)",labor:7751.26,materials:2202.56,items:[["br_demo_bathroom_full",1],["br_wall_prep",1],["br_waterproof_panels_sqft",75.83],["br_wall_tile_sqft",75.83],["br_prefab_pan_install",1],["br_pan_mosaic_sqft",12.5],["br_drain_relocate",1],["br_valve_relocate",1],["br_floor_prep",1],["br_floor_tile_sqft",31.67],["br_fan_replace",1],["br_wall_repair_sqft",158.14],["br_paint_sqft",158.14],["br_trim",1],["br_vanity_install_single",1],["br_vanity_connect",1],["br_mirror_replace",1],["br_accessories",1],["br_light_replace",1],["br_switch_outlet_replace",2],["br_toilet_remove",1],["br_toilet_reinstall",1]]},
 {name:"Antaash (parents, файл $8,070)",labor:8131,materials:1511.65,items:[["br_demo_shower_cabin",1],["br_valve_relocate",1],["br_wall_prep",1],["br_niche",1],["br_cement_board_wall_sqft",66],["br_waterproof_membrane_sqft",66],["br_wall_tile_sqft",66],["br_ceiling_prep",1],["br_ceiling_tile_sqft",13],["br_curbless_pan",1],["br_drain_connect",1],["br_valve_replace",1],["br_demo_floor_sqft",59],["br_cement_board_floor_sqft",59],["br_floor_tile_sqft",59],["br_fan_replace",1],["br_demo_vanity",1],["br_vanity_install_single",1],["br_vanity_connect",1],["br_medicine_cabinet",1],["br_mirror_replace",1],["br_accessories",1],["br_light_replace",2],["br_shower_door_install",1],["br_paint_doors",1],["br_toilet_remove",1],["br_toilet_reinstall",1]]},
 {name:"Crystal (файл $10,070)",labor:10089.5,materials:1633.25,items:[["br_demo_tub_shower",1],["br_toilet_remove",1],["br_demo_vanity_set",1],["br_demo_wall_tile_sqft",80],["br_demo_drywall_behind_tile_sqft",100],["br_demo_floor_sqft",59],["br_cement_board_floor_sqft",59],["br_floor_leveling_sqft",59],["br_waterproof_membrane_sqft",59],["br_floor_tile_sqft",45],["br_cement_board_wall_sqft",103],["br_waterproof_membrane_sqft",100],["br_wall_tile_sqft",127],["br_window_return_trim",1],["br_tile_hole_cut",9],["br_wallpaper_prep",1],["br_wallpaper_sqft",90],["br_ceiling_prep_paint",1],["br_door_repair_repaint",1],["br_baseboard_install_paint",1],["br_electrical_allowance",1],["br_plumbing_sub",1],["br_tub_install",1],["br_sewer_renovation",2],["br_shower_door_install",1],["br_shower_system_install",1],["br_vanity_install_single",1],["br_mirror_install",1],["br_tall_cabinet_medicine",1],["br_ceiling_repair_other_room",1]]},
 {name:"Antaash kitchen (файл $8,100–9,900)",labor:9252.4,materials:1126.6,items:[["kp_cabinets_demo",1],["kp_cabinet_install_hour",20],["kp_appliance_connect",4],["kp_backsplash_sqft",30],["kp_floor_demo_wood_sqft",258],["kp_cement_board_floor_sqft",252],["kp_floor_tile_sqft",252],["kp_baseboard_repair_paint",1],["kp_paint_door",3],["kp_light_replace",7],["kp_fan_replace",3]]},
 {name:"Кімната 10x10, стіни + стеля",labor:430,materials:0,items:[["paint_walls_sqft",320],["paint_ceiling_sqft",100]]},
];
let failed=0;
for(const c of cases){
  const t=computeCalcTotals(c.items.map(([id,q])=>item(id,q)),1);
  const ok=Math.abs(t.labor-c.labor)<0.01&&Math.abs(t.materials-c.materials)<0.01&&t.supplies<0.005;
  console.log((ok?"OK  ":"FAIL")+"  "+c.name+`: labor ${t.labor.toFixed(2)} (очік. ${c.labor.toFixed(2)}), materials ${t.materials.toFixed(2)} (очік. ${c.materials.toFixed(2)}), supplies ${t.supplies.toFixed(2)}`);
  if(!ok)failed++;
}
// інваріанти каталогу
const bad=catalog.filter(t=>Math.abs(t.laborRate-t.rate)>0.005||t.suppliesPct!==0||t.suppliesFixed!==0);
if(bad.length){failed++;console.log("FAIL  ставка ≠ праця або є витратні у: "+bad.map(t=>t.id).slice(0,10).join(", ")+(bad.length>10?" …":"")+` (${bad.length})`);}
else console.log("OK    усі позиції: праця = ставка, витратних нема ("+catalog.length+" позицій)");
const dup=catalog.map(t=>t.id).filter((id,i,a)=>a.indexOf(id)!==i);
if(dup.length){failed++;console.log("FAIL  дублікати id: "+dup.join(", "));}
console.log(failed?`\n${failed} помилок`:"\nУсе збігається");
process.exit(failed?1:0);
