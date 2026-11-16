// ✏️ Контур кімнати, намальований пальцем: криву лінію перетворюємо на стіни під 90°,
// користувач вписує довжину кожної стіни, а ми рахуємо площу й периметр. Усе в дюймах, y — вниз.
export type Dir="R"|"D"|"L"|"U";
export type Edge={dir:Dir;/** довжина на малюнку (умовні одиниці) — лише для пропорцій */sketch:number};
export type Pt=[number,number];
const AX=(d:Dir)=>d==="R"||d==="L"?"h":"v";
const OPP:Record<Dir,Dir>={R:"L",L:"R",U:"D",D:"U"};
const VEC:Record<Dir,Pt>={R:[1,0],D:[0,1],L:[-1,0],U:[0,-1]};

/** Намальована пальцем лінія → стіни під прямим кутом (за годинниковою, починаючи з верхньої лівої). null — не вдалося розпізнати. */
export function strokeToEdges(raw:Pt[]):Edge[]|null{
  if(raw.length<8)return null;
  const xs=raw.map(p=>p[0]),ys=raw.map(p=>p[1]);
  const bw=Math.max(...xs)-Math.min(...xs),bh=Math.max(...ys)-Math.min(...ys),big=Math.max(bw,bh);
  if(big<40)return null;
  // рівномірний крок уздовж лінії
  const step=big/90,pts:Pt[]=[raw[0]];let acc=0;
  for(let i=1;i<raw.length;i++){
    let a=raw[i-1];const b=raw[i];let d=Math.hypot(b[0]-a[0],b[1]-a[1]);
    while(acc+d>=step&&d>0){const t=(step-acc)/d;a=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];pts.push(a);d=Math.hypot(b[0]-a[0],b[1]-a[1]);acc=0}
    acc+=d;
  }
  if(pts.length<12)return null;
  { // палець рідко повертається точно в початок: шукаємо, де кінець лінії найближче підходить до її початку, і відрізаємо зайве з обох боків
    const n=pts.length,hN=Math.floor(n*0.2),tN=Math.floor(n*0.8);let bi=0,bj=n-1,bd=Infinity;
    for(let i=0;i<=hN;i++)for(let j=tN;j<n;j++){const d=Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]);if(d<bd){bd=d;bi=i;bj=j}}
    if(bd<big*0.18&&(bi>0||bj<n-1))pts.splice(bj+1),pts.splice(0,bi);
  }
  // напрямок у кожній точці (згладжено) → відрізки одного напрямку
  const w=3;type Run={dir:Dir;len:number;/** s — тут лінія почалась, e — тут закінчилась */tag?:string};const runs:Run[]=[];
  for(let i=0;i<pts.length-1;i++){
    const a=pts[Math.max(0,i-w)],b=pts[Math.min(pts.length-1,i+w)];const dx=b[0]-a[0],dy=b[1]-a[1];
    const dir:Dir=Math.abs(dx)>=Math.abs(dy)?(dx>=0?"R":"L"):(dy>=0?"D":"U");
    const last=runs[runs.length-1];if(last&&last.dir===dir)last.len+=step;else runs.push({dir,len:step});
  }
  if(runs.length){runs[0].tag="s";runs[runs.length-1].tag=(runs[runs.length-1].tag||"")+"e"}
  const merge=()=>{ // сусіди одного напрямку зливаються; протилежні на одній осі — віднімаються
    let ch=true;while(ch&&runs.length>1){ch=false;
      for(let i=0;i<runs.length;i++){const j=(i+1)%runs.length;if(i===j)break;const a=runs[i],b=runs[j];
        if(a.dir===b.dir){a.len+=b.len;a.tag=(a.tag||"")+(b.tag||"");runs.splice(j,1);ch=true;break}
        if(a.dir===OPP[b.dir]){if(a.len>=b.len){a.len-=b.len;a.tag=(a.tag||"")+(b.tag||"");runs.splice(j,1)}else{b.len-=a.len;b.tag=(a.tag||"")+(b.tag||"");runs.splice(i,1)}ch=true;break}
      }
    }
  };
  // дрібні «тремтіння» прибираємо, починаючи з найкоротшого
  const minLen=big*0.07;
  for(let guard=0;guard<400;guard++){
    merge();
    let k=-1;for(let i=0;i<runs.length;i++)if(runs[i].len<minLen&&(k<0||runs[i].len<runs[k].len))k=i;
    if(k<0)break;const nb=runs[(k+1)%runs.length];if(runs[k].tag&&nb)nb.tag=(nb.tag||"")+runs[k].tag;runs.splice(k,1);
  }
  merge();
  // місце, де лінія зійшлась (початок = кінець): палець там часто робить зайвий «гачок» або сходинку — прибираємо їх
  for(let guard=0;guard<4&&runs.length>4;guard++){
    const n=runs.length,near=(i:number)=>[-2,-1,0,1,2].some(d=>!!runs[((i+d)%n+n)%n].tag);
    let hit=-1;
    for(let i=0;i<n&&hit<0;i++){const a=runs[((i-1)%n+n)%n],b=runs[i],c=runs[(i+1)%n];if(!near(i))continue;
      if(a.dir===OPP[c.dir]&&b.len<big*0.2&&Math.min(a.len,c.len)<big*0.25)hit=i;       // гачок: туди–вбік–назад
      else if(a.dir===c.dir&&b.len<big*0.12)hit=i;                                     // маленька сходинка
    }
    if(hit<0)break;
    const nb=runs[(hit+1)%n];nb.tag=(nb.tag||"")+(runs[hit].tag||"")+"x";runs.splice(hit,1);merge();
  }
  if(runs.length<4||runs.length%2)return null;
  for(let i=0;i<runs.length;i++)if(AX(runs[i].dir)===AX(runs[(i+1)%runs.length].dir))return null;
  let edges:Edge[]=runs.map(r=>({dir:r.dir,sketch:r.len}));
  // за годинниковою стрілкою
  const v=verts(edges.map(e=>e.sketch),edges);let area=0;
  for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];area+=a[0]*b[1]-b[0]*a[1]}
  if(area<0)edges=edges.slice().reverse().map(e=>({dir:OPP[e.dir],sketch:e.sketch}));
  // старт — верхній лівий кут, перша стіна йде вправо
  const vv=verts(edges.map(e=>e.sketch),edges);let s=0;
  for(let i=1;i<vv.length;i++)if(vv[i][1]<vv[s][1]-1e-6||(Math.abs(vv[i][1]-vv[s][1])<1e-6&&vv[i][0]<vv[s][0]))s=i;
  edges=[...edges.slice(s),...edges.slice(0,s)];
  if(edges[0].dir!=="R"){const k=edges.findIndex(e=>e.dir==="R");if(k<0)return null;edges=[...edges.slice(k),...edges.slice(0,k)]}
  return edges;
}

