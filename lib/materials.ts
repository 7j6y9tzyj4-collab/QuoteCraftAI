// Матеріали за реальними цінами магазинів (Chicago area, ZIP 60171).
// Home Depot — онлайн-ціни з product pages 24.09.2026 (кілька позицій, де HD не показує
// ціну онлайн, — з перевірки 14.09.2026). Floor & Decor — ціни з сайту 24.09.2026.
// Menards блокує автоматичну перевірку цін, тому його тут нема.
//
// Рецепт = скільки УПАКОВОК товару йде на ОДИНИЦЮ роботи (sq ft, lin ft, each…), з відходом.
//   install — монтажні матеріали (фарба, клей, плита, кріплення, підводки) — завжди в сумі;
//   finish  — базове оздоблення / прилади (плитка, LVP, унітаз, змішувач, світильник…) —
//             орієнтовний allowance базового класу, клієнт може вибрати інше.
// Для пакетних позицій (br_, kp_) монтажні матеріали — з кошторисів власника, тут лише finish.

export type Store="Home Depot"|"Floor & Decor";
export type Product={store:Store;name:string;pack:string;price:number;url:string;checked:string};

const HD=(name:string,pack:string,price:number,id:string,checked="2026-09-24"):Product=>({store:"Home Depot",name,pack,price,url:`https://www.homedepot.com/p/${id}`,checked});
const FD=(name:string,pack:string,price:number,url:string):Product=>({store:"Floor & Decor",name,pack,price,url,checked:"2026-09-24"});

