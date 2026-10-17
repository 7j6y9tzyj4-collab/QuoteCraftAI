"use client";
import {parseInches,fmtInches,roomAreas,type Room,type Opening,type Part} from "@/lib/survey";

// Ескіз кімнати з розмірів: вид зверху з нішами/вирізами й дверима/вікнами, розгортка 4 стін.
const WALLS=["A","B","C","D"] as const; // A — верх (довжина), B — право (ширина), C — низ, D — ліво
type V=[number,number];
const add=(a:V,b:V,k=1):V=>[a[0]+b[0]*k,a[1]+b[1]*k];

export default function RoomSketch({room,onOpening,onPart}:{room:Room;onOpening?:(id:string,patch:Partial<Opening>)=>void;onPart?:(id:string,patch:Partial<Part>)=>void}){
  const L=parseInches(room.length),W=parseInches(room.width),H=parseInches(room.height);
  if(!L||!W)return null;
  const corner:V[]=[[0,0],[L,0],[L,W],[0,W]];
  const dir:V[]=[[1,0],[0,1],[-1,0],[0,-1]];
  const nrm:V[]=[[0,-1],[1,0],[0,1],[-1,0]];
  const len=[L,W,L,W];
  const parts=(room.parts||[]).map((p,i)=>({...p,a:parseInches(p.length)||0,d:parseInches(p.depth)||0,wall:p.wall||(p.kind==="cut"?["AB","BC","CD","DA"][i%4]:WALLS[i%4]),pos:p.pos||"end"})).filter(p=>p.a>0&&p.d>0);
  const cut:Record<number,{a:number;d:number}|undefined>={};
  for(const p of parts)if(p.kind==="cut"){const k=["AB","BC","CD","DA"].indexOf(p.wall);if(k>=0&&!cut[k])cut[k]={a:Math.min(p.a,len[k]-1),d:Math.min(p.d,len[(k+1)%4]-1)}}
  const pts:V[]=[];
  for(let k=0;k<4;k++){
    const startOff=cut[(k+3)%4]?.d||0,endOff=cut[k]?.a||0;
    pts.push(add(corner[k],dir[k],startOff));
    const alc=parts.filter(p=>p.kind==="add"&&p.wall===WALLS[k]).map(p=>{const free=len[k]-startOff-endOff;const a=Math.min(p.a,free);const t=p.pos==="start"?startOff:p.pos==="middle"?startOff+(free-a)/2:len[k]-endOff-a;return {t,a,d:p.d}}).sort((x,y)=>x.t-y.t);
    for(const x of alc){const p1=add(corner[k],dir[k],x.t);pts.push(p1,add(p1,nrm[k],x.d),add(add(p1,nrm[k],x.d),dir[k],x.a),add(p1,dir[k],x.a))}
    const endPt=add(corner[k],dir[k],len[k]-endOff);pts.push(endPt);
    const c=cut[k];if(c){const q=add(endPt,dir[(k+1)%4],c.d);pts.push(q,add(q,dir[k],c.a))}
  }
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const vw=340,pad=38;
  const k=Math.min((vw-2*pad)/(maxX-minX),(250-2*pad)/(maxY-minY));
  const X=(x:number)=>pad+(x-minX)*k,Y=(y:number)=>pad+(y-minY)*k;
  const vh=(maxY-minY)*k+2*pad;
  const poly=pts.map(p=>`${X(p[0])},${Y(p[1])}`).join(" ");

  // прорізи — по головних стінах, по черзі
  const ops=(room.openings||[]).map((o,i)=>({...o,wall:o.wall||WALLS[i%4],ow:parseInches(o.w)||0}));
  const byWall:Record<string,typeof ops>={A:[],B:[],C:[],D:[]};for(const o of ops)byWall[o.wall].push(o);
  const segs:{p:V;q:V;k:number;door:boolean}[]=[];
  for(let k=0;k<4;k++){const list=byWall[WALLS[k]];const total=list.reduce((a,o)=>a+o.ow*(o.count||1),0);const gap=Math.max(0,(len[k]-total)/(list.length+1));let cur=gap;
    for(const o of list)for(let c=0;c<(o.count||1);c++){segs.push({p:add(corner[k],dir[k],cur),q:add(corner[k],dir[k],cur+o.ow),k,door:/двер|door/i.test(o.name)});cur+=o.ow+gap}}
  const f=(i:number)=>fmtInches(i);
  const mid=(k:number)=>add(corner[k],dir[k],len[k]/2);
  const lbl=(kk:number)=>{const m=mid(kk);const edge=kk===0?minY:kk===1?maxX:kk===2?maxY:minX;const o:V=kk%2?[edge,m[1]]:[m[0],edge];const oo=add(o,nrm[kk],14/k);return {x:X(oo[0]),y:Y(oo[1]),rot:kk%2?90*(kk===1?1:-1):0}};
  const areas=roomAreas(room);
  return <div style={{marginTop:10}}>
    <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" style={{maxWidth:440,display:"block",background:"#fff",border:"1px solid #e4e7ec",borderRadius:12}}>
      <polygon points={poly} fill="#f8fafc" stroke="#101828" strokeWidth={3} strokeLinejoin="miter"/>
      {segs.map((s,i)=><g key={i}>
        <line x1={X(s.p[0])} y1={Y(s.p[1])} x2={X(s.q[0])} y2={Y(s.q[1])} stroke="#fff" strokeWidth={5}/>
        <line x1={X(s.p[0])} y1={Y(s.p[1])} x2={X(s.q[0])} y2={Y(s.q[1])} stroke={s.door?"#2f6df6":"#12b76a"} strokeWidth={s.door?2:4} strokeDasharray={s.door?undefined:"3 3"}/>
        {s.door&&(()=>{const w=Math.hypot(s.q[0]-s.p[0],s.q[1]-s.p[1]);const e=add(s.p,nrm[s.k],-w);return <path d={`M${X(s.q[0])},${Y(s.q[1])} A${w*k},${w*k} 0 0 1 ${X(e[0])},${Y(e[1])}`} fill="none" stroke="#2f6df6" strokeWidth={1}/>})()}
      </g>)}
      {[0,1,2,3].map(kk=>{const l=lbl(kk);return <text key={kk} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={700} fill="#344054" transform={l.rot?`rotate(${l.rot} ${l.x} ${l.y})`:undefined}>{WALLS[kk]} · {f(len[kk])}</text>})}
      {parts.map((p,i)=>{if(p.kind!=="cut")return null;const kk=["AB","BC","CD","DA"].indexOf(p.wall);if(kk<0)return null;const c=add(add(corner[(kk+1)%4],dir[kk],-p.a/2),dir[(kk+1)%4],p.d/2);return <text key={"c"+i} x={X(c[0])} y={Y(c[1])} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#98a2b3">{f(p.a)}×{f(p.d)}</text>})}
      {parts.map((p,i)=>{if(p.kind!=="add")return null;const kk=WALLS.indexOf(p.wall as any);if(kk<0)return null;const free=len[kk];const t=p.pos==="start"?0:p.pos==="middle"?(free-p.a)/2:free-p.a;const c=add(add(corner[kk],dir[kk],t+p.a/2),nrm[kk],p.d/2);return <text key={"a"+i} x={X(c[0])} y={Y(c[1])} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#344054">{p.name||"ніша"} {f(p.a)}×{f(p.d)}</text>})}
      <text x={X(L/2)} y={Y(W/2)-4} textAnchor="middle" fontSize={13} fontWeight={800} fill="#101828">{room.name||"Кімната"}</text>
      <text x={X(L/2)} y={Y(W/2)+12} textAnchor="middle" fontSize={11} fill="#667085">{areas.floorSqft} sq ft{H?` · стеля ${f(H)}`:""}</text>
    </svg>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:8}}>
      {WALLS.map((wl,kk)=>{const opsA=byWall[wl].reduce((a,o)=>a+(parseInches(o.w)||0)*(parseInches(o.h)||0)/144*(o.count||1),0);const extra=parts.filter(p=>p.kind==="add"&&p.wall===wl).reduce((a,p)=>a+2*p.d,0);const area=H?Math.round(((len[kk]+extra)*H/144-opsA)*10)/10:null;
        return <div key={wl} className="linetotal" style={{padding:8}}><span>Стіна {wl}</span><b style={{fontSize:13}}>{f(len[kk])}{H?` × ${f(H)}`:""}</b><small className="muted" style={{display:"block",fontSize:11}}>{area!==null?`${area} sq ft`:"висота?"}{extra?" (з нішею)":""}{byWall[wl].length?` · ${byWall[wl].map(o=>o.name).join(", ")}`:""}</small></div>})}
    </div>
    {(onOpening&&ops.length>0||onPart&&parts.length>0)&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8,alignItems:"center"}}><small className="muted">Де на плані:</small>
      {onOpening&&ops.map(o=><span key={o.id} style={{display:"inline-flex",gap:4,alignItems:"center",fontSize:13}}>{o.name}<select value={o.wall} onChange={e=>onOpening(o.id,{wall:e.target.value})} style={{width:"auto",padding:"4px 6px"}}>{WALLS.map(x=><option key={x}>{x}</option>)}</select></span>)}
      {onPart&&parts.map(p=><span key={p.id} style={{display:"inline-flex",gap:4,alignItems:"center",fontSize:13}}>{p.kind==="cut"?"виріз, кут":"ніша, стіна"}
        <select value={p.wall} onChange={e=>onPart(p.id,{wall:e.target.value})} style={{width:"auto",padding:"4px 6px"}}>{(p.kind==="cut"?["AB","BC","CD","DA"]:[...WALLS]).map(x=><option key={x}>{x}</option>)}</select>
        {p.kind==="add"&&<select value={p.pos} onChange={e=>onPart(p.id,{pos:e.target.value})} style={{width:"auto",padding:"4px 6px"}}><option value="start">початок</option><option value="middle">середина</option><option value="end">кінець</option></select>}
      </span>)}
    </div>}
    <small className="muted">Схема за твоїми розмірами, не креслення. Розміри стін A–D — головного прямокутника.</small>
  </div>;
}
