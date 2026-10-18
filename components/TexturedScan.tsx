"use client";
// 3D-фото кімнати: сітка з LiDAR (.qcms) + ключові кадри камери. Кожен трикутник бере текстуру з кадру, де він видно найкраще
// (найближче й найбільш «в лоб», не закритий іншими предметами). Результат — по одному мешу на кадр з UV-проєкцією фото.
import * as THREE from "three";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import type {Room,ScanFrame} from "@/lib/survey";

const IN=1/12,M=39.3701;
type Built={groups:{frame:number;geo:THREE.BufferGeometry}[];gray:THREE.BufferGeometry|null;tex:Map<number,THREE.Texture>};
const cache=new Map<string,Promise<Built|null>>();

async function dl(path:string){const {data}=await supabase.storage.from("receipts").download(path);return data||null}
async function loadTex(path:string){
  const blob=await dl(path);if(!blob)return null;
  const bmp=await createImageBitmap(blob);
  const c=document.createElement("canvas");const s=Math.min(1,1280/Math.max(bmp.width,bmp.height));c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);
  c.getContext("2d")!.drawImage(bmp,0,0,c.width,c.height);bmp.close?.();
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.generateMipmaps=true;return t;
}
const tick=()=>new Promise(r=>setTimeout(r,0));

/** buf — .qcms; frames — кадри; tr — перетворення ARKit → кімната */
export async function buildTextured(buf:ArrayBuffer,frames:ScanFrame[],tr:{th:number;minX:number;minZ:number;floorY:number},onProgress?:(p:number)=>void,load=loadTex):Promise<Built|null>{
  const dv=new DataView(buf);if(buf.byteLength<12||String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3))!=="QCMS")return null;
  const nv=dv.getUint32(4,true),nf=dv.getUint32(8,true);
  if(12+nv*12+nf*13>buf.byteLength)return null;
  const P=new Float32Array(buf,12,nv*3),I=new Uint32Array(buf,12+nv*12,nf*3),C=new Uint8Array(buf,12+nv*12+nf*12,nf);
  const F=frames.map(f=>{const T=new THREE.Matrix4().fromArray(f.T);const inv=T.clone().invert();return {f,inv:inv.elements,pos:[f.T[12],f.T[13],f.T[14]]}});
  // 1) карта глибини кожного кадру (низька роздільність) — щоб знати, що чимось закрите
  const DW=240,DH=180;
  const depth=F.map(()=>new Float32Array(DW*DH).fill(Infinity));
  const proj=(k:number,x:number,y:number,z:number,out:number[])=>{const e=F[k].inv;const cx=e[0]*x+e[4]*y+e[8]*z+e[12],cy=e[1]*x+e[5]*y+e[9]*z+e[13],cz=e[2]*x+e[6]*y+e[10]*z+e[14];
    if(cz>-0.05){out[2]=-1;return}const d=-cz,f=F[k].f;out[0]=f.fx*(cx/d)+f.cx;out[1]=f.fy*(-cy/d)+f.cy;out[2]=d};
  const o=[0,0,0];
  for(let k=0;k<F.length;k++){const f=F[k].f,db=depth[k];
    const splat=(x:number,y:number,z:number)=>{proj(k,x,y,z,o);if(o[2]<0)return;const px=Math.floor(o[0]/f.w*DW),py=Math.floor(o[1]/f.h*DH);if(px<0||py<0||px>=DW||py>=DH)return;const i=py*DW+px;if(o[2]<db[i])db[i]=o[2]};
    for(let v=0;v<nv;v++)splat(P[v*3],P[v*3+1],P[v*3+2]);
    for(let t=0;t<nf;t++){const a=I[t*3]*3,b=I[t*3+1]*3,c=I[t*3+2]*3;splat((P[a]+P[b]+P[c])/3,(P[a+1]+P[b+1]+P[c+1])/3,(P[a+2]+P[b+2]+P[c+2])/3)}
    if(k%4===3){onProgress?.(0.25*(k+1)/F.length);await tick()}
  }
  // 2) найкращий кадр для кожного трикутника
  const best=new Int16Array(nf).fill(-1);let pos=0,neg=0;
  const pa=[0,0,0],pb=[0,0,0],pc=[0,0,0];
  for(let t=0;t<nf;t++){
    if(C[t]===3){best[t]=-2;continue} // стеля — не показуємо
    const a=I[t*3]*3,b=I[t*3+1]*3,c=I[t*3+2]*3;
    const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
    const gx=(P[a]+P[b]+P[c])/3,gy=(P[a+1]+P[b+1]+P[c+1])/3,gz=(P[a+2]+P[b+2]+P[c+2])/3;
    let bs=0,bk=-1,bsign=0;
    for(let k=0;k<F.length;k++){const f=F[k].f,cp=F[k].pos;
      const dx=cp[0]-gx,dy=cp[1]-gy,dz=cp[2]-gz;const dist=Math.hypot(dx,dy,dz);if(dist>5||dist<0.1)continue;
      const cos=(nx*dx+ny*dy+nz*dz)/dist;const ac=Math.abs(cos);if(ac<0.2)continue;
      proj(k,gx,gy,gz,o);if(o[2]<0)continue;const m=8;if(o[0]<m||o[1]<m||o[0]>f.w-m||o[1]>f.h-m)continue;
      proj(k,P[a],P[a+1],P[a+2],pa);proj(k,P[b],P[b+1],P[b+2],pb);proj(k,P[c],P[c+1],P[c+2],pc);
      if(pa[2]<0||pb[2]<0||pc[2]<0)continue;
      // закрито іншим предметом? перевіряємо центр і всі три вершини
      const hid=(q:number[])=>{const px=Math.floor(q[0]/f.w*DW),py=Math.floor(q[1]/f.h*DH);let zb=Infinity;
        for(let yy=Math.max(0,py-1);yy<=Math.min(DH-1,py+1);yy++)for(let xx=Math.max(0,px-1);xx<=Math.min(DW-1,px+1);xx++)zb=Math.min(zb,depth[k][yy*DW+xx]);
        return q[2]>zb+0.05};
      if(hid(o)||hid(pa)||hid(pb)||hid(pc))continue;
      if(Math.min(pa[0],pb[0],pc[0])<1||Math.min(pa[1],pb[1],pc[1])<1||Math.max(pa[0],pb[0],pc[0])>f.w-1||Math.max(pa[1],pb[1],pc[1])>f.h-1)continue;
      // ближче до центру кадру — менше спотворень
      const ex=Math.abs(o[0]/f.w-0.5)*2,ey=Math.abs(o[1]/f.h-0.5)*2;
      const sc=ac*ac/Math.max(0.5,dist)*(1-0.3*Math.max(ex,ey));
      if(sc>bs){bs=sc;bk=k;bsign=cos>0?1:-1}
    }
    best[t]=bk;if(bk>=0){if(bsign>0)pos++;else neg++}
    if(t%30000===29999){onProgress?.(0.25+0.6*t/nf);await tick()}
  }
  const flip=neg>pos; // орієнтація трикутників: «лицем» до камер (тоді стіни, що дивляться на нас ззовні, ховаються самі)
  // 3) перетворення в координати кімнати + UV
  const c0=Math.cos(tr.th),s0=Math.sin(tr.th);
  const toRoom=(x:number,y:number,z:number,out:Float32Array,i:number)=>{const rx=x*c0-z*s0,rz=x*s0+z*c0;out[i]=(rx-tr.minX)*M*IN;out[i+1]=(y-tr.floorY)*M*IN;out[i+2]=(rz-tr.minZ)*M*IN};
  const counts=new Int32Array(F.length+1);for(let t=0;t<nf;t++){const k=best[t];if(k>=0)counts[k]++;else if(k===-1)counts[F.length]++}
  const posArr=Array.from(counts,n=>new Float32Array(n*9)),uvArr=Array.from(counts,(n,i)=>i<F.length?new Float32Array(n*6):new Float32Array(0)),fill=new Int32Array(F.length+1);
  for(let t=0;t<nf;t++){const k=best[t];if(k===-2)continue;const g=k>=0?k:F.length;const j=fill[g]++;
    const vs=flip?[I[t*3],I[t*3+2],I[t*3+1]]:[I[t*3],I[t*3+1],I[t*3+2]];
    for(let q=0;q<3;q++){const v=vs[q]*3;toRoom(P[v],P[v+1],P[v+2],posArr[g],j*9+q*3);
      if(k>=0){const f=F[k].f;proj(k,P[v],P[v+1],P[v+2],o);uvArr[g][j*6+q*2]=o[0]/f.w;uvArr[g][j*6+q*2+1]=1-o[1]/f.h}}
  }
  onProgress?.(0.9);
  const tex=new Map<number,THREE.Texture>();
  const used=[...counts.keys()].filter(k=>k<F.length&&counts[k]>0);
  await Promise.all(used.map(async k=>{const t=await load(F[k].f.path).catch(()=>null);if(t)tex.set(k,t)}));
  const groups:{frame:number;geo:THREE.BufferGeometry}[]=[];let grayN=0;const grayParts:Float32Array[]=[];
  for(const k of used){if(!tex.has(k)){grayParts.push(posArr[k]);grayN+=posArr[k].length;continue}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(posArr[k],3));g.setAttribute("uv",new THREE.BufferAttribute(uvArr[k],2));groups.push({frame:k,geo:g})}
  grayParts.push(posArr[F.length]);grayN+=posArr[F.length].length;
  let gray:THREE.BufferGeometry|null=null;
  if(grayN){const all=new Float32Array(grayN);let off=0;for(const p of grayParts){all.set(p,off);off+=p.length}gray=new THREE.BufferGeometry();gray.setAttribute("position",new THREE.BufferAttribute(all,3));gray.computeVertexNormals()}
  onProgress?.(1);
  return {groups,gray,tex};
}