export const products:Record<string,Product>={
  // фарбування
  paintEgg:HD("BEHR Premium Plus eggshell interior paint & primer","1 gal",37.98,"202761520"),
  paintCeil:HD("BEHR Premium Plus ceiling flat paint & primer","1 gal",33.98,"100206081"),
  paintSemi:HD("BEHR Premium Plus semi-gloss (trim/doors)","1 gal",43.98,"202761530"),
  primer:HD("KILZ 2 all-purpose primer","1 gal",22.98,"100096395"),
  roller6:HD("9 in 3/8 nap roller covers","6 pk",9.48,"100579897"),
  trayKit:HD("9 in roller frame + metal tray","1 set",8.68,"337487271"),
  tape:HD("3M ScotchBlue 1.88 in painter's tape","60 yd",7.88,"100550611"),
  plastic:HD("HDX 9x12 ft plastic drop cloth","108 sq ft",3.48,"204711645"),
  alexCaulk:HD("DAP Alex Plus acrylic caulk","10.1 oz",4.18,"100097524"),
  spackle:HD("DAP DryDex spackling","32 oz",11.48,"100155689"),
  sponge:HD("3M drywall sanding sponge","1",4.98,"100321145"),
  woodFiller:HD("DAP Plastic Wood-X filler","16 oz",13.48,"206667346"),
  // гіпсокартон, каркас, утеплення
  drywall:HD("USG Sheetrock UltraLight 1/2 in 4x8","32 sq ft",13.48,"202530243","2026-09-14"),
  mud:HD("USG Sheetrock Plus 3 joint compound","4.5 gal",22.45,"100321605","2026-09-14"),
  dwTape:HD("USG paper drywall tape","250 ft",4.98,"100321613","2026-09-14"),
  dwScrews:HD("Grip-Rite #6x1-1/4 drywall screws","5 lb (~900)",24.98,"100120906"),
  cornerBead:HD("vinyl drywall corner bead","8 ft",2.88,"202092681"),
  patch8:HD("Wal-Board 8x8 in drywall repair patch","1",7.48,"100403177"),
  stud:HD("2x4x92-5/8 in whitewood stud","1",3.98,"312528780","2026-09-14"),
  nails16:HD("Grip-Rite 16d framing nails","5 lb (~320)",28.00,"202308681"),
  r13:HD("Owens Corning R-13 kraft faced batt","106.56 sq ft",78.80,"205470785"),
  r19:HD("Owens Corning R-19 kraft faced batt","77.5 sq ft",95.97,"100320353"),
  // плитка, гідроізоляція
  durock:HD("USG Durock 1/2 in 3x5 cement board","15 sq ft",15.85,"304163165"),
  cbScrews:HD("Rock-On cement board screws","185",7.20,"300662298"),
  meshTape:HD("FibaTape alkali-resistant mesh tape","150 ft",8.94,"202251875"),
  versabond:HD("Custom VersaBond thinset","50 lb",17.98,"100162542"),
  redgard:HD("Custom RedGard waterproofing","1 gal",77.53,"100169081"),
  ditra:HD("Schluter DITRA uncoupling membrane","54 sq ft",123.95,"100143471"),
  schiene:HD("Schluter Schiene 3/8 in edge trim","8 ft 2.5 in",20.14,"202022523"),
  sandedGrout:HD("Custom Polyblend Plus sanded grout","25 lb",19.48,"313291666"),
  unsandedGrout:HD("Custom Polyblend Plus unsanded grout","10 lb",18.48,"313296538"),
  levelClips:HD("QEP Lash tile leveling system","100 clips",19.97,"314956144"),
  silicone:HD("GE Silicone 2 kitchen & bath","10.1 oz",10.98,"317778410"),
  levelquik:HD("Custom LevelQuik RS self-leveling","50 lb",42.94,"100192482"),
  lqPrimer:HD("Custom LevelQuik acrylic primer","1 gal",46.55,"100057764"),
  lftMortar:FD("Mapei Ultraflex LFT large format mortar","50 lb",30.79,"https://www.flooranddecor.com/tile-mortars-and-thinsets-installation-materials/mapei-ultraflex-lft-gray---large-format-tile-mortar-951100090.html"),
  // оздоблення: плитка, LVP
  tileFloor:FD("Phoenix Sand 12x24 porcelain (basic floor)","1 sq ft",1.99,"https://www.flooranddecor.com/porcelain-tile/phoenix-sand-matte-porcelain-tile-101027092.html"),
  tileWall:FD("Venato White 12x24 porcelain (basic wall)","1 sq ft",1.79,"https://www.flooranddecor.com/porcelain-tile/venato-matte-porcelain-tile-100610781.html"),
  tileSubway:FD("Bright White 3x6 ceramic subway","1 sq ft",1.04,"https://www.flooranddecor.com/porcelain-ceramic-decoratives/bright-white-ice-subway-ceramic-wall-tile-914100887.html"),
  tileMosaic:FD("Satin White 2 in hex porcelain mosaic (shower floor)","0.97 sq ft sheet",2.89,"https://www.flooranddecor.com/porcelain-tile/satin-white-matte-hexagon-porcelain-mosaic-100782424.html"),
  lvp:FD("NuCore Glenridge Oak rigid core LVP, cork pad","1 sq ft",2.99,"https://www.flooranddecor.com/nucore-flooring/glenridge-oak-waterproof-rigid-core-luxury-vinyl-plank---cork-pad-101076297.html"),
  // підлога, трим, двері
  underlay:HD("TrafficMaster 2 mm underlayment","100 sq ft",39.00,"203956730"),
  tmold:HD("Zamma vinyl T-molding 72 in","1",24.98,"301076098"),
  plAdhesive:HD("Loctite PL Premium construction adhesive","28 oz",12.48,"202020474"),
  baseboard:HD("Woodgrain primed MDF baseboard 3-1/4 in","8 ft",12.36,"203209370"),
  quarterRound:HD("Woodgrain primed quarter round","8 ft",8.08,"203209424"),
  casing:HD("Woodgrain primed MDF casing 2-1/4 in","7 ft",9.36,"202879719"),
  bradNails:HD("Porter-Cable 2 in 18ga brad nails","1000",7.99,"202280169"),
  door:HD("Masonite 30x80 hollow core primed prehung door","1",170.00,"100061854"),
  knob:HD("Kwikset Polo passage knob","1",10.54,"100059740"),
  bags:HD("Husky 42 gal contractor bags","32",24.97,"100063659"),
  // сантехніка
  waxRing:HD("Oatey Johni-Ring wax ring + bolts","1",5.97,"312148498"),
  toiletLine:HD("BrassCraft 12 in toilet supply line","1",5.30,"100094502"),
  faucetLine:HD("BrassCraft 20 in faucet supply line","1",7.28,"100459572"),
  ptrap:HD("Oatey 1-1/2 in P-trap kit","1",5.38,"316622155"),
  putty:HD("Oatey plumber's putty","14 oz",1.57,"202312407"),
  pex:HD("Apollo 1/2 in PEX-B","10 ft",2.83,"301541190"),
  sharkbite:HD("SharkBite 1/2 in coupling","1",9.36,"202270492"),
  showerDrain:HD("Oatey PVC shower drain","1",12.25,"100346664"),
  posiValve:HD("MOEN Posi-Temp rough-in valve (M-Pact)","1",90.78,"100000810"),
  toilet:HD("Glacier Bay 2-piece elongated toilet","1",93.58,"331755743"),
  bathFaucet:HD("Glacier Bay 4 in centerset bathroom faucet","1",34.98,"309237986"),
  kitchenFaucet:HD("Glacier Bay pull-down kitchen faucet","1",74.41,"325268741"),
  showerTrim:HD("MOEN Chateau shower-only trim kit","1",54.04,"204316829"),
  tubTrim:HD("MOEN Brantford tub/shower trim kit","1",86.02,"100672501"),
  disposal:HD("InSinkErator Badger 5 1/2 HP disposal","1",117.54,"100091168"),
  vanity:HD("Glacier Bay 25 in vanity with cultured marble top","1",159.00,"203486567"),
  tub:HD("Bootz Aloha 60x30 alcove tub","1",249.00,"314614191"),
  pivotDoor:HD("Sterling 33-34 in framed pivot shower door","1",222.88,"317802877"),
  glassPanel:HD("Glass Warehouse 34 in frameless fixed panel","1",355.00,"301993811"),
  dwKit:HD("Dishwasher installation kit","1",24.90,"206740198"),
  // електрика
  outlet:HD("Leviton 15A TR duplex outlet","1",1.68,"100662608"),
  gfci:HD("Leviton 15A TR GFCI outlet","1",19.98,"205996763"),
  switch1:HD("Leviton single-pole switch","1",0.98,"100026991"),
  dimmer:HD("Lutron Diva LED+ dimmer","1",31.02,"203670402"),
  plate:HD("Leviton 1-gang nylon wall plate","1",3.06,"301671011"),
  romex:HD("Southwire Romex 14/2","50 ft",52.00,"202316377"),
  box:HD("Carlon 1-gang old work box","1",2.37,"100404027"),
  wireNuts:HD("wire connectors","180",15.48,"324045153"),
  wafer:HD("Commercial Electric 6 in LED canless wafer","4 pk",95.99,"306079856"),
  flushMount:HD("Commercial Electric 13 in LED flush mount","1",29.97,"323259465"),
  vanityLight:HD("Hampton Bay 3-light vanity light","1",14.97,"202228732"),
  ceilingFan:HD("Hampton Bay Brookhurst 52 in ceiling fan","1",54.98,"300937523"),
  bathFan:HD("Broan AE80B 80 CFM bath fan","1",84.00,"206656105"),
  duct:HD("Everbilt 4 in foil duct","8 ft",8.98,"320975610"),
  // аксесуари, кухня
  accSet:HD("Glacier Bay 4-piece bath hardware set","1",38.53,"322405581"),
  mirror:HD("Glacier Bay 24x30 beveled mirror","1",39.97,"316332035"),
  medCab:HD("Glacier Bay 16x26 medicine cabinet","1",60.00,"308185143"),
  cabScrews:HD("GRK cabinet screws","100",16.98,"203525221"),
};

