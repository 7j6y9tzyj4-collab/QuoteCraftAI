// Огляд об'єкта: кімнати з розмірами в дюймах (з дробами), фото, нотатки, AI-план робіт.
export type Opening={id:string;name:string;w:string;h:string;count:number;/** стіна A/B/C/D на ескізі */wall?:string;/** двері: всередину/назовні */swing?:"in"|"out";/** петлі: ліворуч/праворуч (дивлячись з кімнати) */hinge?:"left"|"right";/** положення на стіні 0..1 */t?:number;/** вікно: низ над підлогою, дюйми (зі скану) */sill?:number};
/** сантехніка й обладнання на плані */
export type Fixture={id:string;type:string;wall:string;/** 0..1 вздовж стіни */t:number;w:number;d:number;label?:string;fromPhoto?:boolean;/** зі LiDAR-скану (точне положення) */fromScan?:boolean;/** варіант 3D-моделі (див. FIXTURE_MODELS) */model?:string;/** висота предмета, дюйми (зі скану) */h?:number;/** низ над підлогою, дюйми (навісні: ТВ, шафки) */y?:number;/** відступ від стіни в кімнату, дюйми (окремостоячі: диван посеред кімнати, килим) */off?:number};
export const FIXTURES:Record<string,{name:string;w:number;d:number}>={
  toilet:{name:"Унітаз",w:20,d:28},vanity:{name:"Умивальник / тумба",w:30,d:21},sink:{name:"Раковина",w:20,d:18},tub:{name:"Ванна",w:60,d:30},shower:{name:"Душ",w:36,d:36},
  washer:{name:"Пральна",w:27,d:30},dryer:{name:"Сушка",w:27,d:30},fan:{name:"Вентилятор",w:12,d:12},light:{name:"Світильник",w:10,d:10},heater:{name:"Радіатор",w:24,d:6},cabinet:{name:"Шафа",w:36,d:24},mirror:{name:"Дзеркало",w:24,d:2},vanityLight:{name:"Світло над дзеркалом",w:30,d:5},towelBar:{name:"Тримач рушників",w:24,d:3},other:{name:"Інше",w:24,d:24},
};
export type SurveyPhoto={id:string;path?:string;dataUrl?:string;/** кадр зі сканера: на яку стіну дивився телефон (точно, з LiDAR) і звідки */view?:{facing:string;x:number;y:number;ang:number}};
export type PlanTask={name:string;qty:number;unit:string;basis:string;note?:string};
export type RoomPlan={summary:string;condition:string;tasks:PlanTask[];questions:string[];en?:{summary:string;tasks:PlanTask[]};createdAt:string;seen?:{type:string;wall:string;t:number;style?:string;note:string}[];floorTile?:{w:number;h:number}|null};
/** додаткова ділянка нестандартної кімнати: ніша/виступ (додати) або вирізаний кут (відняти). depth — глибина від стіни */
export type Part={id:string;name:string;kind:"add"|"cut";length:string;depth:string;/** ніша: стіна A–D; виріз: кут AB/BC/CD/DA */wall?:string;/** ніша: start|middle|end */pos?:string};
export type Room={id:string;name:string;length:string;width:string;height:string;openings:Opening[];photos:SurveyPhoto[];notes:string;plan?:RoomPlan;parts?:Part[];fixtures?:Fixture[];/** плитка на підлозі з фото, дюйми */floorTile?:{w:number;h:number}|null;/** фотореалістичні рендери (AI) */renders?:SurveyPhoto[];/** побажання до рендеру: плитка, кольори, стиль */renderWish?:string;/** кольори з фото (hex): стіни, підлога, тумба */look?:{wall?:string;floor?:string;vanity?:string};/** 3D-скан (хмара точок LiDAR, файл .qcpc у сховищі) + перетворення ARKit → кімната */scanCloud?:{path:string;n:number;th:number;minX:number;minZ:number;floorY:number};/** 3D-фото: сітка LiDAR (.qcms) + ключові кадри з позою камери (ARKit) — текстурована кімната */scanMesh?:{path:string;frames:ScanFrame[];th:number;minX:number;minZ:number;floorY:number}};
export type ScanFrame={path:string;T:number[];fx:number;fy:number;cx:number;cy:number;w:number;h:number};
export type Survey={id:string;date:string;title:string;address?:string;rooms:Room[];notes:string;createdAt:string;updatedAt:string;estimateId?:string};

