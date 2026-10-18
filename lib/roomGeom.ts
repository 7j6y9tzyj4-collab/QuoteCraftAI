// Геометрія кімнати для плану й 3D: контур (з нішами/вирізами), прорізи на стінах, сантехніка. Усе в дюймах.
import {parseInches,type Room} from "./survey";
export type V=[number,number];
export const WALLS=["A","B","C","D"] as const;
export const add=(a:V,b:V,k=1):V=>[a[0]+b[0]*k,a[1]+b[1]*k];

export type WallSeg={p:V;q:V;k:number;door:boolean;swing:"in"|"out";hinge:"left"|"right";id:string;z0:number;z1:number};
export type FixBox={id:string;type:string;p0:V;p1:V;p2:V;p3:V;w:number;d:number;k:number;label?:string;model?:string;h?:number;y?:number};

export function roomGeom(room:Room){
  const L=parseInches(room.length)||0,W=parseInches(room.width)||0,H=parseInches(room.height)||96;
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
  // прорізи
  const ops=(room.openings||[]).map((o,i)=>({...o,wall:o.wall||WALLS[i%4],ow:parseInches(o.w)||0,oh:parseInches(o.h)||0}));
  const byWall:Record<string,typeof ops>={A:[],B:[],C:[],D:[]};for(const o of ops)byWall[o.wall].push(o);
  const segs:WallSeg[]=[];
  for(let k=0;k<4;k++){const list=byWall[WALLS[k]];const total=list.reduce((a,o)=>a+o.ow*(o.count||1),0);const gap=Math.max(0,(len[k]-total)/(list.length+1));let cur=gap;
    for(const o of list)for(let c=0;c<(o.count||1);c++){const start=typeof o.t==="number"&&c===0?Math.max(0,Math.min(len[k]-o.ow,o.t*(len[k]-o.ow))):cur;const door=/двер|door/i.test(o.name);
      segs.push({p:add(corner[k],dir[k],start),q:add(corner[k],dir[k],start+o.ow),k,door,swing:o.swing||"in",hinge:o.hinge||"left",id:o.id,z0:door?0:Math.max(0,Math.min(H-o.oh,H-o.oh-12)),z1:door?Math.min(o.oh||80,H):Math.min(H,Math.max(0,Math.min(H-o.oh,H-o.oh-12))+o.oh)});cur=start+o.ow+gap}}
  const fixtures:FixBox[]=(room.fixtures||[]).flatMap(fx=>{const kk=WALLS.indexOf(fx.wall as any);if(kk<0)return [];const w=fx.w||24,d=fx.d||24;const t=Math.max(0,Math.min(1,fx.t||0));
    const p0=add(corner[kk],dir[kk],t*(len[kk]-w));const p1=add(p0,dir[kk],w);const p2=add(p1,nrm[kk],-d);const p3=add(p0,nrm[kk],-d);return [{id:fx.id,type:fx.type,p0,p1,p2,p3,w,d,k:kk,label:fx.label,model:fx.model,h:fx.h,y:fx.y}]});
  return {L,W,H,corner,dir,nrm,len,pts,segs,fixtures,parts,cut};
}
// чи лежить точка q на відрізку a–b
export const onSeg=(a:V,b:V)=>(q:V)=>Math.abs((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]))<0.01&&Math.min(a[0],b[0])-0.01<=q[0]&&q[0]<=Math.max(a[0],b[0])+0.01&&Math.min(a[1],b[1])-0.01<=q[1]&&q[1]<=Math.max(a[1],b[1])+0.01;
