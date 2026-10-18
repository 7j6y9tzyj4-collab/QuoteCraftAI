"use client";
// Сучасні моделі (малюються кодом): підвісні тумби, моноблок/підвісний унітаз, LED-дзеркала, walk-in душ, окремостояча ванна,
// меблі в сучасному стилі. Локальні координати: x вздовж стіни 0..w, z від стіни в кімнату 0..d, y вгору. Одиниці — дюйми × IN.
import * as THREE from "three";
import {RoundedBox} from "@react-three/drei";
import {useMemo} from "react";

const IN=1/12;
export const MT={
  black:{color:"#1d1f22",metalness:0.35,roughness:0.45},
  brass:{color:"#c4a265",metalness:0.9,roughness:0.32},
  white:{color:"#fbfbfa",metalness:0,roughness:0.25},
  quartz:{color:"#f4f3f0",metalness:0,roughness:0.18},
  oak:{color:"#c39a6b",metalness:0,roughness:0.65},
  walnut:{color:"#7b5638",metalness:0,roughness:0.6},
  fabric:{color:"#e7e0d4",metalness:0,roughness:0.95},
  glass:{color:"#dcebf5",metalness:0.1,roughness:0.05},
  steel:{color:"#c8cdd3",metalness:0.75,roughness:0.3},
} as const;
type Mat={color:string;metalness?:number;roughness?:number;emissive?:string;emissiveIntensity?:number;opacity?:number};
const Std=({m}:{m:Mat})=><meshStandardMaterial color={m.color} metalness={m.metalness??0} roughness={m.roughness??0.6} emissive={m.emissive||"#000000"} emissiveIntensity={m.emissiveIntensity??0} transparent={m.opacity!==undefined} opacity={m.opacity??1} depthWrite={m.opacity===undefined}/>;
/** прямокутник: p — центр, s — розмір (дюйми); rad — заокруглення */
export function B({p,s,m,rad=0,shadow=true}:{p:[number,number,number];s:[number,number,number];m:Mat;rad?:number;shadow?:boolean}){
  const r=Math.min(rad,s[0]/2-0.01,s[1]/2-0.01,s[2]/2-0.01);
  if(r>0.05)return <RoundedBox args={[s[0]*IN,s[1]*IN,s[2]*IN]} radius={r*IN} smoothness={3} position={[p[0]*IN,p[1]*IN,p[2]*IN]} castShadow={shadow} receiveShadow><Std m={m}/></RoundedBox>;
  return <mesh position={[p[0]*IN,p[1]*IN,p[2]*IN]} castShadow={shadow} receiveShadow><boxGeometry args={[s[0]*IN,s[1]*IN,s[2]*IN]}/><Std m={m}/></mesh>;
}
/** циліндр: p — центр, r1 верх, r2 низ, h висота; rot — поворот */
function C({p,r1,r2=r1,h,m,rot,seg=32,sx=1,sz=1}:{p:[number,number,number];r1:number;r2?:number;h:number;m:Mat;rot?:[number,number,number];seg?:number;sx?:number;sz?:number}){
  return <mesh position={[p[0]*IN,p[1]*IN,p[2]*IN]} rotation={rot} scale={[sx,1,sz]} castShadow receiveShadow><cylinderGeometry args={[r1*IN,r2*IN,h*IN,seg]}/><Std m={m}/></mesh>;
}
const glow=(c="#fff3d6",k=1.4):Mat=>({color:c,emissive:c,emissiveIntensity:k,roughness:0.5});
const tintMat=(hex?:string):Mat=>hex?{color:hex,roughness:0.6}:MT.oak;