// "70", "7 3/4", "7-3/4", "7 15/16", "70.5", "5' 3 1/2\"" → дюйми
export function parseInches(s:string):number|null{
  let t=String(s??"").trim().toLowerCase().replace(/[”″"]/g,'"').replace(/[’′]/g,"'").replace(/,/g,".");
  if(!t)return null;
  let total=0,any=false;
  const ft=t.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|фут\w*)\s*/);
  if(ft){total+=Number(ft[1])*12;t=t.slice(ft[0].length);any=true}
  t=t.replace(/(in|inch|inches|дюйм\w*|інч\w*|")\s*$/,"").trim();
  if(t){
    const m=t.match(/^(\d+)?(?:[\s-]+)?(?:(\d+)\s*\/\s*(\d+))?$/);
    if(m&&(m[1]||m[2])){
      if(m[1])total+=Number(m[1]);
      if(m[2]&&m[3]&&Number(m[3])>0)total+=Number(m[2])/Number(m[3]);
      any=true;
    }else{
      const d=Number(t);if(!Number.isFinite(d))return null;total+=d;any=true;
    }
  }
  return any&&total>0?Math.round(total*10000)/10000:null;
}
export const inchesToFt=(i:number)=>Math.round(i/12*100)/100;
export function fmtInches(i:number|null):string{
  if(i===null)return "";
  const ft=Math.floor(i/12),rest=Math.round((i-ft*12)*16)/16;
  const whole=Math.floor(rest),fr=rest-whole;
  const frs=fr?` ${Math.round(fr*16)}/16`.replace(/ (\d+)\/16/,(_,n)=>{let a=Number(n),b=16;while(a%2===0&&b>1){a/=2;b/=2}return ` ${a}/${b}`}):"";
  return ft?`${ft}' ${whole}${frs}"`:`${whole}${frs}"`;
}

const r1=(n:number)=>Math.round(n*10)/10;
export function roomAreas(r:Room){
  const L=parseInches(r.length),W=parseInches(r.width),H=parseInches(r.height);
  const ok=(x:number|null):x is number=>x!==null&&x>0;
  let floor=ok(L)&&ok(W)?L*W/144:null;
  let perimIn=ok(L)&&ok(W)?2*(L+W):null;
  // нестандартна форма: ніша/виступ додає площу і 2×глибину до периметра; вирізаний кут віднімає площу, периметр не міняє
  for(const p of r.parts||[]){
    const a=parseInches(p.length),d=parseInches(p.depth);
    if(!ok(a)||!ok(d)||floor===null||perimIn===null)continue;
    if(p.kind==="add"){floor+=a*d/144;perimIn+=2*d}else{floor=Math.max(0,floor-a*d/144)}
  }
  const perimeter=perimIn!==null?perimIn/12:null;
  let openings=0;
  for(const o of r.openings||[]){const w=parseInches(o.w),h=parseInches(o.h);if(ok(w)&&ok(h))openings+=w*h/144*(Number(o.count)||1)}
  const wallsGross=perimIn!==null&&ok(H)?perimIn*H/144:null;
  const walls=wallsGross!==null?Math.max(0,wallsGross-openings):null;
  return {
    floorSqft:floor!==null?r1(floor):null,ceilingSqft:floor!==null?r1(floor):null,
    wallsSqft:walls!==null?r1(walls):null,wallsGrossSqft:wallsGross!==null?r1(wallsGross):null,
    openingsSqft:r1(openings),perimeterFt:perimeter!==null?r1(perimeter):null,
    lengthFt:ok(L)?inchesToFt(L):null,widthFt:ok(W)?inchesToFt(W):null,heightFt:ok(H)?inchesToFt(H):null,
  };
}
export const newRoom=(name=""):Room=>({id:crypto.randomUUID(),name,length:"",width:"",height:"96",openings:[],photos:[],notes:""});
export const newSurvey=(address?:string):Survey=>({id:crypto.randomUUID(),date:new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"}),title:"Огляд "+new Date().toLocaleDateString("uk-UA"),address,rooms:[newRoom("Кімната 1")],notes:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
export const DOOR={name:"Двері",w:"32",h:"80"},WINDOW={name:"Вікно",w:"36",h:"48"};

// текст для калькулятора: кімнати з площами й планом робіт
export function surveyToPrompt(s:Survey):string{
  const lines:string[]=[];
  for(const r of s.rooms){
    const a=roomAreas(r);
    const dims=[a.lengthFt!==null?`${a.lengthFt} ft`:null,a.widthFt!==null?`${a.widthFt} ft`:null,a.heightFt!==null?`висота ${a.heightFt} ft`:null].filter(Boolean).join(" × ");
    const areas=[a.floorSqft!==null?`підлога ${a.floorSqft} sq ft`:null,a.wallsSqft!==null?`стіни ${a.wallsSqft} sq ft (без прорізів)`:null,a.ceilingSqft!==null?`стеля ${a.ceilingSqft} sq ft`:null,a.perimeterFt!==null?`периметр ${a.perimeterFt} lin ft`:null].filter(Boolean).join(", ");
    lines.push(`${r.name||"Кімната"}${dims?` (${dims})`:""}${areas?`: ${areas}`:""}.`);
    if(r.plan?.tasks?.length)lines.push("Роботи: "+r.plan.tasks.map(t=>`${t.name} — ${t.qty} ${t.unit}${t.note?` (${t.note})`:""}`).join("; ")+".");
    else if(r.notes.trim())lines.push("Треба: "+r.notes.trim());
  }
  if(s.notes.trim())lines.push("Загалом: "+s.notes.trim());
  return lines.join("\n");
}

/** Варіанти 3D-моделей (Kenney Furniture Kit, /public/models). Перший — за замовчуванням. h — висота, дюйми; y — низ над підлогою (для навісних); ceiling — під стелю. */
// перші варіанти (id "m-…", file:"") — сучасні моделі з коду (components/Modern3D); далі — класичні Kenney GLB
export const FIXTURE_MODELS:Record<string,{id:string;name:string;file:string;h:number;y?:number;ceiling?:boolean}[]>={
  toilet:[{id:"m-one",name:"Моноблок (сучасний)",file:"",h:28},{id:"m-hung",name:"Підвісний з інсталяцією",file:"",h:17},{id:"toilet",name:"Класичний",file:"toilet.glb",h:30}],
  vanity:[{id:"m-float",name:"Підвісна тумба",file:"",h:34},{id:"m-vessel",name:"Підвісна + накладна раковина",file:"",h:39},{id:"m-floor",name:"Тумба на ніжках",file:"",h:34},{id:"vanityDrawer",name:"Класична тумба",file:"bathroomCabinetDrawer.glb",h:34},{id:"sinkSquare",name:"Класичний підвісний",file:"bathroomSinkSquare.glb",h:34},{id:"pedestal",name:"На п'єдесталі",file:"bathroomSink.glb",h:34}],
  sink:[{id:"m-wallsink",name:"Підвісна раковина (сучасна)",file:"",h:34},{id:"pedestal",name:"На п'єдесталі",file:"bathroomSink.glb",h:34},{id:"sinkSquare",name:"Класичний підвісний",file:"bathroomSinkSquare.glb",h:34},{id:"vanityDrawer",name:"Класична тумба",file:"bathroomCabinetDrawer.glb",h:34}],
  tub:[{id:"m-alcove",name:"Вбудована (сучасна)",file:"",h:20},{id:"m-free",name:"Окремостояча",file:"",h:22},{id:"tub",name:"Класична",file:"bathtub.glb",h:20}],
  shower:[{id:"m-walk",name:"Walk-in, скло",file:"",h:80},{id:"m-door",name:"Скляні двері",file:"",h:80},{id:"showerSquare",name:"Класичний квадратний",file:"shower.glb",h:80},{id:"showerRound",name:"Кутовий заокруглений",file:"showerRound.glb",h:80}],
  washer:[{id:"m-washer",name:"Пральна (сучасна)",file:"",h:36},{id:"m-stack",name:"Пральна + сушка (стовпчик)",file:"",h:73},{id:"washer",name:"Класична",file:"washer.glb",h:36},{id:"stacked",name:"Класичний стовпчик",file:"washerDryerStacked.glb",h:72}],
  dryer:[{id:"m-dryer",name:"Сушка (сучасна)",file:"",h:36},{id:"dryer",name:"Класична",file:"dryer.glb",h:36}],
  cabinet:[{id:"m-base",name:"Нижня шафа",file:"",h:36},{id:"m-upper",name:"Навісна шафа",file:"",h:30,y:54},{id:"m-tall",name:"Пенал",file:"",h:84},{id:"base",name:"Класична нижня",file:"kitchenCabinet.glb",h:36},{id:"upper",name:"Класична навісна",file:"kitchenCabinetUpper.glb",h:30,y:54},{id:"tall",name:"Пенал з дзеркалом",file:"bathroomCabinet.glb",h:72},{id:"mirror",name:"Дзеркальна шафка",file:"bathroomMirror.glb",h:30,y:42}],
  light:[{id:"m-disk",name:"LED-панель",file:"",h:2,ceiling:true},{id:"m-pendant",name:"Підвісний",file:"",h:25,ceiling:true},{id:"light",name:"Класичний",file:"lampSquareCeiling.glb",h:10,ceiling:true}],
  // file:"" — малюється кодом (Room3D / Modern3D), не GLB
  mirror:[{id:"m-roundled",name:"Кругле з LED",file:"",h:28,y:40},{id:"m-rectled",name:"Прямокутне з LED",file:"",h:32,y:38},{id:"m-roundblack",name:"Кругле, чорна рамка",file:"",h:26,y:42},{id:"round",name:"Кругле просте",file:"",h:24,y:42},{id:"rect",name:"Прямокутне просте",file:"",h:30,y:40},{id:"framed",name:"В рамі (шафка)",file:"bathroomMirror.glb",h:30,y:40}],
  vanityLight:[{id:"m-linear",name:"LED-лінія",file:"",h:3,y:76},{id:"m-globes",name:"Бра-кулі (латунь)",file:"",h:8,y:72},{id:"bar4",name:"4 плафони",file:"",h:8,y:72},{id:"bar3",name:"3 плафони",file:"",h:8,y:72},{id:"bar2",name:"2 плафони",file:"",h:8,y:72}],
  towelBar:[{id:"m-bar",name:"Планка, чорна",file:"",h:2,y:48},{id:"m-ring",name:"Кільце, чорне",file:"",h:8,y:48},{id:"bar",name:"Планка, хром",file:"",h:2,y:48},{id:"ring",name:"Кільце, хром",file:"",h:8,y:48}],
  fan:[{id:"m-fan",name:"Вентилятор з LED",file:"",h:10,ceiling:true},{id:"fan",name:"Класичний",file:"ceilingFan.glb",h:10,ceiling:true}],
  heater:[{id:"m-panel",name:"Панельний радіатор",file:"",h:24}],
};
export function fixtureModel(type:string,model?:string){const v=FIXTURE_MODELS[type];if(!v)return null;return v.find(x=>x.id===model)||v[0]}
