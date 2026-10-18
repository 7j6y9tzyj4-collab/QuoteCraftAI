"use client";
// 3D-фото кімнати: сітка з LiDAR (.qcms) + ключові кадри камери. Кожен трикутник бере текстуру з кадру, де він видно найкраще
// (найближче й найбільш «в лоб», не закритий іншими предметами). Результат — по одному мешу на кадр з UV-проєкцією фото.
import * as THREE from "three";
import {useEffect,useState,useRef} from "react";
import {useFrame} from "@react-three/fiber";
import {supabase} from "@/lib/supabase";
import {parseInches,type Room,type ScanFrame} from "@/lib/survey";

const IN=1/12,M=39.3701;
type Grp={frame:number;side:number;geo:THREE.BufferGeometry};
type Built={groups:Grp[];tex:Map<number,THREE.Texture>;L:number;W:number;aligned:boolean};
type Tr={th:number;minX:number;minZ:number;floorY:number};
type Ctx={L:number;W:number;H:number;doors:[number,number][]};
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
export async function buildTextured(buf:ArrayBuffer,frames:ScanFrame[],tr0:Tr,ctx:Ctx,onProgress?:(p:number)=>void,load=loadTex):Promise<Built|null>{
  const dv=new DataView(buf);if(buf.byteLength<12||String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3))!=="QCMS")return null;
  const nv=dv.getUint32(4,true),nf=dv.getUint32(8,true);
  if(12+nv*12+nf*13>buf.byteLength)return null;
  const P=new Float32Array(buf,12,nv*3),I=new Uint32Array(buf,12+nv*12,nf*3),C=new Uint8Array(buf,12+nv*12+nf*12,nf);
  // сітка могла записатись в інших координатах, ніж план (AR-сесія перезапустилась) → підганяємо стіни сітки під прямокутник кімнати
  const al=alignToRoom(P,I,C,nf,tr0,ctx);const tr=al.tr;
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
      const cos=(nx*dx+ny*dy+nz*dz)/dist;const ac=Math.abs(cos);if(ac<0.35)continue;
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
      const sc=ac*ac*ac/Math.max(0.5,dist)*(1-0.4*Math.max(ex,ey));
      if(sc>bs){bs=sc;bk=k;bsign=cos>0?1:-1}
    }
    best[t]=bk;if(bk>=0){if(bsign>0)pos++;else neg++}
    if(t%30000===29999){onProgress?.(0.25+0.6*t/nf);await tick()}
  }
  void pos;void neg;
  // 3) координати кімнати + UV; трикутники стін — окремими групами (A/B/C/D), щоб ховати стіну, що між нами й кімнатою
  const c0=Math.cos(tr.th),s0=Math.sin(tr.th);const Li=ctx.L,Wi=ctx.W,Hi=ctx.H;
  const rx=(x:number,z:number)=>((x*c0-z*s0)-tr.minX)*M,rz=(x:number,z:number)=>((x*s0+z*c0)-tr.minZ)*M,ry=(y:number)=>(y-tr.floorY)*M;
  const side=new Int8Array(nf);
  for(let t=0;t<nf;t++){if(best[t]===-2)continue;const a=I[t*3]*3,b=I[t*3+1]*3,c=I[t*3+2]*3;
    const X=(rx(P[a],P[a+2])+rx(P[b],P[b+2])+rx(P[c],P[c+2]))/3,Z=(rz(P[a],P[a+2])+rz(P[b],P[b+2])+rz(P[c],P[c+2]))/3,Y=(ry(P[a+1])+ry(P[b+1])+ry(P[c+1]))/3;
    const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
    const nX=Math.abs(nx*c0-nz*s0),nZ=Math.abs(nx*s0+nz*c0);
    const m=8;
    if(Li&&Wi&&(X<-m||Z<-m||X>Li+m||Z>Wi+m)){best[t]=-2;continue} // за стінами — шум
    if(Hi&&Math.abs(ny)>0.8&&Y>Hi-6){best[t]=-2;continue}         // стеля
    if(Math.max(Math.hypot(ux,uy,uz),Math.hypot(vx,vy,vz),Math.hypot(P[c]-P[b],P[c+1]-P[b+1],P[c+2]-P[b+2]))>0.3){best[t]=-2;continue} // «розтягнуті» шматки сітки
    side[t]=4;
    if(Li&&Wi){if(nZ>0.75&&Z<6)side[t]=0;else if(nX>0.75&&X>Li-6)side[t]=1;else if(nZ>0.75&&Z>Wi-6)side[t]=2;else if(nX>0.75&&X<6)side[t]=3}
  }
  const key=(t:number)=>{const k=best[t];return (k>=0?k:F.length)*5+side[t]};
  const counts=new Map<number,number>();for(let t=0;t<nf;t++){if(best[t]===-2)continue;const g=key(t);counts.set(g,(counts.get(g)||0)+1)}
  const posArr=new Map<number,Float32Array>(),uvArr=new Map<number,Float32Array>(),fill=new Map<number,number>();
  for(const [g,n] of counts){posArr.set(g,new Float32Array(n*9));uvArr.set(g,new Float32Array(n*6));fill.set(g,0)}
  for(let t=0;t<nf;t++){const k=best[t];if(k===-2)continue;const g=key(t);const j=fill.get(g)!;fill.set(g,j+1);const pa2=posArr.get(g)!,ua=uvArr.get(g)!;
    for(let q=0;q<3;q++){const v=I[t*3+q]*3;pa2[j*9+q*3]=rx(P[v],P[v+2])*IN;pa2[j*9+q*3+1]=ry(P[v+1])*IN;pa2[j*9+q*3+2]=rz(P[v],P[v+2])*IN;
      if(k>=0){const f=F[k].f;proj(k,P[v],P[v+1],P[v+2],o);ua[j*6+q*2]=o[0]/f.w;ua[j*6+q*2+1]=1-o[1]/f.h}}
  }
  onProgress?.(0.9);
  const tex=new Map<number,THREE.Texture>();
  const usedFrames=[...new Set([...counts.keys()].map(g=>Math.floor(g/5)).filter(k=>k<F.length))];
  await Promise.all(usedFrames.map(async k=>{const t=await load(F[k].f.path).catch(()=>null);if(t)tex.set(k,t)}));
  const groups:Grp[]=[];
  for(const [g] of counts){const fr=Math.floor(g/5),sd=g%5;const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.BufferAttribute(posArr.get(g)!,3));
    if(fr<F.length&&tex.has(fr))geo.setAttribute("uv",new THREE.BufferAttribute(uvArr.get(g)!,2));else geo.computeVertexNormals();
    groups.push({frame:fr<F.length&&tex.has(fr)?fr:-1,side:sd,geo})}
  onProgress?.(1);
  return {groups,tex,L:Li,W:Wi,aligned:al.moved};
}