/** вершини контуру за довжинами стін (перша вершина — 0,0) */
export function verts(lens:number[],edges:{dir:Dir}[]):Pt[]{
  const out:Pt[]=[];let x=0,y=0;
  for(let i=0;i<edges.length;i++){out.push([x,y]);const d=VEC[edges[i].dir];x+=d[0]*lens[i];y+=d[1]*lens[i]}
  return out;
}

export type Solved={lens:(number|null)[];auto:boolean[];errors:string[];ok:boolean};
/** Довжини стін: вписані користувачем (null — порожньо). Якщо на осі порожня рівно одна стіна — рахуємо її самі.
 *  legs[i] — скіс 45° після стіни i: катет (діагональ / √2), що йде вздовж стіни i і вздовж наступної. */
export function solve(edges:{dir:Dir}[],entered:(number|null)[],legs?:number[]):Solved{
  const lens=entered.slice(),auto=edges.map(()=>false),errors:string[]=[];
  const n=edges.length;
  const legSum=(d:Dir)=>legs?legs.reduce((a,l,i)=>a+(l>0?(edges[i].dir===d?l:0)+(edges[(i+1)%n].dir===d?l:0):0),0):0;
  for(const [pos,neg,label] of [["R","L","Горизонтальні"],["D","U","Вертикальні"]] as const){
    const idx=edges.map((e,i)=>i).filter(i=>edges[i].dir===pos||edges[i].dir===neg);
    const empty=idx.filter(i=>lens[i]===null);
    const sum=(d:Dir)=>idx.filter(i=>edges[i].dir===d&&lens[i]!==null).reduce((a,i)=>a+(lens[i] as number),0)+legSum(d);
    if(empty.length===1){const i=empty[0];const v=edges[i].dir===pos?sum(neg)-sum(pos):sum(pos)-sum(neg);
      if(v>0.01){lens[i]=Math.round(v*16)/16;auto[i]=true}else errors.push(`${label} стіни не сходяться: остання виходить ${v<=0?"нульова або від'ємна":"замала"}. Перевір цифри.`)}
    else if(empty.length===0){const a=sum(pos),b=sum(neg);if(Math.abs(a-b)>0.5)errors.push(`${label} стіни не сходяться: в один бік ${fmt(a)}, у другий ${fmt(b)} (різниця ${fmt(Math.abs(a-b))}).`)}
  }
  return {lens,auto,errors,ok:!errors.length&&lens.every(x=>x!==null&&x>0)};
}
const fmt=(n:number)=>`${Math.round(n*100)/100}"`;

