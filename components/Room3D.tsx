"use client";
import {useMemo,useRef} from "react";
import * as THREE from "three";
import {Canvas,useFrame,useThree} from "@react-three/fiber";
import {OrbitControls,Html,useGLTF} from "@react-three/drei";
import {Suspense,useEffect,useState} from "react";
import {fmtInches,fixtureModel} from "@/lib/survey";
import type {Room} from "@/lib/survey";
import {roomGeom,onSeg,type V,type WallSeg,type FixBox} from "@/lib/roomGeom";
export type ExportFmt="obj"|"glb"|"usdz";
export type ExportFn=(fmt:ExportFmt)=>Promise<Blob>;

// 3D кімната: стіни з прорізами, підлога з плиткою, сантехніка з простих форм. Одиниці — фути (дюйми/12).
const IN=1/12;
const T=4; // товщина стіни, дюйми
const WALL_COLOR="#f4f1ea",FLOOR_COLOR="#e8e4dc",PORC="#fbfbfd",CHROME="#b8c0cc",WOOD="#c9a77c",GLASS="#cfe3ff";

function Wall({a,b,H,segs,camRef,color}:{a:V;b:V;H:number;segs:WallSeg[];camRef:React.MutableRefObject<THREE.Vector3>;color?:string}){
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const ang=Math.atan2(b[1]-a[1],b[0]-a[0]);
  // прорізи на цій стіні у відстанях від a
  const ops=segs.filter(s=>onSeg(a,b)(s.p)&&onSeg(a,b)(s.q)).map(s=>({s0:Math.hypot(s.p[0]-a[0],s.p[1]-a[1]),s1:Math.hypot(s.q[0]-a[0],s.q[1]-a[1]),z0:s.z0,z1:s.z1,door:s.door})).sort((x,y)=>x.s0-y.s0);
  const pieces:{x0:number;x1:number;z0:number;z1:number}[]=[];
  let cur=0;
  for(const o of ops){const lo=Math.min(o.s0,o.s1),hi=Math.max(o.s0,o.s1);if(lo>cur)pieces.push({x0:cur,x1:lo,z0:0,z1:H});if(o.z0>0)pieces.push({x0:lo,x1:hi,z0:0,z1:o.z0});if(o.z1<H)pieces.push({x0:lo,x1:hi,z0:o.z1,z1:H});cur=hi}
  if(cur<len)pieces.push({x0:cur,x1:len,z0:0,z1:H});
  // зовнішня нормаль стіни (вправо від напрямку a→b при обході за годинниковою)
  const nx=(b[1]-a[1])/len,ny=-(b[0]-a[0])/len;
  const mats=useRef<THREE.MeshStandardMaterial[]>([]);
  useFrame(()=>{
    const c=camRef.current;const mx=(a[0]+b[0])/2*IN,my=(a[1]+b[1])/2*IN;
    const dot=(c.x-mx)*nx+(c.z-my)*ny; // камера з боку зовнішньої нормалі → стіна між нами й кімнатою
    const op=dot>0?0.03:1;
    for(const m of mats.current){if(m&&m.opacity!==op){m.opacity=op;m.depthWrite=op>=1;m.needsUpdate=true}}
  });
  return <group position={[a[0]*IN,0,a[1]*IN]} rotation={[0,-ang,0]}>
    {pieces.map((p,i)=><mesh key={i} position={[(p.x0+p.x1)/2*IN,(p.z0+p.z1)/2*IN,-T/2*IN]} castShadow receiveShadow>
      <boxGeometry args={[(p.x1-p.x0)*IN,(p.z1-p.z0)*IN,T*IN]}/>
      <meshStandardMaterial ref={el=>{if(el)mats.current[i]=el}} color={color||WALL_COLOR} roughness={0.9} transparent opacity={1}/>
    </mesh>)}
    {ops.map((o,i)=>o.door?<mesh key={"d"+i} position={[(o.s0+o.s1)/2*IN,o.z1/2*IN,-T/2*IN]}><boxGeometry args={[(o.s1-o.s0)*IN,o.z1*IN,1*IN]}/><meshStandardMaterial color="#d9cbb3" transparent opacity={0.35}/></mesh>
      :<mesh key={"w"+i} position={[(o.s0+o.s1)/2*IN,(o.z0+o.z1)/2*IN,-T/2*IN]}><boxGeometry args={[(o.s1-o.s0)*IN,(o.z1-o.z0)*IN,0.5*IN]}/><meshStandardMaterial color={GLASS} transparent opacity={0.35}/></mesh>)}
  </group>;
}

