// Імпорт LiDAR-скану (Apple RoomPlan через додаток QuoteCraft Scan) у кімнату огляду.
// Сирі дані в метрах, система ARKit (y вгору, план — площина x/z). Ми: дюйми, стіни A(верх) B(право) C(низ) D(ліво), обхід за годинниковою.
import {DOOR,WINDOW,FIXTURES,type Room,type Opening,type Fixture,type SurveyPhoto} from "./survey";

export type ScanItem={id?:string;cx:number;cy:number;cz:number;yaw:number;w:number;h:number;d?:number;parent?:string;category?:string;confidence?:string};
export type ScanPhoto={path:string;cx:number;cz:number;yaw:number;pitch?:number};
export type ScanPayload={photos?:ScanPhoto[];walls:ScanItem[];doors?:ScanItem[];windows?:ScanItem[];openings?:ScanItem[];objects?:ScanItem[];app?:string;at?:string};

const M2IN=39.3701;
const CAT:Record<string,{type:string;label?:string}>={
  toilet:{type:"toilet"},bathtub:{type:"tub"},sink:{type:"vanity"},washerDryer:{type:"washer"},storage:{type:"cabinet"},  refrigerator:{type:"other",label:"Холодильник"},stove:{type:"other",label:"Плита"},oven:{type:"other",label:"Духовка"},dishwasher:{type:"other",label:"Посудомийка"},
  fireplace:{type:"other",label:"Камін"},bed:{type:"other",label:"Ліжко"},sofa:{type:"other",label:"Диван"},table:{type:"other",label:"Стіл"},chair:{type:"other",label:"Стілець"},television:{type:"other",label:"ТВ"},stairs:{type:"other",label:"Сходи"},
};
const r1=(n:number)=>Math.round(n*2)/2; // до пів дюйма