export default function TexturedScan({room}:{room:Room}){
  const sm=room.scanMesh!;
  const [b,setB]=useState<Built|null>(null);const [p,setP]=useState(0);const [err,setErr]=useState("");
  useEffect(()=>{let dead=false;
    if(!cache.has(sm.path))cache.set(sm.path,(async()=>{const blob=await dl(sm.path);if(!blob)return null;return buildTextured(await blob.arrayBuffer(),sm.frames,sm,x=>{if(!dead)setP(x)})})());
    cache.get(sm.path)!.then(r=>{if(dead)return;if(r)setB(r);else setErr("3D-фото не завантажилось")}).catch(e=>{cache.delete(sm.path);if(!dead)setErr(String(e?.message||e))});
    return()=>{dead=true}},[sm.path,sm]);
  if(!b)return <ProgressNote p={p} err={err}/>;
  return <group>
    {b.groups.map(g=><mesh key={g.frame} geometry={g.geo}><meshBasicMaterial map={b.tex.get(g.frame)} side={THREE.FrontSide} toneMapped={false}/></mesh>)}
    {b.gray&&<mesh geometry={b.gray}><meshLambertMaterial color="#c9c4bb" side={THREE.FrontSide}/></mesh>}
  </group>;
}
import {Html} from "@react-three/drei";
function ProgressNote({p,err}:{p:number;err:string}){
  return <Html center><div style={{background:"rgba(255,255,255,.95)",border:"1px solid #d0d5dd",borderRadius:10,padding:"6px 10px",fontSize:13,fontWeight:700,color:err?"#b42318":"#344054",whiteSpace:"nowrap"}}>{err||`⏳ Будую 3D-фото… ${Math.round(p*100)}%`}</div></Html>;
}
