"use client";
import {useRef,useState} from "react";
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
  const [view,setView]=useState<"2d"|"3d">("2d");
  // ---- 3D, яке можна крутити пальцем (як у SketchUp): поворот навколо центру кімнати ----
  const [rot,setRot]=useState({yaw:35,pitch:30});
  const dragRef=useRef<{x:number;y:number;yaw:number;pitch:number}|null>(null);
  const Hh=H||96;
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2,cz=Hh/2;
  const ya=rot.yaw*Math.PI/180,pa=rot.pitch*Math.PI/180;
  const P=(x:number,y:number,z:number):V=>{const x1=(x-cx)*Math.cos(ya)-(y-cy)*Math.sin(ya),y1=(x-cx)*Math.sin(ya)+(y-cy)*Math.cos(ya);return [x1,y1*Math.sin(pa)-(z-cz)*Math.cos(pa)]};
  const depth=(x:number,y:number,z:number)=>{const y1=(x-cx)*Math.sin(ya)+(y-cy)*Math.cos(ya);return y1*Math.cos(pa)+(z-cz)*Math.sin(pa)};
  const R=Math.hypot(maxX-minX,maxY-minY,Hh)/2;
  const ik=(Math.min(vw,320)-2*pad)/(2*R);
  const IX=(p:V)=>vw/2+p[0]*ik,IY=(p:V)=>160+p[1]*ik;
  const ivh=320;
  const walls3=pts.map((a,i)=>{const b=pts[(i+1)%pts.length];return {a,b,d:(depth(a[0],a[1],Hh/2)+depth(b[0],b[1],Hh/2))/2,nx:(b[1]-a[1]),ny:-(b[0]-a[0])}}).filter(w=>w.a[0]!==w.b[0]||w.a[1]!==w.b[1]).sort((x,y)=>x.d-y.d);
  // зовнішня нормаль стіни дивиться на глядача → стіна передня (малюємо прозоро)
  const facing=(w:{nx:number;ny:number})=>{const vx=-Math.sin(ya)*Math.cos(pa),vy=-Math.cos(ya)*Math.cos(pa);return w.nx*vx+w.ny*vy<0};
  const quad=(a:V,b:V,z0:number,z1:number)=>[P(a[0],a[1],z0),P(b[0],b[1],z0),P(b[0],b[1],z1),P(a[0],a[1],z1)].map(q=>`${IX(q)},${IY(q)}`).join(" ");
  const onSeg=(a:V,b:V)=>(q:V)=>Math.abs((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]))<0.01&&Math.min(a[0],b[0])-0.01<=q[0]&&q[0]<=Math.max(a[0],b[0])+0.01&&Math.min(a[1],b[1])-0.01<=q[1]&&q[1]<=Math.max(a[1],b[1])+0.01;
  const openH=(o:{door:boolean})=>o.door?[0,80]:[36,84];
  const floorUp=depth(cx,cy,0)<depth(cx,cy,Hh); // дивимось зверху → підлогу малюємо першою
  const floorPoly=<polygon points={pts.map(q=>`${IX(P(q[0],q[1],0))},${IY(P(q[0],q[1],0))}`).join(" ")} fill="#e4e7ec" stroke="#98a2b3" strokeWidth={1}/>;
  const view3d=<svg viewBox={`0 0 ${vw} ${ivh}`} width="100%" style={{maxWidth:440,display:"block",background:"#fff",border:"1px solid #e4e7ec",borderRadius:12,touchAction:"none",cursor:"grab",userSelect:"none"}}
    onPointerDown={e=>{dragRef.current={x:e.clientX,y:e.clientY,yaw:rot.yaw,pitch:rot.pitch};(e.target as Element).setPointerCapture?.(e.pointerId)}}
    onPointerMove={e=>{const d=dragRef.current;if(!d)return;setRot({yaw:d.yaw+(e.clientX-d.x)*0.6,pitch:Math.max(5,Math.min(85,d.pitch+(e.clientY-d.y)*0.4))})}}
    onPointerUp={()=>{dragRef.current=null}} onPointerCancel={()=>{dragRef.current=null}}>
    {floorUp&&floorPoly}
    {walls3.map((w,i)=>{const front=facing(w);return <g key={i}>
      <polygon points={quad(w.a,w.b,0,Hh)} fill={front?"none":"#f2f4f7"} stroke={front?"#b2ccff":"#101828"} strokeWidth={front?1:2} strokeDasharray={front?"4 3":undefined}/>
      {segs.filter(sg=>onSeg(w.a,w.b)(sg.p)&&onSeg(w.a,w.b)(sg.q)).map((sg,j)=>{const [z0,z1]=openH(sg);return <polygon key={j} points={quad(sg.p,sg.q,z0,Math.min(z1,Hh))} fill={sg.door?"#dbe7ff":"#d1fadf"} stroke={sg.door?"#2f6df6":"#12b76a"} strokeWidth={1} opacity={front?0.6:1}/>})}
    </g>})}
    {!floorUp&&floorPoly}
    <text x={vw/2} y={16} textAnchor="middle" fontSize={12} fontWeight={700} fill="#344054">{room.name||"Кімната"} · {f(L)} × {f(W)} × {f(Hh)}</text>
    <text x={vw/2} y={ivh-8} textAnchor="middle" fontSize={11} fill="#98a2b3">тягни пальцем, щоб покрутити</text>
  </svg>;
  return <div style={{marginTop:10}}>
    <div style={{display:"flex",gap:6,marginBottom:6}}>{(["2d","3d"] as const).map(v=><button key={v} type="button" onClick={()=>{setView(v);if(v==="3d")setRot({yaw:35,pitch:30})}} style={{padding:"5px 12px",borderRadius:10,fontWeight:800,background:view===v?"#2f6df6":"#eef2f7",color:view===v?"#fff":"#344054"}}>{v==="2d"?"План":"3D"}</button>)}</div>
    {view==="3d"?view3d:<svg viewBox={`0 0 ${vw} ${vh}`} width="100%" style={{maxWidth:440,display:"block",background:"#fff",border:"1px solid #e4e7ec",borderRadius:12}}>
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
    </svg>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:8}}>
      {WALLS.map((wl,kk)=>{const opsA=byWall[wl].reduce((a,o)=>a+(parseInches(o.w)||0)*(parseInches(o.h)||0)/144*(o.count||1),0);const extra=parts.filter(p=>p.kind==="add"&&p.wall===wl).reduce((a,p)=>a+2*p.d,0);const area=H?Math.round(((len[kk]+extra)*H/144-opsA)*10)/10:null;
        return <div key={wl} className="linetotal" style={{padding:8}}><span>Стіна {wl}</span><b style={{fontSize:13}}>{f(len[kk])}{H?` × ${f(H)}`:""}</b><small className="muted" style={{display:"block",fontSize:11}}>{area!==null?`${area} sq ft`:"висота?"}{extra?" (з нішею)":""}{byWall[wl].length?` · ${byWall[wl].map(o=>o.name).join(", ")}`:""}</small></div>})}
    </div>
    {onOpening&&ops.length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8,alignItems:"center"}}><small className="muted">Де на плані:</small>
      {onOpening&&ops.map(o=><span key={o.id} style={{display:"inline-flex",gap:4,alignItems:"center",fontSize:13}}>{o.name}<select value={o.wall} onChange={e=>onOpening(o.id,{wall:e.target.value})} style={{width:"auto",padding:"4px 6px"}}>{WALLS.map(x=><option key={x}>{x}</option>)}</select></span>)}

    </div>}
    <small className="muted">Схема за твоїми розмірами, не креслення. Розміри стін A–D — головного прямокутника.</small>
  </div>;
}
