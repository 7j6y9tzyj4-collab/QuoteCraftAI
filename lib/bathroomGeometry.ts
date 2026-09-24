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
  let depth=depthMatch?Number(depthMatch[1])/depthDiv:30/12;
  // Окремий душ «shower 40x36 inches» — ширина × глибина; без цього вважаємо
  // нішу під ванну по короткій стіні кімнати.
  const sm=n.match(/shower\s+(?:stall\s+|size\s+)?(\d+(?:\.\d+)?)\s*(?:x|на|by)\s*(\d+(?:\.\d+)?)\s*(inch\w*|in\b|"|дюйм\w*|ft|feet|фут\w*)?/);
  let showerW=W;
  if(sm){
    const div=/^(inch|in|"|дюйм)/.test(sm[3]||"")?12:/^(ft|feet|фут)/.test(sm[3]||"")?1:d;
    showerW=Number(sm[1])/div;depth=Number(sm[2])/div;
  }
  // «2 shower walls» / «2-wall» / «дві стіни» — кутовий душ зі склом на дві сторони
  const twoWalls=/\b(2|two|дв[іа])[\s-]*(shower\s+)?walls?\b|2-wall|двостінн/.test(n);
  const showerWalls=(twoWalls?showerW+depth:showerW+2*depth)*H;
  const pan=showerW*depth;
  const floorTotal=L*W;
  const floorOutside=Math.max(0,floorTotal-pan);
  const ceiling=floorTotal;
  const paintArea=Math.max(0,2*(L+W)*H-showerWalls-20)+ceiling;
  const r=(x:number)=>Math.round(x*100)/100;
  return {showerWalls:r(showerWalls),pan:r(pan),floorTotal:r(floorTotal),floorOutside:r(floorOutside),paintArea:r(paintArea),ceiling:r(ceiling),
    note:`Verified bathroom geometry: ${r(L)} x ${r(W)} ft, height ${r(H)} ft, shower ${r(showerW)} x ${r(depth)} ft (${twoWalls?2:3} tiled walls); shower walls ${r(showerWalls)} sq ft; pan ${r(pan)} sq ft; floor outside shower ${r(floorOutside)} sq ft; paint area incl. ceiling ${r(paintArea)} sq ft.`};
}

const SHOWER_WALL_IDS=["br_waterproof_panels_sqft","br_wall_tile_sqft","br_cement_board_wall_sqft","br_waterproof_membrane_sqft","br_demo_wall_tile_sqft","br_prime_sqft"];
const PAN_IDS=["br_pan_mosaic_sqft","br_ceiling_tile_sqft"];
const FLOOR_OUTSIDE_IDS=["br_floor_tile_sqft","br_cement_board_floor_sqft","br_floor_underlayment_sqft"];
const FLOOR_TOTAL_IDS=["br_demo_floor_sqft"];
const PAINT_IDS=["br_wall_repair_sqft","br_paint_sqft"];
const DIFFICULT_RE=/cramped|tight|awkward|difficult|hard access|\bcustom\b(?![-\s]?supplied)|built-in|складн|тісн|незручн/;


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
  shower_glass_panel_install_each:"br_glass_enclosure_2wall_install",
  frameless_glass_enclosure_install_each:"br_glass_enclosure_2wall_install",
  demo_general_sqft:"br_demo_partition_wall",
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


// AI (gpt-4.1-mini) регулярно «губить» 2–4 дрібні позиції з довгого опису.
// Для найтиповіших робіт перевіряємо текст напряму і додаємо пропущене.
const ENSURE:Array<{re:RegExp;id:string;desc:string;qty?:RegExp}>=[
  {re:/partition wall|перегородк/,id:"br_demo_partition_wall",desc:"Remove partition wall, patch ceiling, wall and floor"},
  {re:/medicine cabinet|аптечк/,id:"br_medicine_cabinet",desc:"Install medicine cabinet"},
  {re:/accessories|аксесуар/,id:"br_accessories",desc:"Install bathroom accessories"},
  {re:/glass (shower )?enclosure|2-wall glass|скляну? кабін/,id:"br_glass_enclosure_2wall_install",desc:"Install 2-wall glass shower enclosure"},
  {re:/glass door|двері душу|скляні двері/,id:"br_shower_door_install",desc:"Install shower glass door"},
  {re:/niche|ніш/,id:"br_niche",desc:"Build and tile shower niche"},
  {re:/mosaic|мозаїк/,id:"br_pan_mosaic_sqft",desc:"Mosaic on shower pan"},
  {re:/\bfan\b|вентилятор/,id:"br_fan_replace",desc:"Replace bath fan"},
  {re:/mirror|дзеркал/,id:"br_mirror_install",desc:"Install mirror"},
  {re:/light fixture|світильник/,id:"br_light_replace",desc:"Replace light fixture",qty:/(\d+)\s*light/},
  {re:/switch|outlet|розетк|вимикач/,id:"br_switch_outlet_replace",desc:"Replace switches / outlets",qty:/(\d+)\s*(?:switch|outlet|розет|вимик)/},
  {re:/toilet|унітаз/,id:"br_toilet_remove",desc:"Remove toilet"},
  {re:/reinstall(?:ing)? (?:the )?toilet|toilet back|унітаз назад|поставити унітаз/,id:"br_toilet_reinstall",desc:"Reinstall toilet after tiling"},
  {re:/baseboard|плінтус/,id:"br_baseboard_install_paint",desc:"Install and paint baseboard"},
  {re:/vanity|тумб/,id:"br_vanity_install_single",desc:"Install vanity"},
  {re:/faucet and drain|connect faucet|підключ\w+ кран/,id:"br_vanity_connect",desc:"Connect faucet and drain for vanity"},
  {re:/shower drain|дренаж/,id:"br_drain_connect",desc:"Connect shower drain"},
  {re:/valve|змішувач/,id:"br_valve_replace",desc:"Replace shower valve and head"},
  {re:/prepare floor|floor prep|підготов\w+ підлог/,id:"br_floor_prep",desc:"Prepare floor base after demolition"},
];
// «Glass enclosure by glass company, not included» — скло не рахуємо зовсім
const GLASS_RE=/glass|скл/;
const EXCLUDED_RE=/not included|excluded|by (?:the |a )?glass company|by others|separate(?:ly)?|не входить|не рахува|окремо|скляна компанія|скляної компанії/;
export function glassExcluded(text:string){
  return text.toLowerCase().split(/[.;\n!?]+/).some(c=>GLASS_RE.test(c)&&EXCLUDED_RE.test(c));
}
const GLASS_IDS=new Set(["br_glass_enclosure_2wall_install","br_shower_door_install"]);

function ensurePackageItems(result:any,text:string,idKey:"taskId"|"serviceId"){
  const n=text.toLowerCase();
  if(glassExcluded(text))result.items=result.items.filter((i:any)=>!GLASS_IDS.has(String(i?.[idKey]||"")));
  // «full demo including the partition wall» — перегородка вже в ціні демонтажу, окремо не рахуємо
  const partitionInDemo=/(?:demo|demolition|демонтаж)[^.;]{0,100}(?:including|incl\.?|together with|with|разом з|включно з|разом із)[^.;]{0,40}(?:partition|перегородк)/.test(n);
  if(partitionInDemo)result.items=result.items.filter((i:any)=>String(i?.[idKey]||"")!=="br_demo_partition_wall");
  const id=(i:any)=>String(i?.[idKey]||"");
  const has=(x:string)=>result.items.some((i:any)=>id(i)===x);
  // мірні альтернативи: якщо є «relocate valve», не додаємо «replace valve»; якщо є нова
  // тумба з подвійною мийкою — не додаємо одинарну і т.д.
  const alt:Record<string,string[]>={br_valve_replace:["br_valve_relocate","br_shower_system_install"],br_drain_connect:["br_drain_relocate"],br_vanity_install_single:["br_vanity_install_double"],br_mirror_install:["br_mirror_replace"],br_toilet_remove:["br_demo_bathroom_full"],br_toilet_reinstall:["br_toilet_install_new"],br_fan_replace:["bath_fan_install_each"],br_shower_door_install:["br_glass_enclosure_2wall_install"]};
  const noGlass=glassExcluded(text);
  for(const e of ENSURE){
    if(!e.re.test(n)||has(e.id)||(alt[e.id]||[]).some(has))continue;
    if(noGlass&&GLASS_IDS.has(e.id))continue;
    if(partitionInDemo&&e.id==="br_demo_partition_wall")continue;
    const q=e.qty?Number((n.match(e.qty)||[])[1])||1:1;
    result.items.push({[idKey]:e.id,description:e.desc,quantity:q,unit:/_sqft$/.test(e.id)?"sqft":"each",difficulty:"standard",note:null,confidence:0.8});
  }
}

export function applyBathroomMeasurements(result:any,text:string,idKey:"taskId"|"serviceId"):{applied:boolean}{
  if(!Array.isArray(result?.items))return {applied:false};
  const id=(i:any)=>String(i?.[idKey]||"");
  const hasPackage=result.items.some((i:any)=>/^(br|kp)_/.test(id(i)));
  if(!hasPackage)return {applied:false};
  remapToPackage(result,idKey);
  ensurePackageItems(result,text,idKey);
  // Разові роботи на ванну — завжди кількість 1 («2 shower walls» — не кількість).
  const LS_ONE=new Set(["br_demo_bathroom_full","br_wall_prep","br_floor_prep","br_ceiling_prep","br_wallpaper_prep","br_baseboard_install_paint","br_trim","br_electrical_allowance","br_plumbing_sub","br_demo_partition_wall","br_mud_pan_build","br_prefab_pan_install","br_curbless_pan","br_plastic_tray_install","br_glass_enclosure_2wall_install","br_shower_door_install","br_ceiling_drywall","br_ceiling_prep_paint","br_ceiling_repair_other_room","br_tub_install","br_demo_tub","br_demo_tub_shower","br_demo_vanity","br_demo_vanity_set","br_demo_shower_cabin","br_demo_soffit","br_vanity_install_single","br_vanity_install_double","br_vanity_connect","br_valve_replace","br_valve_relocate","br_shower_system_install","br_drain_connect","br_drain_relocate","br_fan_replace","br_toilet_remove","br_toilet_reinstall","br_toilet_install_new","br_mirror_install","br_mirror_replace","br_medicine_cabinet","br_accessories","br_tall_cabinet_medicine","br_window_detail","br_window_return_trim","br_wood_frame_tub","br_tub_pipes","br_tub_drain","kp_cabinets_demo","kp_baseboard_repair_paint"]);
  result.items.forEach((i:any)=>{if(LS_ONE.has(id(i)))i.quantity=1});
  // Повний демонтаж уже включає плитку, ванну, тумбу — окремі демонтажі прибираємо.
  const hasId=(x:string)=>result.items.some((i:any)=>id(i)===x);
  if(hasId("br_demo_bathroom_full")){
    const included=new Set(["br_demo_wall_tile_sqft","br_demo_floor_sqft","br_demo_drywall_behind_tile_sqft","br_demo_tub","br_demo_tub_shower","br_demo_vanity","br_demo_vanity_set","br_demo_shower_cabin"]);
    result.items=result.items.filter((i:any)=>!included.has(id(i)));
  }
  // Знос перегородки вже включає латання — AI-шна «латка стелі» зайва.
  if(hasId("br_demo_partition_wall")&&!/corridor|hallway|коридор/.test(text.toLowerCase())){
    result.items=result.items.filter((i:any)=>id(i)!=="br_ceiling_repair_other_room");
  }
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
  // Якщо в описі площа названа явно («50 sq ft») і AI її взяв — не перекриваємо.
  const explicit=new Set<number>();
  for(const m of text.toLowerCase().replace(/,/g,".").matchAll(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|square feet|кв\.?\s*фут\w*)/g))explicit.add(Math.round(Number(m[1])*100)/100);
  const isExplicit=(q:number)=>[...explicit].some(e=>Math.abs(e-q)<0.5);
  const set=(ids:string[],qty:number)=>{result.items.forEach((i:any)=>{if(ids.includes(id(i))){if(isExplicit(Number(i.quantity)))return;i.quantity=qty;i.unit="sqft";i.note=g.note;i.confidence=1}})};
  set(SHOWER_WALL_IDS,g.showerWalls);set(PAN_IDS,g.pan);set(FLOOR_OUTSIDE_IDS,g.floorOutside);set(FLOOR_TOTAL_IDS,g.floorTotal);set(PAINT_IDS,g.paintArea);
  // The AI sometimes drops the wall tile when panels are also mentioned.
  const n=text.toLowerCase();
  const has=(x:string)=>result.items.some((i:any)=>id(i)===x);
  if(/tile.{0,30}(shower )?wall|walls?.{0,30}tile|tile to (?:the )?ceiling|плитк\w*.{0,30}стін|стін\w*.{0,30}плитк|плитк\w* до стел/.test(n)&&!has("br_wall_tile_sqft")){
    const anchorIdx=result.items.findIndex((i:any)=>["br_waterproof_panels_sqft","br_waterproof_membrane_sqft","br_cement_board_wall_sqft"].includes(id(i)));
    const item={[idKey]:"br_wall_tile_sqft",description:"Tile shower walls to ceiling",quantity:g.showerWalls,unit:"sqft",difficulty:"standard",note:g.note,confidence:1};
    if(anchorIdx>=0)result.items.splice(anchorIdx+1,0,item);else result.items.push(item);
  }
  return {applied:true};
}

