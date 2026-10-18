// Хмара точок LiDAR-скану (.qcpc) у координатах кімнати (дюйми): x уздовж A, y — висота, z уздовж B. Кеш на сесію.
import {supabase} from "@/lib/supabase";
import {parseInches,type Room} from "@/lib/survey";
export type RoomCloud={pos:Float32Array;col:Uint8Array;n:number};
const cache=new Map<string,Promise<RoomCloud|null>>();
export function loadRoomCloud(room:Room):Promise<RoomCloud|null>{
  const sc=room.scanCloud;if(!sc)return Promise.resolve(null);
  const L=parseInches(room.length)||0,W=parseInches(room.width)||0,H=parseInches(room.height)||96;
  const id=`${sc.path}|${L}|${W}|${H}`;
  if(!cache.has(id))cache.set(id,supabase.storage.from("receipts").download(sc.path).then(async r=>{
    if(!r.data)return null;const buf=await r.data.arrayBuffer();if(buf.byteLength<8)return null;
    const dv=new DataView(buf);const n=Math.min(dv.getUint32(4,true),Math.floor((buf.byteLength-8)/9));
    const c=Math.cos(sc.th),s=Math.sin(sc.th),M=39.3701,m=1.5;
    const pos=new Float32Array(n*3),col=new Uint8Array(n*3);let k=0;
    for(let i=0;i<n;i++){const o=8+i*9;const x=dv.getInt16(o,true)/1000,y=dv.getInt16(o+2,true)/1000,z=dv.getInt16(o+4,true)/1000;
      const rx=x*c-z*s,rz=x*s+z*c;const px=(rx-sc.minX)*M,pz=(rz-sc.minZ)*M,yi=(y-sc.floorY)*M;
      if(yi<0.8||yi>H-2||px<m||pz<m||(L&&px>L-m)||(W&&pz>W-m))continue;
      pos[k*3]=px;pos[k*3+1]=yi;pos[k*3+2]=pz;col[k*3]=dv.getUint8(o+6);col[k*3+1]=dv.getUint8(o+7);col[k*3+2]=dv.getUint8(o+8);k++}
    return {pos:pos.slice(0,k*3),col:col.slice(0,k*3),n:k};
  }).catch(()=>null));
  return cache.get(id)!;
}
/** вид згори: картинка L×W (2 пікселі на дюйм), вищі точки поверх нижчих */
export async function cloudTopView(room:Room):Promise<string|null>{
  const cl=await loadRoomCloud(room);if(!cl||!cl.n)return null;
  const L=parseInches(room.length)||0,W=parseInches(room.width)||0;if(!L||!W)return null;
  const S=2,cw=Math.ceil(L*S),ch=Math.ceil(W*S);const cv=document.createElement("canvas");cv.width=cw;cv.height=ch;const ctx=cv.getContext("2d")!;
  // карта висот: для кожної клітинки — найвища точка; колір за висотою (чим вище предмет, тим темніше), щоб чітко бачити контури меблів
  const hz=new Float32Array(cw*ch).fill(-1);
  for(let i=0;i<cl.n;i++){const x=Math.floor(cl.pos[i*3]*S),y=cl.pos[i*3+1],z=Math.floor(cl.pos[i*3+2]*S);if(y<3||x<0||z<0||x>=cw||z>=ch)continue;const j=z*cw+x;if(y>hz[j])hz[j]=y}
  // заповнити дірки між точками: максимум у вікні 5×5
  const hm=new Float32Array(cw*ch).fill(-1);const R=2;
  for(let z=0;z<ch;z++)for(let x=0;x<cw;x++){let m=-1;for(let dz=-R;dz<=R;dz++){const zz=z+dz;if(zz<0||zz>=ch)continue;for(let dx=-R;dx<=R;dx++){const xx=x+dx;if(xx<0||xx>=cw)continue;const v=hz[zz*cw+xx];if(v>m)m=v}}hm[z*cw+x]=m}
  const img=ctx.createImageData(cw,ch);
  for(let j=0;j<cw*ch;j++){const h=hm[j];if(h<0)continue;const t=Math.min(1,h/60);
    // світло-бірюзовий (низько) → темно-синій (високо)
    img.data[j*4]=Math.round(150-120*t);img.data[j*4+1]=Math.round(200-150*t);img.data[j*4+2]=Math.round(220-90*t);img.data[j*4+3]=Math.round(110+120*t)}
  ctx.putImageData(img,0,0);
  const c2=cv;
  return c2.toDataURL("image/png");
}