/** Підгонка сітки під кімнату: напрямок стін (гістограма нормалей), протилежні стіни (піки), підлога; 180° — по дверях */
function alignToRoom(P:Float32Array,I:Uint32Array,C:Uint8Array,nf:number,tr0:Tr,ctx:Ctx):{tr:Tr;moved:boolean}{
  const Lm=ctx.L/M,Wm=ctx.W/M;if(!Lm||!Wm)return {tr:tr0,moved:false};
  // вертикальні трикутники: центр, нормаль, площа
  const vx:number[]=[],vz:number[]=[],vnx:number[]=[],vnz:number[]=[],vw:number[]=[];const hy:number[]=[],hw:number[]=[];const dx:number[]=[],dz:number[]=[];
  for(let t=0;t<nf;t++){const a=I[t*3]*3,b=I[t*3+1]*3,c=I[t*3+2]*3;
    const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],wx=P[c]-P[a],wy=P[c+1]-P[a+1],wz=P[c+2]-P[a+2];
    let nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;const ar=Math.hypot(nx,ny,nz);if(ar<1e-6)continue;nx/=ar;ny/=ar;nz/=ar;
    const gx=(P[a]+P[b]+P[c])/3,gy=(P[a+1]+P[b+1]+P[c+1])/3,gz=(P[a+2]+P[b+2]+P[c+2])/3;
    if(Math.abs(ny)<0.25){vx.push(gx);vz.push(gz);vnx.push(nx);vnz.push(nz);vw.push(ar)}
    else if(Math.abs(ny)>0.9){hy.push(gy);hw.push(ar)}
    if(C[t]===7){dx.push(gx);dz.push(gz)}
  }
  if(vx.length<50)return {tr:tr0,moved:false};
  const fit=(tr:Tr)=>{const c=Math.cos(tr.th),s=Math.sin(tr.th);let ok=0,all=0;for(let i=0;i<vx.length;i++){const X=vx[i]*c-vz[i]*s-tr.minX,Z=vx[i]*s+vz[i]*c-tr.minZ;const d=Math.min(Math.abs(X),Math.abs(Z),Math.abs(X-Lm),Math.abs(Z-Wm));all+=vw[i];if(d<0.12&&X>-0.2&&Z>-0.2&&X<Lm+0.2&&Z<Wm+0.2)ok+=vw[i]}return ok/(all||1)};
  const f0=fit(tr0);
  // напрямок стін
  const NB=90,hist=new Float64Array(NB);for(let i=0;i<vx.length;i++){let a=Math.atan2(vnz[i],vnx[i]);a=((a%(Math.PI/2))+Math.PI/2)%(Math.PI/2);hist[Math.floor(a/(Math.PI/2)*NB)%NB]+=vw[i]}
  let pk=0,pv=-1;for(let i=0;i<NB;i++){const v=hist[(i+NB-1)%NB]+hist[i]*2+hist[(i+1)%NB];if(v>pv){pv=v;pk=i}}
  const th0=(pk+0.5)/NB*(Math.PI/2);
  // підлога: найнижчий сильний рівень горизонтальних трикутників
  const ys=hy.map((y,i)=>[y,hw[i]]).sort((p,q)=>p[0]-q[0]);let floorY=tr0.floorY;
  if(ys.length){const tot=ys.reduce((a,p)=>a+p[1],0);let acc=0;for(const [y,w] of ys){acc+=w;if(acc>tot*0.08){floorY=y;break}}}
  const peaks=(vals:number[],ws:number[])=>{if(!vals.length)return null;const mn=Math.min(...vals),mx=Math.max(...vals);const B=Math.max(1,Math.ceil((mx-mn)/0.03));const h=new Float64Array(B+1);vals.forEach((v,i)=>{h[Math.floor((v-mn)/0.03)]+=ws[i]});
    const sm=h.map((_,i)=>(h[i-1]||0)+h[i]*2+(h[i+1]||0));const top=Math.max(...sm);const idx:number[]=[];for(let i=0;i<sm.length;i++)if(sm[i]>=top*0.25&&sm[i]>=(sm[i-1]||0)&&sm[i]>=(sm[i+1]||0))idx.push(i);
    if(idx.length<2)return null;return [mn+(idx[0]+0.5)*0.03,mn+(idx[idx.length-1]+0.5)*0.03]};
  const cands:{tr:Tr;err:number;door:number}[]=[];
  for(let k=0;k<4;k++){const th=-th0+k*Math.PI/2;const c=Math.cos(th),s=Math.sin(th);
    const xs:number[]=[],xw:number[]=[],zs:number[]=[],zw:number[]=[];
    for(let i=0;i<vx.length;i++){const X=vx[i]*c-vz[i]*s,Z=vx[i]*s+vz[i]*c;const nX=Math.abs(vnx[i]*c-vnz[i]*s),nZ=Math.abs(vnx[i]*s+vnz[i]*c);if(nX>0.9){xs.push(X);xw.push(vw[i])}else if(nZ>0.9){zs.push(Z);zw.push(vw[i])}}
    const px=peaks(xs,xw),pz=peaks(zs,zw);if(!px||!pz)continue;
    const err=Math.abs((px[1]-px[0])-Lm)+Math.abs((pz[1]-pz[0])-Wm);
    const tr={th,minX:px[0],minZ:pz[0],floorY};
    // двері сітки ↔ двері плану
    let door=0;if(dx.length&&ctx.doors.length){const mx=dx.reduce((a,v,i)=>a+(dx[i]*c-dz[i]*s),0)/dx.length-px[0],mz=dx.reduce((a,v,i)=>a+(dx[i]*s+dz[i]*c),0)/dx.length-pz[0];door=Math.min(...ctx.doors.map(([X,Z])=>Math.hypot(X/M-mx,Z/M-mz)))}
    cands.push({tr,err,door});
  }
  if(!cands.length)return {tr:tr0,moved:false};
  cands.sort((a,b)=>a.err-b.err);const goodErr=cands[0].err+0.15;const ok=cands.filter(c=>c.err<=goodErr).sort((a,b)=>a.door-b.door||fit(b.tr)-fit(a.tr));
  const best=ok[0];const f1=fit(best.tr);
  return f1>f0+0.1?{tr:best.tr,moved:true}:{tr:tr0,moved:false};
}

