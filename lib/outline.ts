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
  // напрямок у кожній точці (згладжено) → відрізки одного напрямку
  const w=3;type Run={dir:Dir;len:number};const runs:Run[]=[];
  for(let i=0;i<pts.length-1;i++){
    const a=pts[Math.max(0,i-w)],b=pts[Math.min(pts.length-1,i+w)];const dx=b[0]-a[0],dy=b[1]-a[1];
    const dir:Dir=Math.abs(dx)>=Math.abs(dy)?(dx>=0?"R":"L"):(dy>=0?"D":"U");
    const last=runs[runs.length-1];if(last&&last.dir===dir)last.len+=step;else runs.push({dir,len:step});
  }
  const merge=()=>{ // сусіди одного напрямку зливаються; протилежні на одній осі — віднімаються
    let ch=true;while(ch&&runs.length>1){ch=false;
      for(let i=0;i<runs.length;i++){const j=(i+1)%runs.length;if(i===j)break;const a=runs[i],b=runs[j];
        if(a.dir===b.dir){a.len+=b.len;runs.splice(j,1);ch=true;break}
        if(a.dir===OPP[b.dir]){if(a.len>=b.len){a.len-=b.len;runs.splice(j,1)}else{b.len-=a.len;runs.splice(i,1)}ch=true;break}
      }
    }
  };
  // дрібні «тремтіння» прибираємо, починаючи з найкоротшого
  const minLen=big*0.07;
  for(let guard=0;guard<400;guard++){
    merge();
    let k=-1;for(let i=0;i<runs.length;i++)if(runs[i].len<minLen&&(k<0||runs[i].len<runs[k].len))k=i;
    if(k<0)break;runs.splice(k,1);
  }
  merge();
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
/** Довжини стін: вписані користувачем (null — порожньо). Якщо на осі порожня рівно одна стіна — рахуємо її самі. */
export function solve(edges:{dir:Dir}[],entered:(number|null)[]):Solved{
  const lens=entered.slice(),auto=edges.map(()=>false),errors:string[]=[];
  for(const [pos,neg,label] of [["R","L","Горизонтальні"],["D","U","Вертикальні"]] as const){
    const idx=edges.map((e,i)=>i).filter(i=>edges[i].dir===pos||edges[i].dir===neg);
    const empty=idx.filter(i=>lens[i]===null);
    const sum=(d:Dir)=>idx.filter(i=>edges[i].dir===d&&lens[i]!==null).reduce((a,i)=>a+(lens[i] as number),0);
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
  for(let i=0;i<pts.length;i++){const u=pts[i],v=pts[(i+1)%pts.length];a+=u[0]*v[1]-v[0]*u[1];p+=Math.abs(v[0]-u[0])+Math.abs(v[1]-u[1])}
  return {areaIn2:Math.abs(a)/2,perimIn:p};
}

/** Контур → головний прямокутник (довжина × ширина) і вирізані кути для плану та 3D. */
export function outlineToRect(pts:Pt[]){
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
  return {L:x1-x0,W:y1-y0,cuts,norm:pts.map(p=>[p[0]-x0,p[1]-y0] as Pt)};
}
