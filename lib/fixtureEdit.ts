// Переміщення/поворот предмета на плані: центр предмета (дюйми, план) ↔ стіна + t + відступ.
import {parseInches,type Room,type Fixture} from "./survey";
const WALLS=["A","B","C","D"];
function frame(room:Room){
  const L=parseInches(room.length)||0,W=parseInches(room.width)||0;
  const corner=[[0,0],[L,0],[L,W],[0,W]],dir=[[1,0],[0,1],[-1,0],[0,-1]],nrm=[[0,-1],[1,0],[0,1],[-1,0]],len=[L,W,L,W];
  return {L,W,corner,dir,nrm,len};
}
/** центр предмета на плані */
export function fixtureCenter(room:Room,f:Fixture):[number,number]{
  const {corner,dir,nrm,len}=frame(room);const k=Math.max(0,WALLS.indexOf(f.wall));const w=f.w||24,d=f.d||24;
  const start=Math.max(0,Math.min(1,f.t||0))*Math.max(0,len[k]-w);const into=(f.off||0)+d/2;
  return [corner[k][0]+dir[k][0]*(start+w/2)-nrm[k][0]*into,corner[k][1]+dir[k][1]*(start+w/2)-nrm[k][1]*into];
}
/** поставити центр предмета в точку (px,py) — на тій самій або вказаній стіні */
export function placeFixture(room:Room,f:Fixture,px:number,py:number,wall=f.wall):Partial<Fixture>{
  const {L,W,corner,dir,nrm,len}=frame(room);const k=Math.max(0,WALLS.indexOf(wall));const w=f.w||24,d=f.d||24;
  const cx=Math.max(0,Math.min(L,px)),cy=Math.max(0,Math.min(W,py));
  const along=(cx-corner[k][0])*dir[k][0]+(cy-corner[k][1])*dir[k][1];
  const into=-((cx-corner[k][0])*nrm[k][0]+(cy-corner[k][1])*nrm[k][1]);
  const room_=len[k]-w;const start=Math.max(0,Math.min(Math.max(0,room_),along-w/2));
  const t=room_>0?start/room_:0;const off=Math.max(0,Math.round((into-d/2)*2)/2);
  const maxOff=Math.max(0,len[(k+1)%4]-d);
  return {wall,t:Math.round(t*1000)/1000,off:off>1?Math.min(off,maxOff):undefined};
}
/** повернути на 90° (за годинниковою): предмет «спиною» до наступної стіни, центр лишається на місці */
export function rotateFixture(room:Room,f:Fixture,dirSign=1):Partial<Fixture>{
  const [cx,cy]=fixtureCenter(room,f);const k=Math.max(0,WALLS.indexOf(f.wall));const nk=WALLS[(k+(dirSign>0?1:3))%4];
  return placeFixture(room,f,cx,cy,nk);
}
/** зсунути центр на dx,dy дюймів (у координатах плану) */
export function nudgeFixture(room:Room,f:Fixture,dx:number,dy:number):Partial<Fixture>{
  const [cx,cy]=fixtureCenter(room,f);return placeFixture(room,f,cx+dx,cy+dy);
}
/** до якої стіни ближче точка (для перетягування через усю кімнату — предмет «прилипає» спиною до найближчої стіни) */
export function nearestWall(room:Room,px:number,py:number){const {L,W}=frame(room);const d=[py,L-px,W-py,px];let k=0;for(let i=1;i<4;i++)if(d[i]<d[k])k=i;return WALLS[k]}