/** Повертає поля кімнати з скану (розміри, прорізи, сантехніка). Існуючі фото/нотатки не чіпає. */
export function importScan(p:ScanPayload,prev:Room):Partial<Room>&{note:string}{
  const walls=(p.walls||[]).filter(w=>w.w>0.2);
  if(!walls.length)throw new Error("У скані нема стін.");
  // головний напрямок — найдовша стіна; повертаємо все так, щоб вона лягла горизонтально
  const main=walls.reduce((a,b)=>b.w>a.w?b:a);
  const th=-main.yaw;const c=Math.cos(th),s=Math.sin(th);
  const rot=(x:number,z:number):[number,number]=>[x*c-z*s,x*s+z*c];
  // кінці стін → межі кімнати
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,H=0;
  const ends:[number,number][]=[];
  for(const w of walls){const [cx,cz]=rot(w.cx,w.cz);const a=w.yaw+th;const dx=Math.cos(a)*w.w/2,dz=Math.sin(a)*w.w/2;ends.push([cx-dx,cz-dz],[cx+dx,cz+dz]);H=Math.max(H,w.h)}
  for(const [x,z] of ends){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z)}
  const L=(maxX-minX)*M2IN,W=(maxZ-minZ)*M2IN;const Hin=H*M2IN;
  if(L<24||W<24)throw new Error("Скан занадто малий — пройди кімнату ще раз.");
  const toRoom=(x:number,z:number):[number,number]=>[(x-minX)*M2IN,(z-minZ)*M2IN];
  const len=[L,W,L,W];
  // яка стіна найближча до точки (px,py) у наших координатах
  const nearest=(px:number,py:number)=>{const d=[py,L-px,W-py,px];let k=0;for(let i=1;i<4;i++)if(d[i]<d[k])k=i;return k};
  // позиція вздовж стіни k від її початку (A: зліва направо, B: зверху вниз, C: справа наліво, D: знизу вгору)
  const along=(k:number,px:number,py:number)=>k===0?px:k===1?py:k===2?L-px:W-py;
  const extents=(it:ScanItem)=>{const a=it.yaw+th;const w=it.w*M2IN,d=(it.d||0.02)*M2IN;return {ex:Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*d,ez:Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*d}};

  const openings:Opening[]=[];
  const mkOpening=(it:ScanItem,kind:"door"|"window"|"opening")=>{
    const [rx,rz]=rot(it.cx,it.cz);const [px,py]=toRoom(rx,rz);const k=nearest(px,py);
    const ow=r1(it.w*M2IN),oh=r1(it.h*M2IN);if(ow<8||oh<8)return;
    const start=along(k,px,py)-ow/2;const t=Math.max(0,Math.min(1,start/Math.max(1,len[k]-ow)));
    const base=kind==="door"?DOOR:WINDOW;
    openings.push({id:crypto.randomUUID(),name:kind==="opening"?"Проріз":base.name,w:String(ow),h:String(oh),count:1,wall:"ABCD"[k],t,...(kind==="door"?{swing:"in" as const,hinge:"left" as const}:{})});
  };
  for(const d of p.doors||[])mkOpening(d,"door");
  for(const w of p.windows||[])mkOpening(w,"window");
  for(const o of p.openings||[])mkOpening(o,"opening");

  const fixtures:Fixture[]=[];
  for(const o of p.objects||[]){
    const m=CAT[o.category||""];if(!m)continue;
    const [rx,rz]=rot(o.cx,o.cz);const [px,py]=toRoom(rx,rz);const k=nearest(px,py);const {ex,ez}=extents(o);
    const w=r1(k===0||k===2?ex:ez),d=r1(k===0||k===2?ez:ex);
    const start=along(k,px,py)-w/2;const t=Math.max(0,Math.min(1,start/Math.max(1,len[k]-w)));
    // висота предмета і його низ над підлогою (cy — центр по вертикалі, підлога ≈ 0)
    const hIn=r1(o.h*M2IN);const bottom=r1((o.cy-o.h/2)*M2IN);
    fixtures.push({id:crypto.randomUUID(),type:m.type,wall:"ABCD"[k],t,w:Math.max(6,w),d:Math.max(4,d),fromScan:true,...(m.label?{label:m.label}:{}),...(hIn>2?{h:hIn}:{}),...(bottom>4?{y:bottom}:{})});
  }
  const keep=(prev.fixtures||[]).filter(f=>!f.fromPhoto&&!f.fromScan);
  // кадри зі сканера: позиція камери і напрямок погляду → на яку стіну дивиться кадр
  const photos:SurveyPhoto[]=[];
  for(const ph of p.photos||[]){
    if(!ph.path)continue;
    const [rx,rz]=rot(ph.cx,ph.cz);const [px,py]=toRoom(rx,rz);
    const a=ph.yaw+th;const dx=Math.cos(a),dy=Math.sin(a);
    // промінь з камери до межі прямокутника: яку стіну перетне першою
    const hits:[string,number][]=[];
    if(dy<-1e-6)hits.push(["A",-py/dy]);if(dx>1e-6)hits.push(["B",(L-px)/dx]);if(dy>1e-6)hits.push(["C",(W-py)/dy]);if(dx<-1e-6)hits.push(["D",-px/dx]);
    const facing=hits.filter(h=>h[1]>=0).sort((u,v)=>u[1]-v[1])[0]?.[0]||"A";
    photos.push({id:crypto.randomUUID(),path:ph.path,view:{facing,x:Math.round(px),y:Math.round(py),ang:Math.round(a*180/Math.PI)}});
  }
  const note=`Скан: ${Math.round(L)}"×${Math.round(W)}", стеля ${Math.round(Hin)}", стін ${walls.length}, прорізів ${openings.length}, об'єктів ${fixtures.length}`;
  const oldPhotos=(prev.photos||[]).filter(x=>!x.view);
  return {length:String(r1(L)),width:String(r1(W)),height:String(r1(Hin)||prev.height||"96"),openings:openings.length?openings:prev.openings,fixtures:[...keep,...fixtures],photos:[...photos,...oldPhotos],note:note+(photos.length?`, кадрів ${photos.length}`:"")};
}
// FIXTURES використовується для перевірки типів у майбутньому
void FIXTURES;
