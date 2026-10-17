// Огляд об'єкта: кімнати з розмірами в дюймах (з дробами), фото, нотатки, AI-план робіт.
export type Opening={id:string;name:string;w:string;h:string;count:number;/** стіна A/B/C/D на ескізі */wall?:string};
export type SurveyPhoto={id:string;path?:string;dataUrl?:string};
export type PlanTask={name:string;qty:number;unit:string;basis:string;note?:string};
export type RoomPlan={summary:string;condition:string;tasks:PlanTask[];questions:string[];en?:{summary:string;tasks:PlanTask[]};createdAt:string};
/** додаткова ділянка нестандартної кімнати: ніша/виступ (додати) або вирізаний кут (відняти). depth — глибина від стіни */
export type Part={id:string;name:string;kind:"add"|"cut";length:string;depth:string};
export type Room={id:string;name:string;length:string;width:string;height:string;openings:Opening[];photos:SurveyPhoto[];notes:string;plan?:RoomPlan;parts?:Part[]};
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
export const newSurvey=(address?:string):Survey=>({id:crypto.randomUUID(),date:new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"}),title:"Огляд "+new Date().toLocaleDateString("uk-UA"),address,rooms:[newRoom("Ванна 1 поверх")],notes:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
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