// ---------- сантехніка ----------
export function MToilet({w,d,hung}:{w:number;d:number;hung?:boolean}){
  const cx=w/2,bw=Math.min(15,w-1),bd=Math.max(20,Math.min(d-1,hung?21:28));
  if(hung)return <group>
    {/* панель змиву на стіні та підвісна чаша */}
    <B p={[cx,40,0.4]} s={[9.5,6.5,0.8]} m={MT.white} rad={0.6}/>
    <B p={[cx-2.1,40,0.9]} s={[4,5.2,0.3]} m={MT.black} rad={0.4}/><B p={[cx+2.1,40,0.9]} s={[4,5.2,0.3]} m={MT.black} rad={0.4}/>
    <B p={[cx,10.5,bd/2]} s={[bw,11,bd]} m={MT.white} rad={4.5}/>
    <B p={[cx,16.6,bd/2+0.5]} s={[bw-0.4,1.2,bd-1]} m={MT.white} rad={0.6}/>
  </group>;
  const tk=7.5;
  return <group>
    {/* моноблок зі «спідницею»: суцільна основа, низький бачок, плоска кришка */}
    <B p={[cx,8,tk+ (bd-tk)/2-0.5]} s={[bw-1,16,bd-tk-1]} m={MT.white} rad={4}/>
    <B p={[cx,7.5,tk/2+1]} s={[bw-3,15,tk+2]} m={MT.white} rad={2}/>
    <B p={[cx,21.5,tk/2]} s={[Math.min(w-1,17),13,tk]} m={MT.white} rad={2.5}/>
    <C p={[cx,28.1,tk/2]} r1={1} h={0.4} m={MT.black}/>
    <B p={[cx,16.6,tk+(bd-tk)/2-0.3]} s={[bw-1.2,1.2,bd-tk-1]} m={MT.white} rad={0.6}/>
  </group>;
}
function Faucet({x,z,top,tall,m=MT.black}:{x:number;z:number;top:number;tall?:boolean;m?:Mat}){
  const h=tall?12:8;
  return <group>
    <C p={[x,top+h/2,z]} r1={0.55} h={h} m={m} seg={16}/>
    <C p={[x,top+h-0.3,z+2.6]} r1={0.45} h={5.2} m={m} rot={[Math.PI/2,0,0]} seg={14}/>
    <B p={[x+1.6,top+h-2,z]} s={[2.4,0.5,0.5]} m={m}/>
  </group>;
}
export function MVanity({w,d,tint,variant}:{w:number;d:number;tint?:string;variant:"float"|"vessel"|"floor"}){
  const top=34,th=1.5,cab=variant==="floor"?{y0:5,y1:top-th}:{y0:13,y1:top-th};
  const body=tintMat(tint);const ch=cab.y1-cab.y0;
  const nb=w>=58?2:1;const xs=nb===2?[w*0.27,w*0.73]:[w/2];
  // шухляди: 1–2 ряди; колонки по ~30"
  const cols=Math.max(1,Math.round(w/30)),rows=ch>18?2:1;
  return <group>
    <B p={[w/2,(cab.y0+cab.y1)/2,d/2]} s={[w,ch,d-0.5]} m={body} rad={0.3}/>
    {/* шви між фасадами (без ручок, з виїмкою зверху) */}
    {Array.from({length:cols-1},(_,i)=><B key={"v"+i} p={[w/cols*(i+1),(cab.y0+cab.y1)/2,d-0.2]} s={[0.25,ch-0.6,0.15]} m={{color:"#3a2c20",roughness:0.9}} shadow={false}/>)}
    {rows>1&&<B p={[w/2,cab.y0+ch*0.55,d-0.2]} s={[w-0.6,0.25,0.15]} m={{color:"#3a2c20",roughness:0.9}} shadow={false}/>}
    <B p={[w/2,cab.y1-1.2,d-0.15]} s={[w-0.8,0.6,0.2]} m={{color:"#2a2018",roughness:0.9}} shadow={false}/>
    {variant==="floor"&&[[1.5,1.5],[w-1.5,1.5],[1.5,d-2],[w-1.5,d-2]].map(([x,z],i)=><C key={i} p={[x,cab.y0/2,z]} r1={0.45} h={cab.y0} m={MT.black} seg={10}/>)}
    {/* стільниця кварц */}
    <B p={[w/2,top-th/2,d/2+0.25]} s={[w+0.4,th,d+0.5]} m={MT.quartz} rad={0.25}/>
    {xs.map((x,i)=>variant==="vessel"
      ?<group key={i}><B p={[x,top+2.6,d/2+1]} s={[Math.min(16,w/nb-6),5.2,Math.min(13,d-5)]} m={MT.white} rad={2.3}/>
        <B p={[x,top+5.05,d/2+1]} s={[Math.min(16,w/nb-6)-1.4,0.2,Math.min(13,d-5)-1.4]} m={{color:"#e3e7ec",roughness:0.2}} rad={0.1} shadow={false}/>
        <Faucet x={x} z={2.2} top={top} tall/></group>
      :<group key={i}><B p={[x,top+0.02,d/2+1]} s={[Math.min(18,w/nb-7),0.1,Math.min(12,d-6)]} m={{color:"#dfe4ea",roughness:0.15}} rad={0.04} shadow={false}/>
        <Faucet x={x} z={2.2} top={top}/></group>)}
  </group>;
}
export function MWallSink({w,d}:{w:number;d:number}){
  const sw=Math.min(w-1,22),sd=Math.min(d-1,17),cx=w/2;
  return <group>
    <B p={[cx,31.5,sd/2]} s={[sw,5,sd]} m={MT.white} rad={1.2}/>
    <B p={[cx,34.05,sd/2+1]} s={[sw-4,0.12,sd-6]} m={{color:"#dfe4ea",roughness:0.15}} rad={0.05} shadow={false}/>
    <C p={[cx,22,3]} r1={0.7} h={14} m={MT.black} seg={14}/>
    <Faucet x={cx} z={2} top={34}/>
  </group>;
}
export function MTub({w,d,free}:{w:number;d:number;free?:boolean}){
  if(!free){const h=20,t=2.5;return <group>
    <B p={[w/2,h/2,d/2]} s={[w,h,d]} m={MT.white} rad={1}/>
    <B p={[w/2,h-3.5,d/2+0.5]} s={[w-2*t,7,d-2*t-1]} m={{color:"#e7ecf1",roughness:0.15}} rad={3}/>
    <C p={[5,h+3,2.5]} r1={0.5} h={6} m={MT.black} seg={12}/>
  </group>}
  const rx=(w-3)/2,rz=(d-2)/2,h=22;
  return <group>
    <C p={[w/2,h/2,d/2]} r1={rz} r2={rz*0.86} h={h} m={MT.white} sx={rx/rz} seg={48}/>
    <C p={[w/2,h-0.2,d/2]} r1={rz-1.3} r2={rz-1.3} h={0.6} m={{color:"#e6ebf0",roughness:0.12}} sx={(rx-1.3)/(rz-1.3)} seg={48}/>
    {/* окремостоячий змішувач з підлоги */}
    <C p={[Math.max(2,w/2-rx-1),18,d/2]} r1={0.7} h={36} m={MT.black} seg={14}/>
    <C p={[Math.max(2,w/2-rx-1)+2.4,35.4,d/2]} r1={0.5} h={5} m={MT.black} rot={[0,0,Math.PI/2]} seg={12}/>
  </group>;
}
export function MShower({w,d,door}:{w:number;d:number;door?:boolean}){
  const h=78,gl:Mat={...MT.glass,opacity:0.22};
  const pw=door?w:Math.min(w,Math.max(30,w*0.6));
  return <group>
    {/* підлога без бортика + лінійний трап */}
    <B p={[w/2,0.15,d/2]} s={[w,0.3,d]} m={{color:"#cfd2d4",roughness:0.8}} shadow={false}/>
    <B p={[w/2,0.33,2.5]} s={[w-6,0.08,1.6]} m={MT.black} shadow={false}/>
    {/* скло з тонким чорним профілем */}
    <B p={[w-pw/2,h/2,d-0.25]} s={[pw,h,0.4]} m={gl} shadow={false}/>
    <B p={[w-pw/2,h+0.3,d-0.25]} s={[pw,0.6,0.6]} m={MT.black}/>
    <B p={[w-pw+0.3,h/2,d-0.25]} s={[0.6,h,0.6]} m={MT.black}/>
    {door&&<B p={[w/2,h/2+1,d-0.1]} s={[0.6,10,1.6]} m={MT.black}/>}
    <B p={[w-0.25,h/2,d/2]} s={[0.4,h,d]} m={gl} shadow={false}/>
    <B p={[w-0.25,h+0.3,d/2]} s={[0.6,0.6,d]} m={MT.black}/>
    {/* тропічний душ + ручний + змішувач */}
    <B p={[w/2,82,0.8]} s={[1,1,1.6]} m={MT.black}/>
    <C p={[w/2,82,5]} r1={0.4} h={9} m={MT.black} rot={[Math.PI/2,0,0]} seg={10}/>
    <B p={[w/2,81.2,9.5]} s={[10,0.5,10]} m={MT.black} rad={0.2}/>
    <B p={[w/2+8,50,0.6]} s={[0.7,26,0.7]} m={MT.black}/>
    <C p={[w/2,42,0.6]} r1={1.6} h={0.8} m={MT.black} rot={[Math.PI/2,0,0]}/>
  </group>;
}
export function MWasher({w,d,dryer,stacked}:{w:number;d:number;dryer?:boolean;stacked?:boolean}){
  const one=(y0:number,isDry:boolean)=>{const h=36,r=Math.min(w,h)*0.32;return <group key={y0}>
    <B p={[w/2,y0+h/2,d/2]} s={[w,h,d]} m={MT.white} rad={1.2}/>
    <B p={[w/2,y0+h-3,d+0.02]} s={[w-2,4,0.1]} m={{color:"#e9ecef",roughness:0.3}} shadow={false}/>
    <C p={[w-5,y0+h-3,d+0.3]} r1={1.3} h={0.6} m={MT.steel} rot={[Math.PI/2,0,0]}/>
    <B p={[6,y0+h-3,d+0.08]} s={[6,1.6,0.1]} m={glow("#7fb6ff",0.6)} shadow={false}/>
    <mesh position={[w/2*IN,(y0+h*0.45)*IN,(d+0.3)*IN]}><torusGeometry args={[r*IN,1.1*IN,12,40]}/><Std m={{color:"#3b3f45",metalness:0.4,roughness:0.35}}/></mesh>
    <C p={[w/2,y0+h*0.45,d+0.2]} r1={r-0.6} h={0.3} m={{color:isDry?"#5b6168":"#24384f",metalness:0.2,roughness:0.08,opacity:0.85}} rot={[Math.PI/2,0,0]}/>
  </group>};
  return <group>{stacked?[one(0,false),one(36.5,true)]:one(0,!!dryer)}</group>;
}
export function MCabinet({w,d,kind,tint}:{w:number;d:number;kind:"base"|"upper"|"tall";tint?:string}){
  const h=kind==="upper"?30:kind==="tall"?84:34.5,y0=kind==="upper"?54:kind==="base"?4:0.5;
  const body:Mat=tint?{color:tint,roughness:0.55}:{color:"#ebe8e1",roughness:0.55};
  const n=Math.max(1,Math.round(w/20));const dw=w/n;
  return <group>
    {kind==="base"&&<B p={[w/2,2,d/2-1.5]} s={[w,4,d-3]} m={MT.black}/>}
    <B p={[w/2,y0+h/2,d/2]} s={[w,h,d]} m={body} rad={0.25}/>
    {Array.from({length:n-1},(_,i)=><B key={i} p={[dw*(i+1),y0+h/2,d+0.02]} s={[0.25,h-0.4,0.1]} m={{color:"#8a857c",roughness:0.9}} shadow={false}/>)}
    {Array.from({length:n},(_,i)=>{const px=dw*i+(i%2?1.8:dw-1.8);return <B key={"p"+i} p={[px,kind==="upper"?y0+4:kind==="tall"?y0+42:y0+h-5,d+0.5]} s={[0.5,kind==="tall"?14:7,0.6]} m={MT.black}/>})}
    {kind==="base"&&<B p={[w/2,y0+h+0.75,d/2+0.5]} s={[w+0.2,1.5,d+1]} m={MT.quartz}/>}
  </group>;
}
export function MMirror({w,h,y,kind}:{w:number;h:number;y:number;kind:"roundLed"|"rectLed"|"roundBlack"}){
  const mir:Mat={color:"#c3d3df",metalness:0.25,roughness:0.08};const cy=y+h/2;
  if(kind==="rectLed")return <group>
    <B p={[w/2,cy,0.4]} s={[w+1.2,h+1.2,0.4]} m={glow("#fff1d2",1.1)} rad={1.8} shadow={false}/>
    <B p={[w/2,cy,0.9]} s={[w,h,0.6]} m={mir} rad={1.5}/>
  </group>;
  const r=Math.min(w,h)/2;
  return <group position={[w/2*IN,cy*IN,0]}>
    {kind==="roundLed"&&<mesh position={[0,0,0.35*IN]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[(r+0.7)*IN,(r+0.7)*IN,0.3*IN,64]}/><Std m={glow("#fff1d2",1.1)}/></mesh>}
    <mesh position={[0,0,0.9*IN]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[r*IN,r*IN,0.6*IN,64]}/><Std m={mir}/></mesh>
    {kind==="roundBlack"&&<mesh position={[0,0,1.1*IN]}><torusGeometry args={[r*IN,0.55*IN,12,64]}/><Std m={MT.black}/></mesh>}
  </group>;
}
export function MVanityLight({w,y,kind}:{w:number;y:number;kind:"linear"|"globes"}){
  if(kind==="linear"){const lw=Math.max(12,w*0.8);return <group>
    <B p={[w/2,y+1.5,1.2]} s={[lw,2.4,2.4]} m={MT.black} rad={0.4}/>
    <B p={[w/2,y+0.25,1.2]} s={[lw-1,0.2,1.6]} m={glow("#fff3d6",2)} shadow={false}/>
  </group>}
  const n=w>=36?3:2;const sp=w/n;
  return <group>{Array.from({length:n},(_,i)=><group key={i}>
    <C p={[sp*(i+0.5),y+4,0.3]} r1={2} h={0.6} m={MT.brass} rot={[Math.PI/2,0,0]}/>
    <C p={[sp*(i+0.5),y+4,2]} r1={0.35} h={3.2} m={MT.brass} rot={[Math.PI/2,0,0]} seg={10}/>
    <mesh position={[sp*(i+0.5)*IN,(y+4)*IN,5.3*IN]}><sphereGeometry args={[3*IN,24,16]}/><Std m={glow("#fff6e3",1)}/></mesh>
  </group>)}</group>;
}
export function MTowelBar({w,y,ring}:{w:number;y:number;ring?:boolean}){
  if(ring)return <group><C p={[w/2,y+8,0.4]} r1={1} h={0.8} m={MT.black} rot={[Math.PI/2,0,0]}/><mesh position={[w/2*IN,(y+4)*IN,1.6*IN]}><torusGeometry args={[3.5*IN,0.3*IN,10,40]}/><Std m={MT.black}/></mesh></group>;
  return <group>
    <C p={[w/2,y+1,2.4]} r1={0.35} h={w-2} m={MT.black} rot={[0,0,Math.PI/2]} seg={12}/>
    {[1.5,w-1.5].map((x,i)=><C key={i} p={[x,y+1,1.2]} r1={0.45} h={2.4} m={MT.black} rot={[Math.PI/2,0,0]} seg={12}/>)}
  </group>;
}
export function MCeilingLight({w,d,H,kind}:{w:number;d:number;H:number;kind:"disk"|"pendant"|"fan"}){
  const cx=w/2,cz=d/2,r=Math.min(w,d)/2;
  if(kind==="pendant")return <group>
    <C p={[cx,H-0.3,cz]} r1={2} h={0.6} m={MT.black}/>
    <C p={[cx,H-10,cz]} r1={0.1} h={20} m={MT.black} seg={6}/>
    <C p={[cx,H-22,cz]} r1={2} r2={Math.max(5,r)} h={5} m={MT.black}/>
    <C p={[cx,H-24.6,cz]} r1={Math.max(5,r)-0.4} h={0.2} m={glow("#fff3d6",1.6)}/>
  </group>;
  if(kind==="fan"){const R=Math.max(16,r*2.2);return <group>
    <C p={[cx,H-3,cz]} r1={0.5} h={6} m={MT.black} seg={10}/>
    <C p={[cx,H-7,cz]} r1={3.5} r2={4} h={3} m={MT.black}/>
    <C p={[cx,H-8.8,cz]} r1={3.6} h={0.4} m={glow("#fff3d6",1.4)}/>
    {[0,1,2].map(i=><group key={i} position={[cx*IN,(H-7)*IN,cz*IN]} rotation={[0,i*Math.PI*2/3,0]}><B p={[R/2+2,0,0]} s={[R,0.4,4.5]} m={MT.walnut} rad={0.15}/></group>)}
  </group>}
  return <group>
    <C p={[cx,H-0.6,cz]} r1={Math.max(3,r)} h={1.2} m={MT.white}/>
    <C p={[cx,H-1.25,cz]} r1={Math.max(3,r)-0.6} h={0.1} m={glow("#fff6e6",1.8)}/>
  </group>;
}
export function MHeater({w,d}:{w:number;d:number}){
  return <group><B p={[w/2,14,Math.min(d,3)/2+0.5]} s={[w,20,Math.min(d,3)]} m={MT.white} rad={0.4}/>
    {(()=>{const n=Math.max(2,Math.round(w/3));return Array.from({length:n},(_,i)=><B key={i} p={[(w/n)*(i+0.5),14,Math.min(d,3)+0.55]} s={[0.15,18,0.1]} m={{color:"#dcdcdc"}} shadow={false}/>)})()}
  </group>;
}

