// Спільна геометрія ванної для обох AI-парсерів (Calculator і Estimates).
// ---------------------------------------------------------------------------
// Bathroom geometry for the package (br_*) items. The AI is bad at this math
// (it returned 26 sq ft of shower walls for a 106x60x91 bathroom), so when the
// speaker gives bathroom dimensions we compute every area deterministically
// the same way the owner's own spreadsheets do:
//   shower walls  = (short side + 2 * shower depth) * height   (3-wall alcove)
//   pan footprint = short side * shower depth
//   floor outside = L * W - pan footprint
//   paint area    = 2 * (L + W) * H - shower walls - door (20 sq ft) + ceiling
// ---------------------------------------------------------------------------
export type BathroomAreas={showerWalls:number;pan:number;floorTotal:number;floorOutside:number;paintArea:number;ceiling:number;note:string};

export function calculateBathroomAreas(text:string):BathroomAreas|null{
  const n=text.toLowerCase().replace(/,/g,".").replace(/[×х]/g,"x");
  if(!/bath|ванн|shower|душ/.test(n))return null;
  const room=n.match(/(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)/);
  const h=n.match(/(?:ceiling|height|стел\w*|висот\w*)[^0-9]{0,15}(\d+(?:\.\d+)?)/)||n.match(/(\d+(?:\.\d+)?)\s*(?:in|inch\w*|ft|feet|фут\w*|дюйм\w*)?\s*(?:ceiling|height|стел\w*|висот\w*)/);
  if(!room||!h)return null;
  const inches=/\binch\w*|дюйм\w*|"|\bin\b/.test(n)&&!/\bft\b|\bfeet\b|фут\w*/.test(n);
  const d=inches?12:1;
  let L=Number(room[1])/d,W=Number(room[2])/d;const H=Number(h[1])/d;
  if(![L,W,H].every(Number.isFinite)||L<=0||W<=0||H<=0)return null;
  if(W>L){const t=L;L=W;W=t}
  const depthMatch=n.match(/(?:shower\s+depth|depth|глибин\w*)[^0-9]{0,10}(\d+(?:\.\d+)?)\s*(inch\w*|in\b|"|дюйм\w*|ft|feet|фут\w*)?/);
  const depthDiv=depthMatch?(/^(inch|in|"|дюйм)/.test(depthMatch[2]||"")?12:/^(ft|feet|фут)/.test(depthMatch[2]||"")?1:d):1;
  const depth=depthMatch?Number(depthMatch[1])/depthDiv:30/12;
  const showerWalls=(W+2*depth)*H;
  const pan=W*depth;
  const floorTotal=L*W;
  const floorOutside=Math.max(0,floorTotal-pan);
  const ceiling=floorTotal;
  const paintArea=Math.max(0,2*(L+W)*H-showerWalls-20)+ceiling;
  const r=(x:number)=>Math.round(x*100)/100;
  return {showerWalls:r(showerWalls),pan:r(pan),floorTotal:r(floorTotal),floorOutside:r(floorOutside),paintArea:r(paintArea),ceiling:r(ceiling),
    note:`Verified bathroom geometry: ${r(L)} x ${r(W)} ft, height ${r(H)} ft, shower depth ${r(depth)} ft; shower walls ${r(showerWalls)} sq ft; pan ${r(pan)} sq ft; floor outside shower ${r(floorOutside)} sq ft; paint area incl. ceiling ${r(paintArea)} sq ft.`};
}

const SHOWER_WALL_IDS=["br_waterproof_panels_sqft","br_wall_tile_sqft","br_cement_board_wall_sqft","br_waterproof_membrane_sqft","br_demo_wall_tile_sqft","br_prime_sqft"];
const PAN_IDS=["br_pan_mosaic_sqft","br_ceiling_tile_sqft"];
const FLOOR_OUTSIDE_IDS=["br_floor_tile_sqft","br_cement_board_floor_sqft","br_floor_underlayment_sqft"];
const FLOOR_TOTAL_IDS=["br_demo_floor_sqft"];
const PAINT_IDS=["br_wall_repair_sqft","br_paint_sqft"];
const DIFFICULT_RE=/cramped|tight|awkward|difficult|hard access|custom|built-in|складн|тісн|незручн/;


// Коли AI вже вибрав пакетні позиції, решту робіт того ж кошторису він іноді
// бере зі «стандартного» каталогу (дорожчі ставки за окремий виклик). Тут
// такі позиції переводимо на пакетні відповідники; де є варіант стіна/підлога —
// вирішуємо за описом.
const FLOOR_RE=/floor|subfloor|plywood|підлог|фанер/i;
const STANDALONE_TO_PACKAGE:Record<string,string|{wall:string;floor:string}>={
  bathtub_remove_each:"br_demo_tub",
  vanity_remove_each:"br_demo_vanity",
  tile_remove_sqft:{wall:"br_demo_wall_tile_sqft",floor:"br_demo_floor_sqft"},
  drywall_remove_sqft:"br_demo_drywall_behind_tile_sqft",
  cement_board_install_sqft:{wall:"br_cement_board_wall_sqft",floor:"br_cement_board_floor_sqft"},
  tile_waterproofing_sqft:"br_waterproof_membrane_sqft",
  floor_leveling_sqft:"br_floor_leveling_sqft",
  subfloor_prep_sqft:"br_floor_prep",
  floor_tile_sqft:"br_floor_tile_sqft",
  wall_tile_sqft:"br_wall_tile_sqft",
  shower_niche_build_each:"br_niche",
  shower_niche_tile_each:"br_niche",
  shower_pan_build_each:"br_mud_pan_build",
  shower_drain_install_each:"br_drain_connect",
  shower_drain_relocate_each:"br_drain_relocate",
  shower_valve_roughin_each:"br_valve_replace",
  shower_trim_install_each:"br_valve_replace",
  water_lines_relocate_fixture:"br_valve_relocate",
  toilet_replace:"br_toilet_install_new",
  vanity_install:"br_vanity_install_single",
  vanity_plumbing_connect_each:"br_vanity_connect",
  bathroom_faucet_replace:"br_vanity_connect",
  bathroom_mirror_install_each:"br_mirror_install",
  medicine_cabinet_install_each:"br_medicine_cabinet",
  bathroom_accessories_set_each:"br_accessories",
  shower_glass_door_install_each:"br_shower_door_install",
  bath_fan_replace:"br_fan_replace",
  bath_fan_install_each:"br_fan_replace",
  light_fixture_replace:"br_light_replace",
  replace_outlet_each:"br_switch_outlet_replace",
  replace_switch_each:"br_switch_outlet_replace",
  outlet_new_each:"br_outlet_new",
  paint_walls_sqft:"br_paint_sqft",
  paint_ceiling_sqft:"br_paint_sqft",
  paint_door_each:"br_paint_doors",
  baseboard_install:"br_baseboard_install_paint",
  bathroom_final_cleanup_each:"br_debris_person_hour",
  acrylic_tub_install_each:"br_tub_install",
  wallpaper_remove_sqft:"br_demo_wall_tile_sqft",
};
function remapToPackage(result:any,idKey:"taskId"|"serviceId"){
  result.items.forEach((i:any)=>{
    const cur=String(i?.[idKey]||"");
    const target=STANDALONE_TO_PACKAGE[cur];
    if(!target)return;
    const text=`${i?.description||""} ${i?.note||""}`;
    const next=typeof target==="string"?target:(FLOOR_RE.test(text)?target.floor:target.wall);
    i[idKey]=next;
    if(cur==="paint_ceiling_sqft"||cur==="paint_walls_sqft")i.unit="sqft";
  });
  // унітаз: пакетні «зняти» + «поставити назад» замість одного standalone — коли AI
  // повернув лише пакетний install, а в тексті є зняття, додаємо br_toilet_remove
}

export function applyBathroomMeasurements(result:any,text:string,idKey:"taskId"|"serviceId"):{applied:boolean}{
  if(!Array.isArray(result?.items))return {applied:false};
  const id=(i:any)=>String(i?.[idKey]||"");
  const hasPackage=result.items.some((i:any)=>/^(br|kp)_/.test(id(i)));
  if(!hasPackage)return {applied:false};
  remapToPackage(result,idKey);
  // AI інколи дублює пакетну позицію (напр. «Install shower system» ще раз як
  // «removal included») — однакові id з однаковою кількістю лишаємо один раз.
  const seen=new Set<string>();
  result.items=result.items.filter((i:any)=>{
    const k=/^(br|kp)_/.test(id(i))?`${id(i)}|${Number(i?.quantity)||0}`:"";
    if(!k)return true;
    if(seen.has(k))return false;
    seen.add(k);return true;
  });
  // Package rates are already the owner's bundled prices — the AI must not
  // discount them further with "basic"; "difficult" only on the speaker's words.
  const allowDifficult=DIFFICULT_RE.test(text.toLowerCase());
  result.items.forEach((i:any)=>{
    if(/^(br|kp)_/.test(id(i))&&(i.difficulty==="basic"||(i.difficulty==="difficult"&&!allowDifficult)))i.difficulty="standard";
  });
  const g=calculateBathroomAreas(text);
  if(!g)return {applied:true};
  const set=(ids:string[],qty:number)=>{result.items.forEach((i:any)=>{if(ids.includes(id(i))){i.quantity=qty;i.unit="sqft";i.note=g.note;i.confidence=1}})};
  set(SHOWER_WALL_IDS,g.showerWalls);set(PAN_IDS,g.pan);set(FLOOR_OUTSIDE_IDS,g.floorOutside);set(FLOOR_TOTAL_IDS,g.floorTotal);set(PAINT_IDS,g.paintArea);
  // The AI sometimes drops the wall tile when panels are also mentioned.
  const n=text.toLowerCase();
  const has=(x:string)=>result.items.some((i:any)=>id(i)===x);
  if(/tile.{0,30}(shower )?wall|плитк\w*.{0,30}стін|стін\w*.{0,30}плитк/.test(n)&&!has("br_wall_tile_sqft")&&has("br_waterproof_panels_sqft")){
    const idx=result.items.findIndex((i:any)=>id(i)==="br_waterproof_panels_sqft");
    result.items.splice(idx+1,0,{[idKey]:"br_wall_tile_sqft",description:"Tile 3 shower walls to ceiling",quantity:g.showerWalls,unit:"sqft",difficulty:"standard",note:g.note,confidence:1});
  }
  return {applied:true};
}

