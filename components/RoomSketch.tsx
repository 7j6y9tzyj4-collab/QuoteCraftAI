"use client";
import {useRef,useState} from "react";
import dynamic from "next/dynamic";
const Room3D=dynamic(()=>import("@/components/Room3D"),{ssr:false,loading:()=>null});
import {parseInches,fmtInches,roomAreas,FIXTURES,type Room,type Opening,type Part,type Fixture} from "@/lib/survey";

// Ескіз кімнати з розмірів: вид зверху з нішами/вирізами й дверима/вікнами, розгортка 4 стін.
const WALLS=["A","B","C","D"] as const; // A — верх (довжина), B — право (ширина), C — низ, D — ліво
type V=[number,number];
const add=(a:V,b:V,k=1):V=>[a[0]+b[0]*k,a[1]+b[1]*k];


// Умовні позначення як на планах: у дюймах, (0,0) — на стіні ліворуч, y — углиб кімнати
const SW=1.2; // товщина лінії в дюймах (масштабується)
function fixtureSymbol(type:string,w:number,d:number){
  const st={fill:"#fff",stroke:"#344054",strokeWidth:SW,vectorEffect:"non-scaling-stroke" as const};
  const thin={fill:"none",stroke:"#667085",strokeWidth:SW*0.7,vectorEffect:"non-scaling-stroke" as const};
  switch(type){
    case "toilet":{const tw=w*0.9,td=d*0.3;return <g><rect x={(w-tw)/2} y={0} width={tw} height={td} rx={1.5} {...st}/><ellipse cx={w/2} cy={td+(d-td)/2} rx={w*0.42} ry={(d-td)/2*0.95} {...st}/><ellipse cx={w/2} cy={td+(d-td)/2+1} rx={w*0.28} ry={(d-td)/2*0.6} {...thin}/></g>}
    case "vanity":return <g><rect x={0} y={0} width={w} height={d} rx={1} {...st}/><ellipse cx={w/2} cy={d*0.5} rx={Math.min(w*0.3,9)} ry={Math.min(d*0.32,6.5)} {...st}/><circle cx={w/2} cy={d*0.18} r={0.9} {...thin}/></g>;
    case "sink":return <g><rect x={0} y={0} width={w} height={d} rx={3} {...st}/><ellipse cx={w/2} cy={d*0.55} rx={w*0.36} ry={d*0.32} {...thin}/><circle cx={w/2} cy={d*0.2} r={0.9} {...thin}/></g>;
    case "tub":return <g><rect x={0} y={0} width={w} height={d} rx={2} {...st}/><rect x={2.5} y={2.5} width={w-5} height={d-5} rx={Math.min(w,d)*0.35} {...thin}/><circle cx={w*0.12} cy={d/2} r={1.6} {...thin}/></g>;
    case "shower":return <g><rect x={0} y={0} width={w} height={d} {...st}/><line x1={0} y1={0} x2={w} y2={d} {...thin}/><line x1={w} y1={0} x2={0} y2={d} {...thin}/><circle cx={w/2} cy={d/2} r={2} {...st}/></g>;
    case "washer":case "dryer":return <g><rect x={0} y={0} width={w} height={d} rx={1} {...st}/><circle cx={w/2} cy={d*0.55} r={Math.min(w,d)*0.33} {...thin}/><rect x={2} y={1.5} width={w-4} height={3} {...thin}/></g>;
    case "fan":return <g><circle cx={w/2} cy={d/2} r={Math.min(w,d)/2} {...st}/><path d={`M${w/2},${d/2} m-4,-4 l8,8 m0,-8 l-8,8`} {...thin}/></g>;
    case "light":return <g><circle cx={w/2} cy={d/2} r={Math.min(w,d)/2} {...st}/><circle cx={w/2} cy={d/2} r={Math.min(w,d)/5} {...thin}/></g>;
    case "heater":return <g><rect x={0} y={0} width={w} height={d} {...st}/>{Array.from({length:Math.max(2,Math.floor(w/3))},(_,i)=><line key={i} x1={(i+1)*w/(Math.max(2,Math.floor(w/3))+1)} y1={0} x2={(i+1)*w/(Math.max(2,Math.floor(w/3))+1)} y2={d} {...thin}/>)}</g>;
    case "cabinet":return <g><rect x={0} y={0} width={w} height={d} {...st}/><line x1={0} y1={0} x2={w} y2={d} {...thin}/><line x1={w} y1={0} x2={0} y2={d} {...thin}/></g>;
    default:return <rect x={0} y={0} width={w} height={d} rx={1} {...st}/>;
  }
}
const FIX_H:Record<string,number>={toilet:30,vanity:34,sink:34,tub:20,shower:80,washer:36,dryer:36,fan:6,light:6,heater:24,cabinet:84,other:30};
const CEIL=new Set(["fan","light"]);
export default function RoomSketch({room,onOpening,onPart,onFixture}:{room:Room;onOpening?:(id:string,patch:Partial<Opening>)=>void;onPart?:(id:string,patch:Partial<Part>)=>void;onFixture?:(id:string,patch:Partial<Fixture>|null)=>void}){
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
  const segs:{p:V;q:V;k:number;door:boolean;swing:"in"|"out";hinge:"left"|"right";id:string}[]=[];
  for(let k=0;k<4;k++){const list=byWall[WALLS[k]];const total=list.reduce((a,o)=>a+o.ow*(o.count||1),0);const gap=Math.max(0,(len[k]-total)/(list.length+1));let cur=gap;
    for(const o of list)for(let c=0;c<(o.count||1);c++){const start=typeof o.t==="number"&&c===0?Math.max(0,Math.min(len[k]-o.ow,o.t*(len[k]-o.ow))):cur;segs.push({p:add(corner[k],dir[k],start),q:add(corner[k],dir[k],start+o.ow),k,door:/двер|door/i.test(o.name),swing:o.swing||"in",hinge:o.hinge||"left",id:o.id});cur=start+o.ow+gap}}
  const f=(i:number)=>fmtInches(i);
  const mid=(k:number)=>add(corner[k],dir[k],len[k]/2);
  const lbl=(kk:number)=>{const m=mid(kk);const edge=kk===0?minY:kk===1?maxX:kk===2?maxY:minX;const o:V=kk%2?[edge,m[1]]:[m[0],edge];const oo=add(o,nrm[kk],14/k);return {x:X(oo[0]),y:Y(oo[1]),rot:kk%2?90*(kk===1?1:-1):0}};
  const areas=roomAreas(room);
  const [view,setView]=useState<"2d"|"3d">("2d");
  const [dims,setDims]=useState(true);
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
  // сантехніка в 3D: коробки заданої висоти (вентилятор/світильник — під стелею)
  const boxes=(room.fixtures||[]).map(fx=>{const kk=WALLS.indexOf(fx.wall as any);if(kk<0)return null;const w=fx.w||24,d=fx.d||24;const h=Math.min(FIX_H[fx.type]||30,Hh);const t=Math.max(0,Math.min(1,fx.t||0));
    const p0=add(corner[kk],dir[kk],t*(len[kk]-w));const p1=add(p0,dir[kk],w);const p2=add(p1,nrm[kk],-d);const p3=add(p0,nrm[kk],-d);
    const z0=CEIL.has(fx.type)?Hh-h:0,z1=z0+h;const base=[p0,p1,p2,p3];
    const pt=(q:V,z:number)=>{const r=P(q[0],q[1],z);return `${IX(r)},${IY(r)}`};
    const col=fx.type==="tub"||fx.type==="shower"?"#dbe7ff":fx.type==="toilet"||fx.type==="sink"||fx.type==="vanity"?"#e0f2fe":"#eef2f7";
    const faces=[
      {pts:base.map(q=>pt(q,z1)).join(" "),fill:col,dep:depth((p0[0]+p2[0])/2,(p0[1]+p2[1])/2,z1)},
      ...base.map((q,i)=>{const r=base[(i+1)%4];return {pts:[pt(q,z0),pt(r,z0),pt(r,z1),pt(q,z1)].join(" "),fill:"#f8fafc",dep:depth((q[0]+r[0])/2,(q[1]+r[1])/2,(z0+z1)/2)}}),
    ].sort((a,b)=>a.dep-b.dep);
    return {faces,dep:depth((p0[0]+p2[0])/2,(p0[1]+p2[1])/2,(z0+z1)/2)};
  }).filter(Boolean).sort((a,b)=>a!.dep-b!.dep) as {faces:{pts:string;fill:string;dep:number}[];dep:number}[];
  const floorPoly=<polygon points={pts.map(q=>`${IX(P(q[0],q[1],0))},${IY(P(q[0],q[1],0))}`).join(" ")} fill="#e4e7ec" stroke="#98a2b3" strokeWidth={1}/>;
  const view3d=<svg viewBox={`0 0 ${vw} ${ivh}`} width="100%" style={{maxWidth:440,display:"block",background:"#fff",border:"1px solid #e4e7ec",borderRadius:12,touchAction:"none",cursor:"grab",userSelect:"none"}}
    onPointerDown={e=>{dragRef.current={x:e.clientX,y:e.clientY,yaw:rot.yaw,pitch:rot.pitch};(e.target as Element).setPointerCapture?.(e.pointerId)}}
    onPointerMove={e=>{const d=dragRef.current;if(!d)return;setRot({yaw:d.yaw+(e.clientX-d.x)*0.6,pitch:Math.max(5,Math.min(85,d.pitch+(e.clientY-d.y)*0.4))})}}
    onPointerUp={()=>{dragRef.current=null}} onPointerCancel={()=>{dragRef.current=null}}>
    {floorUp&&floorPoly}
    {walls3.filter(w=>!facing(w)).map((w,i)=><g key={"b"+i}>
      <polygon points={quad(w.a,w.b,0,Hh)} fill="#f2f4f7" stroke="#101828" strokeWidth={2}/>
      {segs.filter(sg=>onSeg(w.a,w.b)(sg.p)&&onSeg(w.a,w.b)(sg.q)).map((sg,j)=>{const [z0,z1]=openH(sg);return <polygon key={j} points={quad(sg.p,sg.q,z0,Math.min(z1,Hh))} fill={sg.door?"#dbe7ff":"#d1fadf"} stroke={sg.door?"#2f6df6":"#12b76a"} strokeWidth={1}/>})}
    </g>)}
    {boxes.map((bx,i)=><g key={"f"+i}>{bx.faces.map((f,j)=><polygon key={j} points={f.pts} fill={f.fill} stroke="#475467" strokeWidth={0.8}/>)}</g>)}
    {walls3.filter(w=>facing(w)).map((w,i)=>{const front=true;return <g key={i}>
      <polygon points={quad(w.a,w.b,0,Hh)} fill={front?"none":"#f2f4f7"} stroke={front?"#b2ccff":"#101828"} strokeWidth={front?1:2} strokeDasharray={front?"4 3":undefined}/>
      {segs.filter(sg=>onSeg(w.a,w.b)(sg.p)&&onSeg(w.a,w.b)(sg.q)).map((sg,j)=>{const [z0,z1]=openH(sg);return <polygon key={j} points={quad(sg.p,sg.q,z0,Math.min(z1,Hh))} fill={sg.door?"#dbe7ff":"#d1fadf"} stroke={sg.door?"#2f6df6":"#12b76a"} strokeWidth={1} opacity={front?0.6:1}/>})}
    </g>})}
    {!floorUp&&floorPoly}
    <text x={vw/2} y={16} textAnchor="middle" fontSize={12} fontWeight={700} fill="#344054">{room.name||"Кімната"} · {f(L)} × {f(W)} × {f(Hh)}</text>
    <text x={vw/2} y={ivh-8} textAnchor="middle" fontSize={11} fill="#98a2b3">тягни пальцем, щоб покрутити</text>
  </svg>;
  return <div style={{marginTop:10}}>
    <div style={{display:"flex",gap:6,marginBottom:6}}>{(["2d","3d"] as const).map(v=><button key={v} type="button" onClick={()=>{setView(v);if(v==="3d")setRot({yaw:35,pitch:30})}} style={{padding:"5px 12px",borderRadius:10,fontWeight:800,background:view===v?"#2f6df6":"#eef2f7",color:view===v?"#fff":"#344054"}}>{v==="2d"?"План":"3D"}</button>)}
      <button type="button" onClick={()=>setDims(d=>!d)} style={{padding:"5px 12px",borderRadius:10,fontWeight:800,background:dims?"#12b76a":"#eef2f7",color:dims?"#fff":"#344054",marginLeft:"auto"}}>📏 Розміри</button></div>
    {view==="3d"?<Room3D room={room} dims={dims}/>:<svg viewBox={`0 0 ${vw} ${vh}`} width="100%" style={{maxWidth:440,display:"block",background:"#fff",border:"1px solid #e4e7ec",borderRadius:12}}>
      {room.floorTile&&room.floorTile.w>0&&room.floorTile.h>0&&<defs><pattern id={"tile"+room.id} x={X(0)} y={Y(0)} width={room.floorTile.w*k} height={room.floorTile.h*k} patternUnits="userSpaceOnUse"><rect width={room.floorTile.w*k} height={room.floorTile.h*k} fill="#f8fafc" stroke="#d0d5dd" strokeWidth={0.6}/></pattern></defs>}
      <polygon points={poly} fill={room.floorTile?`url(#tile${room.id})`:"#f8fafc"} stroke="#101828" strokeWidth={3} strokeLinejoin="miter"/>
      {(room.fixtures||[]).map(fx=>{const kk=WALLS.indexOf(fx.wall as any);if(kk<0)return null;const w=fx.w||24,d=fx.d||24;const t=Math.max(0,Math.min(1,fx.t||0));const start=t*(len[kk]-w);const p0=add(corner[kk],dir[kk],start);
        // локальні координати: x — вздовж стіни, y — від стіни в кімнату; одиниці — дюйми
        const m=`matrix(${k*dir[kk][0]} ${k*dir[kk][1]} ${-k*nrm[kk][0]} ${-k*nrm[kk][1]} ${X(p0[0])} ${Y(p0[1])})`;
        const c=add(add(p0,dir[kk],w/2),nrm[kk],-d/2);const lab=fx.label||FIXTURES[fx.type]?.name||fx.type;
        return <g key={fx.id}><g transform={m}>{fixtureSymbol(fx.type,w,d)}</g>{(fx.type==="other"||fx.type==="cabinet"||fx.label)&&<text x={X(c[0])} y={Y(c[1])} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#344054">{lab.length>12?lab.slice(0,11)+"…":lab}</text>}</g>})}
      {segs.map((s,i)=><g key={i}>
        <line x1={X(s.p[0])} y1={Y(s.p[1])} x2={X(s.q[0])} y2={Y(s.q[1])} stroke="#fff" strokeWidth={5}/>
        <line x1={X(s.p[0])} y1={Y(s.p[1])} x2={X(s.q[0])} y2={Y(s.q[1])} stroke={s.door?"#2f6df6":"#12b76a"} strokeWidth={s.door?2:4} strokeDasharray={s.door?undefined:"3 3"}/>
        {s.door&&(()=>{const w=Math.hypot(s.q[0]-s.p[0],s.q[1]-s.p[1]);const inward=s.swing==="in"?-1:1;const hingeAt=s.hinge==="left"?s.p:s.q;const free=s.hinge==="left"?s.q:s.p;const e=add(hingeAt,nrm[s.k],inward*w);const sweep=(s.hinge==="left")!==(s.swing==="in")?0:1;return <g><line x1={X(hingeAt[0])} y1={Y(hingeAt[1])} x2={X(e[0])} y2={Y(e[1])} stroke="#2f6df6" strokeWidth={1.5}/><path d={`M${X(free[0])},${Y(free[1])} A${w*k},${w*k} 0 0 ${sweep} ${X(e[0])},${Y(e[1])}`} fill="none" stroke="#2f6df6" strokeWidth={1}/></g>})()}
      </g>)}
      {dims&&segs.map((sg,i)=>{const w=Math.hypot(sg.q[0]-sg.p[0],sg.q[1]-sg.p[1]);const off=Math.hypot(sg.p[0]-corner[sg.k][0],sg.p[1]-corner[sg.k][1]);const m=add(add(sg.p,dir[sg.k],w/2),nrm[sg.k],-9/k);const o=add(add(corner[sg.k],dir[sg.k],off/2),nrm[sg.k],-9/k);
        return <g key={"dm"+i} fontSize={9} fill="#1d4ed8"><text x={X(m[0])} y={Y(m[1])} textAnchor="middle" dominantBaseline="middle">{f(w)}</text>{off>6&&<text x={X(o[0])} y={Y(o[1])} textAnchor="middle" dominantBaseline="middle" fill="#98a2b3">{f(off)}</text>}</g>})}
      {dims&&(room.fixtures||[]).map(fx=>{const kk=WALLS.indexOf(fx.wall as any);if(kk<0)return null;const w=fx.w||24,d=fx.d||24;const t=Math.max(0,Math.min(1,fx.t||0));const start=t*(len[kk]-w);const p0=add(corner[kk],dir[kk],start);const c=add(add(p0,dir[kk],w/2),nrm[kk],-(d+7/k));
        return <text key={"fd"+fx.id} x={X(c[0])} y={Y(c[1])} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#475467">{f(w)} × {f(d)}</text>})}
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
      {onOpening&&ops.map(o=><span key={o.id} style={{display:"inline-flex",gap:4,alignItems:"center",fontSize:13,flexWrap:"wrap"}}>{o.name}
        <select value={o.wall} onChange={e=>onOpening(o.id,{wall:e.target.value})} style={{width:"auto",padding:"4px 6px"}}>{WALLS.map(x=><option key={x}>{x}</option>)}</select>
        <input type="range" min={0} max={1} step={0.05} value={typeof o.t==="number"?o.t:0.5} onChange={e=>onOpening(o.id,{t:Number(e.target.value)})} style={{width:100,padding:0}} title="де на стіні"/>
        {/двер|door/i.test(o.name)&&<><select value={o.swing||"in"} onChange={e=>onOpening(o.id,{swing:e.target.value as "in"|"out"})} style={{width:"auto",padding:"4px 6px"}}><option value="in">всередину</option><option value="out">назовні</option></select>
        <select value={o.hinge||"left"} onChange={e=>onOpening(o.id,{hinge:e.target.value as "left"|"right"})} style={{width:"auto",padding:"4px 6px"}}><option value="left">петлі зліва</option><option value="right">петлі справа</option></select></>}
      </span>)}
    </div>}
    {onFixture&&<div style={{marginTop:8}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}><small className="muted">Що в кімнаті:</small>
        <select value="" onChange={e=>{const t=e.target.value;if(!t)return;const f=FIXTURES[t];const id=crypto.randomUUID();onFixture(id,{id,type:t,wall:"A",t:0.5,w:f.w,d:f.d})}} style={{width:"auto",padding:"4px 6px",fontSize:13}}><option value="">＋ додати…</option>{Object.entries(FIXTURES).map(([kk,v])=><option key={kk} value={kk}>{v.name}</option>)}</select>
      </div>
      {(room.fixtures||[]).map(fx=><div key={fx.id} style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginTop:6,fontSize:13}}>
        <b style={{minWidth:90}}>{fx.label||FIXTURES[fx.type]?.name||fx.type}{fx.fromPhoto?" 📷":""}</b>
        <select value={fx.wall} onChange={e=>onFixture(fx.id,{wall:e.target.value})} style={{width:"auto",padding:"4px 6px"}}>{WALLS.map(x=><option key={x}>{x}</option>)}</select>
        <input type="range" min={0} max={1} step={0.05} value={fx.t} onChange={e=>onFixture(fx.id,{t:Number(e.target.value)})} style={{width:110,padding:0}}/>
        <input inputMode="decimal" defaultValue={fx.w} onBlur={e=>onFixture(fx.id,{w:Number(e.target.value)||fx.w})} style={{width:52,padding:"4px 6px"}} title="ширина, дюйми"/>×<input inputMode="decimal" defaultValue={fx.d} onBlur={e=>onFixture(fx.id,{d:Number(e.target.value)||fx.d})} style={{width:52,padding:"4px 6px"}} title="глибина, дюйми"/>
        <button onClick={()=>onFixture(fx.id,null)} style={{background:"#fff0ee",color:"#b42318",borderRadius:8,padding:"2px 8px"}}>×</button>
      </div>)}
    </div>}
    <small className="muted">Схема за твоїми розмірами, не креслення. Розміри стін A–D — головного прямокутника.</small>
  </div>;
}