// ---- сантехніка з простих форм (локальні координати: x вздовж стіни 0..w, z від стіни в кімнату 0..d, y вгору) ----
function Toilet({w,d}:{w:number;d:number}){
  const tw=Math.min(w,20),td=7,th=14,bowlR=Math.min(w,16)/2;
  return <group>
    <mesh position={[w/2*IN,(15+th/2)*IN,td/2*IN]}><boxGeometry args={[tw*IN,th*IN,td*IN]}/><meshStandardMaterial color={PORC}/></mesh>
    <mesh position={[w/2*IN,15*IN,(td+bowlR*0.9)*IN]} scale={[1,0.45,1.25]}><sphereGeometry args={[bowlR*IN,24,16]}/><meshStandardMaterial color={PORC}/></mesh>
    <mesh position={[w/2*IN,7*IN,(td+bowlR*0.9)*IN]}><cylinderGeometry args={[bowlR*0.5*IN,bowlR*0.75*IN,14*IN,20]}/><meshStandardMaterial color={PORC}/></mesh>
    <mesh position={[w/2*IN,16.2*IN,(td+bowlR*0.9)*IN]} rotation={[-Math.PI/2,0,0]} scale={[1,1.25,1]}><ringGeometry args={[bowlR*0.55*IN,bowlR*0.98*IN,28]}/><meshStandardMaterial color="#f1f1f3" side={THREE.DoubleSide}/></mesh>
  </group>;
}
function Vanity({w,d}:{w:number;d:number}){
  const h=34;
  return <group>
    <mesh position={[w/2*IN,(h-1)/2*IN,d/2*IN]}><boxGeometry args={[w*IN,(h-1)*IN,d*IN]}/><meshStandardMaterial color={WOOD}/></mesh>
    <mesh position={[w/2*IN,(h+0.5)*IN,(d/2+0.5)*IN]}><boxGeometry args={[(w+1)*IN,1.2*IN,(d+1)*IN]}/><meshStandardMaterial color="#e9e6df"/></mesh>
    <mesh position={[w/2*IN,(h+1.2)*IN,(d/2+1)*IN]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[Math.min(w*0.3,8)*IN,28]}/><meshStandardMaterial color="#dfe3ea"/></mesh>
    <mesh position={[w/2*IN,(h+4)*IN,3*IN]}><cylinderGeometry args={[0.5*IN,0.5*IN,6*IN,10]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>
    {w>=24&&<mesh position={[w/2*IN,(h/2)*IN,(d+0.05)*IN]}><boxGeometry args={[0.3*IN,(h-6)*IN,0.2*IN]}/><meshStandardMaterial color="#8a6a44"/></mesh>}
  </group>;
}
function Sink({w,d}:{w:number;d:number}){
  return <group>
    <mesh position={[w/2*IN,16*IN,d/2*IN]}><cylinderGeometry args={[3*IN,4*IN,32*IN,14]}/><meshStandardMaterial color={PORC}/></mesh>
    <mesh position={[w/2*IN,33*IN,d/2*IN]} scale={[1,0.35,1]}><sphereGeometry args={[Math.min(w,d)/2*IN,24,12]}/><meshStandardMaterial color={PORC}/></mesh>
    <mesh position={[w/2*IN,38*IN,2*IN]}><cylinderGeometry args={[0.5*IN,0.5*IN,6*IN,10]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>
  </group>;
}
function Tub({w,d}:{w:number;d:number}){
  const h=20,t=3;
  const side=(x:number,z:number,sx:number,sz:number)=><mesh position={[x*IN,h/2*IN,z*IN]}><boxGeometry args={[sx*IN,h*IN,sz*IN]}/><meshStandardMaterial color={PORC}/></mesh>;
  return <group>
    <mesh position={[w/2*IN,2*IN,d/2*IN]}><boxGeometry args={[w*IN,4*IN,d*IN]}/><meshStandardMaterial color={PORC}/></mesh>
    {side(w/2,t/2,w,t)}{side(w/2,d-t/2,w,t)}{side(t/2,d/2,t,d)}{side(w-t/2,d/2,t,d)}
    <mesh position={[w/2*IN,4.3*IN,d/2*IN]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[(w-2*t)*IN,(d-2*t)*IN]}/><meshStandardMaterial color="#eef1f5"/></mesh>
    <mesh position={[6*IN,(h+2)*IN,d/2*IN]}><cylinderGeometry args={[0.6*IN,0.6*IN,5*IN,10]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>
  </group>;
}
function Shower({w,d,wallSide}:{w:number;d:number;wallSide:boolean}){
  const h=78;
  return <group>
    <mesh position={[w/2*IN,2*IN,d/2*IN]}><boxGeometry args={[w*IN,4*IN,d*IN]}/><meshStandardMaterial color="#dfe3ea"/></mesh>
    <mesh position={[w/2*IN,4.1*IN,d/2*IN]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[1.5*IN,16]}/><meshStandardMaterial color={CHROME}/></mesh>
    {/* скло: передня панель і бік, якого нема біля стіни */}
    <mesh position={[w/2*IN,(4+h/2)*IN,(d-0.3)*IN]}><boxGeometry args={[w*IN,h*IN,0.4*IN]}/><meshStandardMaterial color={GLASS} transparent opacity={0.28}/></mesh>
    {!wallSide&&<mesh position={[(w-0.3)*IN,(4+h/2)*IN,d/2*IN]}><boxGeometry args={[0.4*IN,h*IN,d*IN]}/><meshStandardMaterial color={GLASS} transparent opacity={0.28}/></mesh>}
    <mesh position={[w/2*IN,78*IN,6*IN]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.5*IN,0.5*IN,12*IN,8]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>
    <mesh position={[w/2*IN,77*IN,12*IN]} rotation={[-Math.PI/2.4,0,0]}><cylinderGeometry args={[3*IN,3*IN,0.6*IN,20]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>
  </group>;
}
function Washer({w,d,dryer}:{w:number;d:number;dryer?:boolean}){
  const h=36;
  return <group>
    <mesh position={[w/2*IN,h/2*IN,d/2*IN]}><boxGeometry args={[w*IN,h*IN,d*IN]}/><meshStandardMaterial color="#f3f4f6"/></mesh>
    <mesh position={[w/2*IN,(h*0.5)*IN,(d+0.1)*IN]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[Math.min(w,h)*0.3*IN,Math.min(w,h)*0.3*IN,0.4*IN,28]}/><meshStandardMaterial color={dryer?"#cfd4dc":"#9fb4d6"} metalness={0.3}/></mesh>
    <mesh position={[w/2*IN,(h-2)*IN,(d+0.1)*IN]}><boxGeometry args={[(w-4)*IN,2.5*IN,0.3*IN]}/><meshStandardMaterial color="#2b2f36"/></mesh>
  </group>;
}
function Flat({w,d,H,light}:{w:number;d:number;H:number;light?:boolean}){
  return <mesh position={[w/2*IN,(H-1)*IN,d/2*IN]}>{light?<cylinderGeometry args={[Math.min(w,d)/2*IN,Math.min(w,d)/2*IN,1.5*IN,24]}/>:<boxGeometry args={[w*IN,1.5*IN,d*IN]}/>}<meshStandardMaterial color={light?"#fff7d6":"#f3f4f6"} emissive={light?"#ffe9a8":"#000"} emissiveIntensity={light?0.6:0}/></mesh>;
}
// Аксесуари (малюються кодом): дзеркало, світло над дзеркалом, тримач рушників. y — низ над підлогою, дюйми.
function Mirror({w,h,y,round}:{w:number;h:number;y:number;round:boolean}){
  const r=Math.min(w,h)/2;
  return <group position={[w/2*IN,(y+h/2)*IN,1*IN]}>
    {round?<mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[r*IN,r*IN,0.8*IN,48]}/><meshStandardMaterial color="#2b2f36"/></mesh>:<mesh><boxGeometry args={[w*IN,h*IN,0.8*IN]}/><meshStandardMaterial color="#2b2f36"/></mesh>}
    {round?<mesh rotation={[Math.PI/2,0,0]} position={[0,0,0.5*IN]}><cylinderGeometry args={[(r-0.6)*IN,(r-0.6)*IN,0.4*IN,48]}/><meshStandardMaterial color="#d6e4f0" metalness={0.2} roughness={0.15}/></mesh>:<mesh position={[0,0,0.5*IN]}><boxGeometry args={[(w-1.2)*IN,(h-1.2)*IN,0.4*IN]}/><meshStandardMaterial color="#d6e4f0" metalness={0.2} roughness={0.15}/></mesh>}
  </group>;
}
function VanityLight({w,y,n}:{w:number;y:number;n:number}){
  const sp=w/n;
  return <group>
    <mesh position={[w/2*IN,(y+6)*IN,2*IN]}><boxGeometry args={[w*IN,1*IN,1*IN]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>
    {Array.from({length:n},(_,i)=><group key={i} position={[(sp*(i+0.5))*IN,0,3*IN]}>
      <mesh position={[0,(y+3)*IN,0]}><cylinderGeometry args={[1.8*IN,1.8*IN,5*IN,20,1,true]}/><meshStandardMaterial color={GLASS} transparent opacity={0.35} side={THREE.DoubleSide}/></mesh>
      <mesh position={[0,(y+3)*IN,0]}><sphereGeometry args={[1*IN,12,8]}/><meshStandardMaterial color="#fff3c4" emissive="#ffd166" emissiveIntensity={1.2}/></mesh>
      <mesh position={[0,(y+5.8)*IN,0]}><cylinderGeometry args={[2*IN,2*IN,0.6*IN,20]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>
    </group>)}
  </group>;
}
function TowelBar({w,y,ring}:{w:number;y:number;ring:boolean}){
  return ring?<mesh position={[w/2*IN,(y+4)*IN,2*IN]}><torusGeometry args={[3.5*IN,0.3*IN,10,32]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>
  :<group><mesh position={[w/2*IN,(y+1)*IN,2.5*IN]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[0.35*IN,0.35*IN,w*IN,12]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>
    {[1.5,w-1.5].map((x,i)=><mesh key={i} position={[x*IN,(y+1)*IN,1.2*IN]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.4*IN,0.4*IN,2.5*IN,10]}/><meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.3}/></mesh>)}</group>;
}
function Box({w,d,h,color}:{w:number;d:number;h:number;color:string}){
  return <mesh position={[w/2*IN,h/2*IN,d/2*IN]}><boxGeometry args={[w*IN,h*IN,d*IN]}/><meshStandardMaterial color={color}/></mesh>;
}
// Готові моделі (Kenney Furniture Kit, CC0, /public/models) — варіанти в lib/survey FIXTURE_MODELS. Вписуються в габарит w×h×d, перед — у кімнату.
function GlbFixture({f,H,tint}:{f:FixBox;H:number;tint?:string}){
  const m=fixtureModel(f.type,f.model)!;
  const {scene}=useGLTF("/models/"+m.file);
  const [obj,setObj]=useState<THREE.Object3D|null>(null);
  useEffect(()=>{
    const o=scene.clone(true);
    o.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(o);const sz=new THREE.Vector3();box.getSize(sz);
    const h=Math.min(m.h,H-2);
    const sx=f.w*IN/Math.max(sz.x,1e-6),sy=h*IN/Math.max(sz.y,1e-6),sz2=f.d*IN/Math.max(sz.z,1e-6);
    // ширина і глибина — точно за введеними розмірами (модель трохи розтягується); унітаз і п'єдестал — пропорційно
    const keepRatio=f.type==="toilet"||(f.type==="sink"&&(f.model||"pedestal")==="pedestal")||(f.type==="vanity"&&f.model==="pedestal");
    const su=Math.min(sx,sz2);
    const g=new THREE.Group();g.add(o);o.scale.set(keepRatio?su:sx,sy,keepRatio?su:sz2);o.updateMatrixWorld(true);
    const b2=new THREE.Box3().setFromObject(o);
    // ставимо: лівий край на x=0, задня стінка до стіни (z=0), низ на підлогу (або під стелю)
    const cx=(b2.min.x+b2.max.x)/2;
    const y0=m.ceiling?Math.max(0,H*IN-(b2.max.y-b2.min.y)):Math.min((m.y||0)*IN,Math.max(0,H*IN-(b2.max.y-b2.min.y)));
    o.position.set(f.w*IN/2-cx,-(b2.min.y)+y0,-(b2.min.z)+(f.d*IN-(b2.max.z-b2.min.z))/2*(m.ceiling?1:0));
    o.traverse(n=>{const mm=n as THREE.Mesh;if(mm.isMesh){mm.castShadow=true;mm.receiveShadow=true;
      if(tint){const mat=mm.material as THREE.MeshStandardMaterial;if(mat&&/wood/i.test(mat.name||"")){const c=mat.clone();c.color.set(tint);mm.material=c}}}});
    setObj(g);
  },[scene,f.w,f.d,H,m,tint]);
  return obj?<primitive object={obj}/>:null;
}
function Fixture({f,H,geom,look}:{f:FixBox;H:number;geom:NonNullable<ReturnType<typeof roomGeom>>;look?:Room["look"]}){
  // локальна система: початок у p0, x вздовж стіни, z у кімнату
  const ang=Math.atan2(geom.dir[f.k][1],geom.dir[f.k][0]);
  const mdl=fixtureModel(f.type,f.model);
  const tint=(f.type==="vanity"||f.type==="sink"||f.type==="cabinet")&&look?.vanity?look.vanity:undefined;
  const inner=mdl&&mdl.file?<Suspense fallback={<Box w={f.w} d={f.d} h={mdl.h} color="#e5e7eb"/>}><GlbFixture f={f} H={H} tint={tint}/></Suspense>:(()=>{switch(f.type){
    case "mirror":return <Mirror w={f.w} h={mdl?.h||24} y={Math.min(mdl?.y||40,H-(mdl?.h||24)-2)} round={(f.model||"round")==="round"}/>;
    case "vanityLight":return <VanityLight w={f.w} y={Math.min(mdl?.y||72,H-10)} n={f.model==="bar2"?2:f.model==="bar3"?3:4}/>;
    case "towelBar":return <TowelBar w={f.w} y={mdl?.y||48} ring={f.model==="ring"}/>;
    case "toilet":return <Toilet w={f.w} d={f.d}/>;
    case "vanity":return <Vanity w={f.w} d={f.d}/>;
    case "sink":return <Sink w={f.w} d={f.d}/>;
    case "tub":return <Tub w={f.w} d={f.d}/>;
    case "shower":return <Shower w={f.w} d={f.d} wallSide={false}/>;
    case "washer":return <Washer w={f.w} d={f.d}/>;
    case "dryer":return <Washer w={f.w} d={f.d} dryer/>;
    case "fan":return <Flat w={f.w} d={f.d} H={H}/>;
    case "light":return <Flat w={f.w} d={f.d} H={H} light/>;
    case "heater":return <Box w={f.w} d={f.d} h={24} color="#e5e7eb"/>;
    case "cabinet":return <Box w={f.w} d={f.d} h={Math.min(84,H-2)} color={WOOD}/>;
    default:return <Box w={f.w} d={f.d} h={30} color="#e5e7eb"/>;
  }})();
  // локальне z у кімнату = −nrm; у three локальна вісь z після повороту на -ang вказує... будуємо явно: x→dir, z→(−nrm)
  const nx=-geom.nrm[f.k][0],ny=-geom.nrm[f.k][1];
  const m=new THREE.Matrix4().makeBasis(new THREE.Vector3(geom.dir[f.k][0],0,geom.dir[f.k][1]),new THREE.Vector3(0,1,0),new THREE.Vector3(nx,0,ny));
  m.setPosition(f.p0[0]*IN,0,f.p0[1]*IN);
  return <group matrixAutoUpdate={false} matrix={m}>{inner}</group>;
}

function Scene({room,dims,captureRef,exportRef}:{room:Room;dims:boolean;captureRef?:React.MutableRefObject<(()=>string|null)|null>;exportRef?:React.MutableRefObject<ExportFn|null>}){
  const g=useMemo(()=>roomGeom(room),[room]);
  const camRef=useRef(new THREE.Vector3());
  const {camera,gl,scene}=useThree();
  useEffect(()=>{if(captureRef)captureRef.current=()=>{try{gl.render(scene,camera);return gl.domElement.toDataURL("image/png")}catch{return null}};return()=>{if(captureRef)captureRef.current=null}},[captureRef,gl,scene,camera]);
  // Експорт сцени: OBJ (SketchUp Pro → File → Import, одиниці: feet), GLB (будь-який 3D-в'юер), USDZ (iPhone AR Quick Look)
  useEffect(()=>{if(!exportRef)return;exportRef.current=async(fmt)=>{
    // без підписів і світла — тільки геометрія кімнати
    const src=scene.clone(true);src.traverse(n=>{n.userData={}});
    if(fmt==="obj"){const {OBJExporter}=await import("three/examples/jsm/exporters/OBJExporter.js");return new Blob([new OBJExporter().parse(src)],{type:"model/obj"})}
    if(fmt==="usdz"){const {USDZExporter}=await import("three/examples/jsm/exporters/USDZExporter.js");const u8=await new USDZExporter().parseAsync(src);return new Blob([u8 as unknown as BlobPart],{type:"model/vnd.usdz+zip"})}
    const {GLTFExporter}=await import("three/examples/jsm/exporters/GLTFExporter.js");
    const buf=await new GLTFExporter().parseAsync(src,{binary:true}) as ArrayBuffer;return new Blob([buf],{type:"model/gltf-binary"});
  };return()=>{if(exportRef)exportRef.current=null}},[exportRef,scene]);
  useFrame(()=>{camRef.current.copy(camera.position)});
  const pts=g?.pts||[],H=g?.H||96,L=g?.L||0,W=g?.W||0;
  const shape=useMemo(()=>{const s=new THREE.Shape();pts.forEach((p,i)=>{if(i===0)s.moveTo(p[0]*IN,p[1]*IN);else s.lineTo(p[0]*IN,p[1]*IN)});s.closePath();return s},[pts]);
  const tile=room.floorTile;const look=room.look;
  // плитка: текстура з однієї плитки, повторюється за розміром (ShapeGeometry має UV у світових одиницях)
  const tex=useMemo(()=>{
    if(!tile||tile.w<=0||tile.h<=0)return null;
    const c=document.createElement("canvas");const S=128;c.width=S;c.height=Math.max(8,Math.round(S*tile.h/tile.w));
    const ctx=c.getContext("2d")!;ctx.fillStyle=look?.floor||"#ebe7df";ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle="rgba(0,0,0,.18)";ctx.lineWidth=3;ctx.strokeRect(1.5,1.5,c.width-3,c.height-3);
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/(tile.w*IN),1/(tile.h*IN));t.anisotropy=4;return t;
  },[tile,look?.floor]);
  if(!g)return null;
  return <>
    <ambientLight intensity={1.1}/>
    <hemisphereLight args={["#ffffff","#cfc8bd",0.8]}/>
    <directionalLight position={[L*IN,H*IN*2,W*IN*1.5]} intensity={1.6} castShadow/>
    <directionalLight position={[-L*IN,H*IN*1.5,-W*IN]} intensity={0.5}/>
    <mesh rotation={[Math.PI/2,0,0]} receiveShadow><shapeGeometry args={[shape]}/>{tex?<meshStandardMaterial map={tex} side={THREE.DoubleSide}/>:<meshStandardMaterial color={look?.floor||FLOOR_COLOR} side={THREE.DoubleSide}/>}</mesh>
    {pts.map((a,i)=>{const b=pts[(i+1)%pts.length];if(a[0]===b[0]&&a[1]===b[1])return null;return <Wall key={i} a={a} b={b} H={H} segs={g.segs} camRef={camRef} color={look?.wall}/>})}
    {g.fixtures.map(f=><Fixture key={f.id} f={f} H={H} geom={g} look={look}/>)}
    {dims&&<Dims g={g}/>}
    <OrbitControls target={[L/2*IN,H/3*IN,W/2*IN]} enableDamping dampingFactor={0.1} maxPolarAngle={Math.PI/2.05} minDistance={3} maxDistance={60}/>
  </>;
}

const Tag=({p,text,color="#1d4ed8"}:{p:[number,number,number];text:string;color?:string})=><Html position={p} center zIndexRange={[10,0]} occlude={false} style={{pointerEvents:"none"}}><div style={{background:"rgba(255,255,255,.92)",border:`1px solid ${color}`,color,borderRadius:6,padding:"1px 5px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{text}</div></Html>;
function Dims({g}:{g:NonNullable<ReturnType<typeof roomGeom>>}){
  const {pts,H}=g;
  return <>
    {pts.map((a,i)=>{const b=pts[(i+1)%pts.length];const l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<12)return null;return <Tag key={"w"+i} p={[(a[0]+b[0])/2*IN,2*IN,(a[1]+b[1])/2*IN]} text={fmtInches(l)}/>})}
    <Tag p={[pts[0][0]*IN,H/2*IN,pts[0][1]*IN]} text={"↕ "+fmtInches(H)} color="#067647"/>
    {g.segs.filter((s,i,arr)=>arr.findIndex(x=>Math.abs(x.p[0]-s.p[0])<1&&Math.abs(x.p[1]-s.p[1])<1&&Math.abs(x.z0-s.z0)<1)===i).map((s,i)=><Tag key={"o"+i} p={[(s.p[0]+s.q[0])/2*IN,(s.z0+s.z1)/2*IN,(s.p[1]+s.q[1])/2*IN]} text={`${fmtInches(Math.hypot(s.q[0]-s.p[0],s.q[1]-s.p[1]))} × ${fmtInches(s.z1-s.z0)}`} color="#7a5af8"/>)}
    {g.fixtures.map(f=><Tag key={"f"+f.id} p={[(f.p0[0]+f.p2[0])/2*IN,(fixTop(f,H)+3)*IN,(f.p0[1]+f.p2[1])/2*IN]} text={`${fmtInches(f.w)} × ${fmtInches(f.d)}`} color="#475467"/>)}
  </>;
}
function fixTop(f:FixBox,H:number){const m=fixtureModel(f.type,f.model);if(!m)return FIX_H3[f.type]||30;return m.ceiling?H-12:(m.y||0)+m.h}
const FIX_H3:Record<string,number>={toilet:30,vanity:36,sink:34,tub:20,shower:82,washer:36,dryer:36,fan:90,light:90,heater:24,cabinet:84,other:30};
export default function Room3D({room,dims=true,height=340,captureRef,exportRef}:{room:Room;dims?:boolean;height?:number|string;captureRef?:React.MutableRefObject<(()=>string|null)|null>;exportRef?:React.MutableRefObject<ExportFn|null>}){
  const g=roomGeom(room);
  if(!g)return null;
  const diag=Math.hypot(g.L,g.W,g.H)*IN;
  return <div style={{height,width:"100%",borderRadius:12,overflow:"hidden",border:"1px solid #e4e7ec",background:"#fff",touchAction:"none",position:"relative"}}>
    <Canvas shadows camera={{position:[g.L*IN*1.15,g.H*IN*0.7,g.W*IN+diag*0.6],fov:50}} dpr={[1,2]} gl={{antialias:true,preserveDrawingBuffer:true}}>
      <Scene room={room} dims={dims} captureRef={captureRef} exportRef={exportRef}/>
    </Canvas>
    <div style={{position:"absolute",left:0,right:0,bottom:4,textAlign:"center",fontSize:11,color:"#98a2b3",pointerEvents:"none"}}>один палець — крутити · два — наблизити/посунути</div>
  </div>;
}