// ---------- меблі ----------
const SOFA="#e2dacd",SOFA2="#d5ccbd";
export function MSofa({w,d,h=30,joinL,joinR}:{w:number;d:number;h?:number;joinL?:boolean;joinR?:boolean}){
  const leg=4,seat=17,arm=Math.min(7,w/8),back=Math.min(8,d/3.5);
  const a0=joinL?0:arm,a1=joinR?0:arm;const n=Math.max(1,Math.round((w-a0-a1)/28));const cw=(w-a0-a1)/n;
  return <group>
    {[[2,2],[w-2,2],[2,d-2],[w-2,d-2]].map(([x,z],i)=><C key={i} p={[x,leg/2,z]} r1={0.6} r2={0.45} h={leg} m={MT.walnut} seg={10}/>)}
    <B p={[w/2,leg+3,d/2]} s={[w,6,d]} m={{color:SOFA2,roughness:0.95}} rad={1.5}/>
    <B p={[w/2,(leg+6+h)/2,back/2]} s={[w,h-leg-6,back]} m={{color:SOFA2,roughness:0.95}} rad={2.5}/>
    {!joinL&&<B p={[arm/2,(leg+seat+7)/2,d/2]} s={[arm,seat+7-leg,d]} m={{color:SOFA2,roughness:0.95}} rad={2.8}/>}
    {!joinR&&<B p={[w-arm/2,(leg+seat+7)/2,d/2]} s={[arm,seat+7-leg,d]} m={{color:SOFA2,roughness:0.95}} rad={2.8}/>}
    {Array.from({length:n},(_,i)=><group key={i}>
      <B p={[a0+cw*(i+0.5),seat-0.5,(back+d)/2]} s={[cw-0.6,5,d-back-0.5]} m={{color:SOFA,roughness:1}} rad={2}/>
      <B p={[a0+cw*(i+0.5),seat+9,back+3]} s={[cw-1,14,6]} m={{color:SOFA,roughness:1}} rad={2.6}/>
    </group>)}
    {!joinL&&<B p={[a0+7,seat+7,back+7]} s={[12,11,4]} m={{color:"#a8b5a0",roughness:1}} rad={1.8}/>}
    {!joinR&&<B p={[w-a1-7,seat+7,back+7]} s={[12,11,4]} m={{color:"#c9a27e",roughness:1}} rad={1.8}/>}
  </group>;
}
export function MTvStand({w,d,h=20}:{w:number;d:number;h?:number}){
  const n=Math.min(80,Math.floor(w/1.4));
  return <group>
    <B p={[w/2,2,d/2-1]} s={[w-6,4,d-3]} m={MT.black}/>
    <B p={[w/2,4+(h-4)/2,d/2]} s={[w,h-4,d]} m={MT.oak} rad={0.4}/>
    {Array.from({length:n},(_,i)=><C key={i} p={[w/n*(i+0.5),4+(h-4)/2,d+0.05]} r1={0.45} h={h-5.5} m={{color:"#b88d5e",roughness:0.7}} seg={8}/>)}
  </group>;
}
export function MTv({w,h,y}:{w:number;h:number;y:number}){
  return <group position={[0,y*IN,0]}>
    <B p={[w/2,h/2,1.2]} s={[w,h,1.2]} m={{color:"#111214",metalness:0.4,roughness:0.3}} rad={0.2}/>
    <mesh position={[w/2*IN,h/2*IN,1.85*IN]}><planeGeometry args={[(w-0.6)*IN,(h-0.6)*IN]}/><meshStandardMaterial color="#0d1626" metalness={0.6} roughness={0.12} emissive="#122844" emissiveIntensity={0.35}/></mesh>
  </group>;
}
export function MBed({w,d,h=22}:{w:number;d:number;h?:number}){
  const frame=10,mat=Math.max(8,h-frame),hb=Math.max(40,h+20);
  const np=w>=56?2:1;const pw=(w-6)/np;
  return <group>
    <B p={[w/2,2,d/2+1]} s={[w-4,4,d-6]} m={MT.black}/>
    <B p={[w/2,4+(frame-4)/2,d/2+1]} s={[w,frame-4,d-2]} m={MT.oak} rad={0.6}/>
    {/* м'яке узголів'я з вертикальною простьобкою */}
    <B p={[w/2,hb/2,2]} s={[w+2,hb,4]} m={{color:"#cfc5b5",roughness:1}} rad={1.5}/>
    {(()=>{const n=Math.max(2,Math.round(w/8))-1;return Array.from({length:n},(_,i)=><B key={i} p={[(w+2)/(n+1)*(i+1)-1,hb/2+2,4.05]} s={[0.25,hb-6,0.1]} m={{color:"#b3a996"}} shadow={false}/>)})()}
    <B p={[w/2,frame+mat/2,d/2+2]} s={[w-2,mat,d-5]} m={{color:"#f6f5f2",roughness:0.95}} rad={2}/>
    {/* ковдра на 2/3 ліжка + плед */}
    <B p={[w/2,frame+mat+0.6,d*0.62]} s={[w-1,1.6,d*0.7]} m={{color:"#e9e3d8",roughness:1}} rad={0.8}/>
    <B p={[w/2,frame+mat+1.6,d*0.82]} s={[w-0.5,0.8,d*0.18]} m={{color:"#a8b5a0",roughness:1}} rad={0.4}/>
    {Array.from({length:np},(_,i)=><B key={i} p={[3+pw*(i+0.5),frame+mat+3,8]} s={[pw-2,5,9]} m={{color:"#fbfaf7",roughness:1}} rad={2.3}/>)}
  </group>;
}
export function MChair({w,d,h=32}:{w:number;d:number;h?:number}){
  return <group>
    {[[2,2],[w-2,2],[2,d-2],[w-2,d-2]].map(([x,z],i)=><C key={i} p={[x,8.5,z]} r1={0.5} r2={0.4} h={17} m={MT.black} seg={10}/>)}
    <B p={[w/2,18,d/2]} s={[w,3,d]} m={{color:"#cdbfa8",roughness:1}} rad={1.4}/>
    <B p={[w/2,(19+h)/2,2]} s={[w-1,h-19,2.5]} m={{color:"#cdbfa8",roughness:1}} rad={1.1}/>
  </group>;
}
export function MTable({w,d,h=30}:{w:number;d:number;h?:number}){
  const round=Math.abs(w-d)<6;const top:Mat={color:"#efece6",roughness:0.25};
  if(round){const r=Math.min(w,d)/2;return <group>
    <C p={[w/2,h-0.6,d/2]} r1={r} h={1.2} m={top} seg={48}/>
    <C p={[w/2,(h-1.2)/2,d/2]} r1={2} r2={3.5} h={h-2.4} m={MT.black}/>
    <C p={[w/2,0.6,d/2]} r1={Math.min(9,r*0.6)} h={1.2} m={MT.black}/>
  </group>}
  return <group>
    <B p={[w/2,h-0.75,d/2]} s={[w,1.5,d]} m={MT.oak} rad={0.4}/>
    {[[2.5,2.5],[w-2.5,2.5],[2.5,d-2.5],[w-2.5,d-2.5]].map(([x,z],i)=><B key={i} p={[x,(h-1.5)/2,z]} s={[1.4,h-1.5,1.4]} m={MT.black}/>)}
  </group>;
}
export function MShelf({w,d,h=72}:{w:number;d:number;h?:number}){
  const n=Math.max(3,Math.round(h/14));const books=["#8c6f5a","#c9b79c","#5f6f73","#d8cfc2","#a65d3f"];
  return <group>
    {[0.6,w-0.6].map((x,i)=><B key={i} p={[x,h/2,d/2]} s={[1.2,h,d]} m={MT.black}/>)}
    {Array.from({length:n+1},(_,i)=><B key={"s"+i} p={[w/2,i*(h-1)/n+0.5,d/2]} s={[w,1,d]} m={MT.oak}/>)}
    {Array.from({length:n},(_,i)=>{const y=i*(h-1)/n+1;const k=Math.floor((w-4)/1.6*0.45);return Array.from({length:k},(_,j)=>{const bh=7+((i*7+j*3)%4);return <B key={i+"-"+j} p={[2+j*1.6+0.7,y+bh/2,d/2]} s={[1.3,bh,Math.min(d-2,8)]} m={{color:books[(i+j)%books.length],roughness:0.9}} shadow={false}/>})})}
  </group>;
}
export function MWardrobe({w,d,h=84,tint}:{w:number;d:number;h?:number;tint?:string}){return <MCabinet w={w} d={d} kind={h>60?"tall":"base"} tint={tint}/>}
export function MAppliance({w,d,h,kind}:{w:number;d:number;h:number;kind:"fridge"|"stove"|"dish"}){
  if(kind==="fridge")return <group>
    <B p={[w/2,h/2,d/2]} s={[w,h,d]} m={MT.steel} rad={0.6}/>
    <B p={[w/2,h*0.35,d+0.03]} s={[w-0.4,0.25,0.1]} m={{color:"#5a6068"}} shadow={false}/>
    <B p={[w/2,h*0.35+((h*0.65)/2),d+0.03]} s={[0.25,h*0.65-0.5,0.1]} m={{color:"#5a6068"}} shadow={false}/>
    {[w/2-1.5,w/2+1.5].map((x,i)=><B key={i} p={[x,h*0.65,d+1]} s={[0.6,16,0.8]} m={MT.black}/>)}
    <B p={[w/2,h*0.35-3,d+1]} s={[w-6,0.6,0.8]} m={MT.black}/>
  </group>;
  if(kind==="dish")return <group><B p={[w/2,h/2,d/2]} s={[w,h,d]} m={MT.steel} rad={0.3}/><B p={[w/2,h-3,d+0.8]} s={[w-4,0.6,0.8]} m={MT.black}/></group>;
  return <group>
    <B p={[w/2,(h-1)/2,d/2]} s={[w,h-1,d]} m={MT.steel} rad={0.3}/>
    <B p={[w/2,h-0.5,d/2]} s={[w,1,d]} m={{color:"#121315",metalness:0.3,roughness:0.15}}/>
    <B p={[w/2,h*0.42,d+0.05]} s={[w-4,h*0.45,0.1]} m={{color:"#1c1e21",metalness:0.3,roughness:0.1}} shadow={false}/>
    <B p={[w/2,h*0.7,d+0.9]} s={[w-6,0.7,0.8]} m={MT.black}/>
  </group>;
}
export function MPlant({w,d,h=60}:{w:number;d:number;h?:number}){
  const r=Math.min(w,d)/2;const potH=Math.min(16,h*0.28);
  const leaves=useMemo(()=>Array.from({length:14},(_,i)=>{const a=i*2.4,t=0.35+(i/14)*0.6;return {x:Math.cos(a)*r*0.55*(1-t*0.3),z:Math.sin(a)*r*0.55*(1-t*0.3),y:potH+(h-potH)*t,s:r*(0.42-t*0.15),c:["#2f6b3a","#3b7d47","#4a8f55","#356f40"][i%4]}}),[r,h,potH]);
  return <group>
    <C p={[w/2,potH/2,d/2]} r1={r*0.62} r2={r*0.48} h={potH} m={{color:"#d9cfc0",roughness:0.85}}/>
    <C p={[w/2,potH+(h-potH)*0.35,d/2]} r1={0.5} r2={0.8} h={(h-potH)*0.7} m={{color:"#6b4f33"}} seg={8}/>
    {leaves.map((l,i)=><mesh key={i} position={[(w/2+l.x)*IN,l.y*IN,(d/2+l.z)*IN]} scale={[1,0.45,1.3]} rotation={[0.4,i,0.2]} castShadow><sphereGeometry args={[Math.max(2,l.s)*IN,14,10]}/><Std m={{color:l.c,roughness:0.85}}/></mesh>)}
  </group>;
}
export function MRug({w,d}:{w:number;d:number}){
  return <group><B p={[w/2,0.2,d/2]} s={[w,0.4,d]} m={{color:"#d9d0c1",roughness:1}} shadow={false}/><B p={[w/2,0.42,d/2]} s={[w-6,0.05,d-6]} m={{color:"#e8e1d5",roughness:1}} shadow={false}/></group>;
}
export function MFloorLamp({w,d,h=64}:{w:number;d:number;h?:number}){
  const curve=useMemo(()=>new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,0,0),new THREE.Vector3(0,h*IN,0),new THREE.Vector3(0,(h-4)*IN,Math.max(14,d)*IN)),24,0.35*IN,8,false),[h,d]);
  return <group position={[w/2*IN,0,2*IN]}>
    <C p={[0,1,0]} r1={5} h={2} m={{color:"#f1efeb",roughness:0.3}}/>
    <mesh geometry={curve} castShadow><Std m={MT.black}/></mesh>
    <group position={[0,(h-6)*IN,Math.max(14,d)*IN]}><mesh castShadow><sphereGeometry args={[6*IN,24,12,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color="#1d1f22" side={THREE.DoubleSide} metalness={0.35} roughness={0.45}/></mesh>
      <mesh position={[0,-0.2*IN,0]} rotation={[Math.PI/2,0,0]}><circleGeometry args={[5.6*IN,24]}/><meshStandardMaterial color="#fff3d6" emissive="#fff3d6" emissiveIntensity={1.8} side={THREE.DoubleSide}/></mesh></group>
  </group>;
}
export function MAc({w,d,h=12,y=72}:{w:number;d:number;h?:number;y?:number}){
  return <group position={[0,y*IN,0]}><B p={[w/2,h/2,Math.min(d,9)/2]} s={[w,h,Math.min(d,9)]} m={MT.white} rad={2}/><B p={[w/2,1.6,Math.min(d,9)-0.5]} s={[w-4,1.2,1]} m={{color:"#d7dadd"}} shadow={false}/></group>;
}
export function MBox({w,d,h}:{w:number;d:number;h:number}){return <B p={[w/2,h/2,d/2]} s={[w,h,d]} m={{color:"#d8cfc2",roughness:0.7}} rad={0.8}/>}