/** площа (кв. дюйми) і периметр (дюйми) контуру */
export function outlineStats(pts:Pt[]){
  let a=0,p=0;
  for(let i=0;i<pts.length;i++){const u=pts[i],v=pts[(i+1)%pts.length];a+=u[0]*v[1]-v[0]*u[1];p+=Math.hypot(v[0]-u[0],v[1]-u[1])}
  return {areaIn2:Math.abs(a)/2,perimIn:p};
}

/** Контур → головний прямокутник (довжина × ширина) і вирізані кути для плану та 3D. */
export function outlineToRect(drawn:Pt[],pts:Pt[]=drawn){
  // pts — контур без скосів (для вирізів у плані й 3D), drawn — справжній контур зі скосами
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const eq=(a:number,b:number)=>Math.abs(a-b)<0.01;
  const on=(axis:0|1,val:number)=>pts.filter(p=>eq(p[axis],val)).map(p=>p[axis===0?1:0]);
  const top=on(1,y0),bottom=on(1,y1),left=on(0,x0),right=on(0,x1);
  const cuts:{wall:string;a:number;d:number}[]=[];
  const push=(wall:string,a:number,d:number)=>{if(a>0.01&&d>0.01)cuts.push({wall,a,d})};
  push("AB",x1-Math.max(...top),Math.min(...right)-y0);       // верх-право: вздовж A, вздовж B
  push("BC",y1-Math.max(...right),x1-Math.max(...bottom));    // низ-право: вздовж B, вздовж C
  push("CD",Math.min(...bottom)-x0,y1-Math.max(...left));     // низ-ліво: вздовж C, вздовж D
  push("DA",Math.min(...left)-y0,Math.min(...top)-x0);        // верх-ліво: вздовж D, вздовж A
  return {L:x1-x0,W:y1-y0,cuts,norm:drawn.map(p=>[p[0]-x0,p[1]-y0] as Pt)};
}