type Line=[string,number];                 // [товар, упаковок на одиницю роботи]
type Ref=[string,number];                  // [інша позиція, множник]
type Recipe={install?:Line[];finish?:Line[];ref?:Ref[]};

// коротко: витрата фарби = площа × шари / покриття × 1.1 (запас)
const gal=(sqft:number,coats:number,coverage:number)=>sqft*coats/coverage*1.1;

export const recipes:Record<string,Recipe>={
  // ---------- фарбування (на sq ft / lin ft / шт) ----------
  paint_walls_sqft:{install:[["paintEgg",gal(1,2,350)],["primer",gal(0.1,1,350)],["tape",2/384],["plastic",2/384],["roller6",(2/6)/384],["trayKit",0.5/384],["spackle",0.5/384],["sponge",1/384]]},
  paint_ceiling_sqft:{install:[["paintCeil",gal(1,2,400)],["plastic",2/144],["roller6",(1/6)/144],["trayKit",0.5/144]]},
  paint_wall_each:{ref:[["paint_walls_sqft",96]]},
  paint_room:{ref:[["paint_walls_sqft",384]]},
  paint_room_floor_sqft:{ref:[["paint_walls_sqft",384/144],["paint_ceiling_sqft",1]]},
  paint_baseboards_linear_ft:{install:[["paintSemi",gal(0.54,1,350)],["alexCaulk",1/55],["tape",1/180]]},
  paint_baseboard_shoe_package_each:{ref:[["paint_baseboards_linear_ft",96]]},
  paint_door_each:{install:[["paintSemi",gal(42,2,350)],["primer",gal(42,1,350)],["roller6",1/6],["sponge",0.5]]},
  paint_door_frame_each:{ref:[["paint_baseboards_linear_ft",17]],install:[["sponge",0.25]]},
  paint_window_each:{ref:[["paint_baseboards_linear_ft",20]],install:[["tape",0.5]]},
  paint_repaired_areas_each:{install:[["primer",0.1],["paintEgg",0.1],["spackle",0.25],["sponge",1]]},
  water_stain_block_each:{install:[["primer",0.25],["paintCeil",0.15]]},
  wallpaper_remove_sqft:{install:[["plastic",1/108],["bags",1/32/40]]},
  wallpaper_install_sqft:{install:[["plastic",1/108],["sponge",1/200],["spackle",1/400]]},
  wall_prime_sqft:{install:[["primer",gal(1,1,350)],["roller6",(1/6)/300],["trayKit",0.5/300],["plastic",1/300]]},
  wall_niche_drywall_each:{install:[["stud",3],["drywall",0.25],["cornerBead",2],["mud",0.1],["dwTape",0.05],["dwScrews",0.05],["primer",0.1],["paintEgg",0.1],["sponge",1]]},
  shelf_install_each:{install:[["dwScrews",0.01]]},
  fill_nail_holes_room:{install:[["woodFiller",0.25],["alexCaulk",1],["sponge",0.5]]},
  caulk_trim_linear_ft:{install:[["alexCaulk",1/55]]},
  // ---------- гіпсокартон / каркас / утеплення ----------
  drywall_install_sqft:{install:[["drywall",1.1/32],["mud",0.138/50],["dwTape",0.37/250],["dwScrews",1/900],["cornerBead",1/100],["sponge",1/200]]},
  drywall_finish_sqft:{install:[["mud",0.138/50],["dwTape",0.37/250],["cornerBead",1/100],["sponge",1/200]]},
  drywall_minor:{install:[["patch8",1],["spackle",0.25],["sponge",1],["primer",0.05]]},
  drywall_patch_addon_minor:{install:[["patch8",1],["spackle",0.25]]},
  drywall_patch_addon_medium:{install:[["drywall",0.25],["mud",0.1],["dwTape",0.05],["dwScrews",0.02],["sponge",1]]},
  drywall_patch_addon_large:{install:[["drywall",1],["mud",0.25],["dwTape",0.1],["dwScrews",0.05],["sponge",1]]},
  drywall_repair_standalone:{ref:[["drywall_patch_addon_medium",1]],install:[["primer",0.1]]},
  drywall_remove_sqft:{install:[["bags",1/32/15],["plastic",1/108]]},
  drywall_corner_repair_each:{install:[["cornerBead",1],["mud",0.1],["sponge",0.5]]},
  drywall_crack_linear_ft:{install:[["dwTape",1/250],["mud",0.004],["sponge",0.005]]},
  drywall_tape_repair_each:{install:[["dwTape",0.02],["mud",0.05],["sponge",0.5]]},
  drywall_new_wall_frame:{install:[["stud",1.01],["nails16",7.5/320]]},
  drywall_insulation_wall:{install:[["r13",1.05/106.56]]},
  // ---------- плитка / гідроізоляція ----------
  wall_tile_sqft:{install:[["versabond",1/85],["unsandedGrout",1/70],["silicone",1/150]],finish:[["tileSubway",1.12]]},
  floor_tile_sqft:{install:[["lftMortar",1/45],["sandedGrout",1/100],["levelClips",2/100]],finish:[["tileFloor",1.1]]},
  kitchen_backsplash_sqft:{install:[["versabond",1/85],["unsandedGrout",1/70],["silicone",1/60],["schiene",1/30]],finish:[["tileSubway",1.12]]},
  vanity_backsplash_sqft:{install:[["versabond",1/85],["unsandedGrout",1/70],["silicone",1/60],["schiene",1/30]],finish:[["tileSubway",1.12]]},
  cement_board_install_sqft:{install:[["durock",1.1/15],["cbScrews",2.67/185],["meshTape",1/150],["versabond",1/300]]},
  uncoupling_membrane_sqft:{install:[["ditra",1.1/54],["versabond",1/45]]},
  tile_waterproofing_sqft:{install:[["redgard",1/55],["meshTape",0.5/150]]},
  tile_grout_sqft:{install:[["sandedGrout",1/60],["sponge",1/100]]},
  tile_remove_sqft:{install:[["bags",1/32/8],["plastic",1/108]]},
  tile_silicone_linear_ft:{install:[["silicone",1/30]]},
  schluter_edge_linear_ft:{install:[["schiene",1.05/8.2]]},
  shower_niche_build_each:{install:[["stud",2],["durock",0.35],["cbScrews",0.1],["redgard",0.1],["meshTape",0.05]]},
  shower_niche_tile_each:{install:[["versabond",6/85],["unsandedGrout",6/70],["schiene",1]],finish:[["tileSubway",6.7]]},
  shower_bench_build_each:{install:[["stud",6],["durock",1],["cbScrews",0.3],["redgard",0.3],["meshTape",0.1]]},
  shower_bench_tile_each:{install:[["lftMortar",10/45],["sandedGrout",0.1],["schiene",1]],finish:[["tileFloor",11]]},
  shower_drain_install_each:{install:[["showerDrain",1],["silicone",0.2]]},
  // ---------- підлога ----------
  lvp_install_sqft:{finish:[["lvp",1.1]]},
  underlayment_install_sqft:{install:[["underlay",1.1/100]]},
  floor_leveling_sqft:{install:[["levelquik",1/25],["lqPrimer",1/300]]},
  localized_floor_leveling_each:{install:[["levelquik",3],["lqPrimer",0.25]]},
  subfloor_prep_sqft:{install:[["lqPrimer",1/300],["bags",1/32/100]]},
  floor_transition_each:{install:[["tmold",1]]},
  lvp_remove_sqft:{install:[["bags",1/32/25]]},
  carpet_remove_sqft:{install:[["bags",1/32/25]]},
  move_furniture_floor_room:{install:[]},
  // ---------- демонтаж / прибирання ----------
  demo_general_sqft:{install:[["bags",1/32/15],["plastic",0.5/108]]},
  demo_debris_haul_each:{install:[["bags",8/32]]},
  bathroom_debris_haul_each:{install:[["bags",8/32]]},
  protect_room_each:{install:[["plastic",4],["tape",2]]},
  final_cleanup_room:{install:[["bags",2/32]]},
  bathroom_final_cleanup_each:{install:[["bags",2/32]]},
  vanity_remove_each:{install:[["bags",2/32]]},
  bathtub_remove_each:{install:[["bags",4/32]]},
  kitchen_cabinet_remove_each:{install:[["bags",0.5/32]]},
  door_remove_each:{install:[]},
  baseboard_remove_linear_ft:{install:[["bags",1/32/40]]},
  // ---------- трим / двері ----------
  baseboard_install:{install:[["baseboard",1.1/8],["bradNails",3/1000],["alexCaulk",1/55],["woodFiller",1/200]]},
  quarter_round_install_linear_ft:{install:[["quarterRound",1.1/8],["bradNails",2/1000],["alexCaulk",1/55]]},
  door_casing_install_linear_ft:{install:[["casing",1.1/7],["bradNails",3/1000],["alexCaulk",1/55],["woodFiller",1/200]]},
  baseboard_shoe_package_each:{ref:[["baseboard_install",48],["quarter_round_install_linear_ft",48]]},
  door_install:{install:[["woodFiller",0.1],["alexCaulk",0.5],["bradNails",0.05]],finish:[["door",1],["knob",1]]},
  // ---------- електрика ----------
  replace_outlet_each:{install:[["outlet",1],["plate",1]]},
  replace_switch_each:{install:[["switch1",1],["plate",1]]},
  gfci_install_each:{install:[["gfci",1],["plate",1]]},
  dimmer_install_each:{install:[["dimmer",1],["plate",1]]},
  outlet_new_each:{install:[["outlet",1],["plate",1],["box",1],["romex",0.3],["wireNuts",3/180]]},
  new_circuit_each:{install:[["romex",1],["box",1],["outlet",1],["plate",1],["wireNuts",4/180]]},
  recessed_light_install_each:{install:[["romex",0.2],["wireNuts",3/180]],finish:[["wafer",0.25]]},
  vanity_light_install_each:{install:[["wireNuts",3/180]],finish:[["vanityLight",1]]},
  light_fixture_replace:{install:[["wireNuts",3/180]],finish:[["flushMount",1]]},
  light_fixture_reinstall_each:{install:[["wireNuts",3/180]]},
  light_fixture_remove_each:{install:[["wireNuts",2/180]]},
  ceiling_fan_replace:{install:[["wireNuts",5/180]],finish:[["ceilingFan",1]]},
  bath_fan_replace:{install:[["duct",1],["wireNuts",3/180]],finish:[["bathFan",1]]},
  bath_fan_install_each:{install:[["duct",2],["romex",0.4],["wireNuts",5/180]],finish:[["bathFan",1]]},
  electrical_box_relocate_each:{install:[["box",1],["romex",0.12],["wireNuts",3/180],["patch8",1]]},
  // ---------- сантехніка ----------
  toilet_replace:{install:[["waxRing",1],["toiletLine",1]],finish:[["toilet",1]]},
  bathroom_faucet_replace:{install:[["faucetLine",2],["putty",0.2]],finish:[["bathFaucet",1]]},
  kitchen_faucet_replace:{install:[["faucetLine",2]],finish:[["kitchenFaucet",1]]},
  bathroom_sink_install_each:{install:[["ptrap",1],["putty",0.3],["silicone",0.3]]},
  kitchen_sink_install_each:{install:[["ptrap",1],["putty",0.5],["silicone",0.5]]},
  vanity_install:{install:[["silicone",0.3],["cabScrews",0.04]],finish:[["vanity",1]]},
  vanity_top_install_each:{install:[["silicone",0.5],["plAdhesive",0.3]]},
  vanity_plumbing_connect_each:{install:[["faucetLine",2],["ptrap",1],["putty",0.2]]},
  garbage_disposal_replace:{install:[["putty",0.5]],finish:[["disposal",1]]},
  dishwasher_install_each:{install:[["dwKit",1]]},
  shower_head_install_each:{install:[["putty",0.1]]},
  handheld_shower_install_each:{install:[["putty",0.1]]},
  shower_trim_install_each:{install:[["silicone",0.1]],finish:[["showerTrim",1]]},
  shower_valve_roughin_each:{install:[["posiValve",1],["pex",1],["sharkbite",2]]},
  water_lines_relocate_fixture:{install:[["pex",2],["sharkbite",4]]},
  bathtub_faucet_install_each:{install:[["silicone",0.1]],finish:[["tubTrim",1]]},
  acrylic_tub_install_each:{finish:[["tub",1]]},
  shower_glass_door_install_each:{install:[["silicone",0.5]],finish:[["pivotDoor",1]]},
  shower_glass_panel_install_each:{install:[["silicone",0.5]],finish:[["glassPanel",1]]},
  frameless_glass_enclosure_install_each:{install:[]},
  bathroom_mirror_install_each:{install:[["cabScrews",0.04]],finish:[["mirror",1]]},
  medicine_cabinet_install_each:{install:[["cabScrews",0.06]],finish:[["medCab",1]]},
  bathroom_accessories_set_each:{install:[["cabScrews",0.1]],finish:[["accSet",1]]},
  towel_bar_install_each:{install:[["cabScrews",0.03]],finish:[["accSet",0.25]]},
  toilet_paper_holder_install_each:{install:[["cabScrews",0.03]],finish:[["accSet",0.25]]},
  robe_hook_install_each:{install:[["cabScrews",0.03]],finish:[["accSet",0.25]]},
  // ---------- кухня ----------
  kitchen_cabinet_install:{install:[["cabScrews",0.06]]},
  kitchen_countertop_install:{install:[["silicone",0.1],["plAdhesive",0.1]]},
  kitchen_hardware_install_each:{install:[]},
  range_hood_install_each:{install:[["duct",1],["wireNuts",3/180],["silicone",0.2]]},

  // ---------- пакетні: лише оздоблення (монтажні — з кошторисів власника) ----------
  br_wall_tile_sqft:{finish:[["tileWall",1.1]]},
  br_floor_tile_sqft:{finish:[["tileFloor",1.1]]},
  br_ceiling_tile_sqft:{finish:[["tileWall",1.1]]},
  br_vanity_wall_tile_sqft:{finish:[["tileWall",1.1]]},
  br_pan_mosaic_sqft:{finish:[["tileMosaic",1.1/0.97]]},
  br_niche:{finish:[["tileWall",6]]},
  br_window_detail:{finish:[["tileWall",5]]},
  br_window_return_trim:{finish:[["tileWall",3]]},
  br_tub_install:{finish:[["tub",1]]},
  br_vanity_install_single:{finish:[["vanity",1]]},
  br_vanity_connect:{finish:[["bathFaucet",1]]},
  br_valve_replace:{finish:[["posiValve",1],["showerTrim",1]]},
  br_valve_relocate:{finish:[["posiValve",1],["showerTrim",1]]},
  br_shower_system_install:{finish:[["posiValve",1],["showerTrim",1]]},
  br_fan_replace:{finish:[["bathFan",1]]},
  br_light_replace:{finish:[["vanityLight",1]]},
  br_switch_outlet_replace:{finish:[["outlet",1],["plate",1]]},
  br_outlet_new:{finish:[["outlet",1],["plate",1]]},
  br_mirror_install:{finish:[["mirror",1]]},
  br_mirror_replace:{finish:[["mirror",1]]},
  br_medicine_cabinet:{finish:[["medCab",1]]},
  br_tall_cabinet_medicine:{finish:[["medCab",1]]},
  br_accessories:{finish:[["accSet",1]]},
  br_shower_door_install:{finish:[["pivotDoor",1]]},
  br_toilet_install_new:{finish:[["toilet",1]]},
  br_baseboard_install_paint:{finish:[["baseboard",30*1.1/8],["paintSemi",gal(16,1,350)]]},
  br_trim:{finish:[["baseboard",2]]},
  br_paint_sqft:{finish:[["paintEgg",gal(1,2,350)]]},
  br_ceiling_prep_paint:{finish:[["paintCeil",0.5]]},
  br_paint_doors:{finish:[["paintSemi",0.3]]},
  kp_backsplash_sqft:{finish:[["tileSubway",1.12]]},
  kp_floor_tile_sqft:{finish:[["tileFloor",1.1]]},
  kp_lvp_sqft:{finish:[["lvp",1.1]]},
  kp_light_replace:{finish:[["flushMount",1]]},
  kp_fan_replace:{finish:[["ceilingFan",1]]},
  kp_paint_door:{finish:[["paintSemi",gal(42,2,350)]]},
  kp_baseboard_repair_paint:{finish:[["paintSemi",0.25]]},
};