export default function TexturedScan({room,wallColor}:{room:Room;wallColor?:string}){
  const sm=room.scanMesh!;
  const [b,setB]=useState<Built|null>(null);const [p,setP]=useState(0);const [err,setErr]=useState("");
  const ctx=():Ctx=>{const L=parseInches(room.length)||0,W=parseInches(room.width)||0,H=parseInches(room.height)||96;
    const doors=(room.openings||[]).filter(o=>!/вікно|window/i.test(o.name)).map(o=>{const w=parseInches(o.w)||30;const k="ABCD".indexOf(o.wall||"A");const len=k%2?W:L;const at=(o.t||0)*Math.max(0,len-w)+w/2;
      return (k===0?[at,0]:k===1?[L,at]:k===2?[L-at,W]:[0,W-at]) as [number,number]});return {L,W,H,doors}};
  useEffect(()=>{let dead=false;const id=sm.path+"|"+room.length+"x"+room.width;
    if(!cache.has(id))cache.set(id,(async()=>{const blob=await dl(sm.path);if(!blob)return null;return buildTextured(await blob.arrayBuffer(),sm.frames,sm,ctx(),x=>{if(!dead)setP(x)})})());
    cache.get(id)!.then(r=>{if(dead)return;if(r)setB(r);else setErr("3D-фото не завантажилось")}).catch(e=>{cache.delete(id);if(!dead)setErr(String(e?.message||e))});
    return()=>{dead=true}},[sm.path,sm,room.length,room.width]);// eslint-disable-line react-hooks/exhaustive-deps
  const refs=useRef<(THREE.Object3D|null)[]>([]);
  useFrame(({camera})=>{if(!b)return;const x=camera.position.x/IN,z=camera.position.z/IN;const hide=[z<0,x>b.L,z>b.W,x<0,false];
    b.groups.forEach((g,i)=>{const o=refs.current[i];if(o)o.visible=!hide[g.side]});for(let k=0;k<4;k++){const o=refs.current[b.groups.length+k];if(o)o.visible=!hide[k]}});
  if(!b)return <ProgressNote p={p} err={err}/>;
  // підкладка: рівні стіни й підлога трохи «за» сканом — дірки в скані виглядають як стіна/підлога, а не порожнеча
  const H=(parseInches(room.height)||96),L=b.L,W=b.W,o=1.5;
  const wall=(k:number)=>{const pos:[number,number,number]=k===0?[L/2,H/2,-o]:k===1?[L+o,H/2,W/2]:k===2?[L/2,H/2,W+o]:[-o,H/2,W/2];const len=k%2?W:L;
    return <mesh key={"bd"+k} ref={el=>{refs.current[b.groups.length+k]=el}} position={[pos[0]*IN,pos[1]*IN,pos[2]*IN]} rotation={[0,k%2?Math.PI/2:0,0]}><planeGeometry args={[(len+2*o)*IN,H*IN]}/><meshLambertMaterial color={wallColor||"#e9e4da"} side={THREE.DoubleSide}/></mesh>};
  return <group>
    <mesh position={[L/2*IN,-0.6*IN,W/2*IN]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[(L+2*o)*IN,(W+2*o)*IN]}/><meshLambertMaterial color="#d9d3c7" side={THREE.DoubleSide}/></mesh>
    {[0,1,2,3].map(wall)}
    {b.groups.map((g,i)=><mesh key={g.frame+"-"+g.side+"-"+i} ref={el=>{refs.current[i]=el}} geometry={g.geo}>{g.frame>=0?<meshBasicMaterial map={b.tex.get(g.frame)} side={THREE.DoubleSide} toneMapped={false}/>:<meshLambertMaterial color="#c9c4bb" side={THREE.DoubleSide}/>}</mesh>)}
  </group>;
}
import {Html} from "@react-three/drei";
function ProgressNote({p,err}:{p:number;err:string}){
  return <Html center><div style={{background:"rgba(255,255,255,.95)",border:"1px solid #d0d5dd",borderRadius:10,padding:"6px 10px",fontSize:13,fontWeight:700,color:err?"#b42318":"#344054",whiteSpace:"nowrap"}}>{err||`⏳ Будую 3D-фото… ${Math.round(p*100)}%`}</div></Html>;
}