/** стіна з вписаним розміром (текст, як набрав користувач); ch — скіс 45° у куті після цієї стіни (довжина скосу, текст; "" — ще не вписано) */
export type EdgeV=Edge&{val:string;ch?:string};
/** вершини зі скосами: lens — прямі частини стін, legs — катети скосів після кожної стіни */
export function vertsCh(lens:number[],edges:{dir:Dir}[],legs:number[]):Pt[]{
  const out:Pt[]=[];let x=0,y=0;const n=edges.length;
  for(let i=0;i<n;i++){
    out.push([x,y]);const d=VEC[edges[i].dir];x+=d[0]*lens[i];y+=d[1]*lens[i];
    const l=legs[i]||0;if(l>0){out.push([x,y]);const e=VEC[edges[(i+1)%n].dir];x+=(d[0]+e[0])*l;y+=(d[1]+e[1])*l}
  }
  return out;
}
/** повні довжини стін до кута (пряма частина + катети скосів з обох кінців) — для контуру без скосів */
export const fullLens=(lens:number[],legs:number[])=>lens.map((l,i)=>l+(legs[i]||0)+(legs[(i-1+lens.length)%lens.length]||0));
/** перетягування стіни i на mv (одиниці, вздовж перпендикуляра): на скільки зміниться попередня і наступна стіна */
export function dragDelta(edges:{dir:Dir}[],i:number,mv:number){
  const n=edges.length,e=edges[i],p=edges[(i-1+n)%n],q=edges[(i+1)%n];
  const m:Pt=AX(e.dir)==="h"?[0,mv]:[mv,0];
  const dot=(a:Pt,b:Pt)=>a[0]*b[0]+a[1]*b[1];
  return {prev:(i-1+n)%n,dp:dot(m,VEC[p.dir]),next:(i+1)%n,dn:-dot(m,VEC[q.dir])};
}
/** масштаб ескізу: дюймів на одиницю малюнка (медіана по вписаних стінах) */
export function sketchScale(edges:Edge[],solved:(number|null)[]){
  const ratios=edges.map((e,i)=>solved[i]!==null?(solved[i] as number)/e.sketch:null).filter((x):x is number=>x!==null).sort((a,b)=>a-b);
  return ratios.length?ratios[Math.floor(ratios.length/2)]:1;
}
const TURN_OUT:Record<Dir,Dir>={R:"U",D:"R",L:"D",U:"L"},TURN_IN:Record<Dir,Dir>={R:"D",D:"L",L:"U",U:"R"};
/** сусідні стіни одного напрямку зливаємо, протилежні — віднімаємо; контур лишається замкнутим ламаним під 90° */
function tidy(list:EdgeV[]):EdgeV[]{
  const e=list.map(x=>({...x}));let ch=true;
  while(ch&&e.length>4){ch=false;
    for(let i=0;i<e.length;i++){const j=(i+1)%e.length,a=e[i],b=e[j];
      if(a.dir===b.dir){a.sketch+=b.sketch;a.val="";a.ch=b.ch;e.splice(j,1);ch=true;break}
      if(a.dir===OPP[b.dir]){if(a.sketch>=b.sketch){a.sketch-=b.sketch;a.val="";e.splice(j,1);if(a.sketch<1e-6)e.splice(e.indexOf(a),1)}else{b.sketch-=a.sketch;b.val="";e.splice(i,1)}ch=true;break}
    }
  }
  return e;
}
/** прибрати стіну (зайвий виступ): дві сусідні стіни стають однією. null — якщо вийшла б не кімната */
export function removeEdge(list:EdgeV[],i:number):EdgeV[]|null{
  if(list.length<=4)return null;
  const out=tidy(list.filter((_,k)=>k!==i));
  if(out.length<4||out.length%2)return null;
  for(let k=0;k<out.length;k++)if(AX(out[k].dir)===AX(out[(k+1)%out.length].dir))return null;
  return out;
}
/** додати кут посеред стіни: стіна ділиться навпіл, між половинами — сходинка назовні або всередину */
export function addJog(list:EdgeV[],i:number,inward:boolean):EdgeV[]{
  const e=list[i],half=e.sketch/2,jog:Dir=(inward?TURN_IN:TURN_OUT)[e.dir];
  const out=[...list.slice(0,i),{dir:e.dir,sketch:half,val:""},{dir:jog,sketch:Math.max(Math.min(half*0.5,Math.max(...list.map(x=>x.sketch))*0.15),1),val:""},{dir:e.dir,sketch:half,val:"",ch:e.ch},...list.slice(i+1)];
  return out;
}
/** довжини для малюнка: вписані — справжні, решта — за пропорцією ескізу; невписані підганяємо, щоб контур замкнувся */
export function displayLens(edges:Edge[],solved:(number|null)[],legs?:number[]):number[]{
  const k=sketchScale(edges,solved);
  const lens=edges.map((e,i)=>solved[i]??e.sketch*k);
  const n=edges.length;
  const legOn=(d:Dir)=>legs?legs.reduce((a,l,i)=>a+(l>0?(edges[i].dir===d?l:0)+(edges[(i+1)%n].dir===d?l:0):0),0):0;
  for(const [pos,neg] of [["R","L"],["D","U"]] as [Dir,Dir][]){
    const sum=(d:Dir,free:boolean)=>edges.reduce((a,e,i)=>a+(e.dir===d&&(solved[i]===null)===free?lens[i]:0),0)+(free?0:legOn(d));
    const P=sum(pos,false)+sum(pos,true),N=sum(neg,false)+sum(neg,true);if(Math.abs(P-N)<1e-6)continue;
    // тягнемо невписані стіни того боку, де їх можна змінити
    const fix=(d:Dir,target:number)=>{const fixed=sum(d,false),free=sum(d,true);if(free<=0||target-fixed<=0)return false;const f=(target-fixed)/free;edges.forEach((e,i)=>{if(e.dir===d&&solved[i]===null)lens[i]*=f});return true};
    if(!fix(neg,P))fix(pos,N);
  }
  return lens;
}