const r2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
type Part={cost:number;lines:string[]};
function addLines(part:Part,lines:Line[]|undefined,mult:number){
  for(const [pid,q] of lines||[]){
    const p=products[pid];
    if(!p)throw new Error("materials: нема товару "+pid);
    const packs=q*mult;
    part.cost+=packs*p.price;
    part.lines.push(`${p.name} (${p.store} $${p.price}/${p.pack}) × ${packs<0.1?packs.toFixed(4):packs.toFixed(2)}`);
  }
}
function resolve(id:string,mult:number,install:Part,finish:Part,depth=0){
  const r=recipes[id];
  if(!r||depth>3)return;
  addLines(install,r.install,mult);
  addLines(finish,r.finish,mult);
  for(const [ref,m] of r.ref||[])resolve(ref,mult*m,install,finish,depth+1);
}
export type MaterialCost={install:number;finish:number;installNote:string;finishNote:string};
export function recipeCost(id:string):MaterialCost|null{
  if(!recipes[id])return null;
  const install:Part={cost:0,lines:[]},finish:Part={cost:0,lines:[]};
  resolve(id,1,install,finish);
  return {install:r2(install.cost),finish:r2(finish.cost),installNote:install.lines.join("; "),finishNote:finish.lines.join("; ")};
}

// ---------- список закупівлі: скільки упаковок кожного товару на весь кошторис ----------
export type PackNeed={install:Record<string,number>;finish:Record<string,number>};
function collect(id:string,mult:number,out:PackNeed,depth=0){
  const r=recipes[id];
  if(!r||depth>3)return;
  for(const [pid,q] of r.install||[])out.install[pid]=(out.install[pid]||0)+q*mult;
  for(const [pid,q] of r.finish||[])out.finish[pid]=(out.finish[pid]||0)+q*mult;
  for(const [ref,m] of r.ref||[])collect(ref,mult*m,out,depth+1);
}
/** Упаковки товарів на `qty` одиниць роботи `id` (дробові, без округлення). null — рецепта нема. */
export function recipePacks(id:string,qty:number):PackNeed|null{
  if(!recipes[id])return null;
  const out:PackNeed={install:{},finish:{}};
  collect(id,qty,out);
  return out;
}
