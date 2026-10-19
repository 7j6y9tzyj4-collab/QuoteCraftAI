"use client";
import {useEffect,useRef,useState} from "react";

// Фотореалістична 3D-кімната (Gaussian splat з Scaniverse / Polycam / Luma): .spz, .ply, .splat, .ksplat.
// Крутиш пальцем, щипок — ближче/далі. Вигляд «зсередини» (як стоїш у кімнаті) або «збоку».
type Props={url:string;fileName:string;flip?:boolean;onFlip?:(flip:boolean)=>void;height?:number|string;lang?:"uk"|"en"};

export default function SplatViewer({url,fileName,flip=true,onFlip,height=480,lang="uk"}:Props){
  const box=useRef<HTMLDivElement>(null);
  const api=useRef<{setFlip:(f:boolean)=>void;view:(v:"inside"|"outside")=>void}|null>(null);
  const [pct,setPct]=useState(0);
  const [err,setErr]=useState("");
  const [ready,setReady]=useState(false);
  const [fl,setFl]=useState(flip);
  const T=lang==="en"?{load:"Loading 3D view…",inside:"Inside",outside:"Overview",hint:"Drag to look around · pinch to zoom",fail:"Could not load the 3D view."}:{load:"Завантажую 3D…",inside:"Зсередини",outside:"Збоку",hint:"Тягни пальцем — оглянутись · щипок — ближче/далі",fail:"Не вдалося відкрити 3D."};

  useEffect(()=>{
    let alive=true;let raf=0;let cleanup=()=>{};
    (async()=>{
      try{
        const THREE=await import("three");
        const {OrbitControls}=await import("three/examples/jsm/controls/OrbitControls.js");
        const {SplatMesh}=await import("@sparkjsdev/spark");
        // файл з прогресом
        const res=await fetch(url);
        if(!res.ok)throw new Error(`HTTP ${res.status}`);
        const total=Number(res.headers.get("content-length"))||0;
        const reader=res.body!.getReader();const chunks:Uint8Array[]=[];let got=0;
        for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);got+=value.length;if(total&&alive)setPct(Math.round(got/total*100))}
        const bytes=new Uint8Array(got);let o=0;for(const c of chunks){bytes.set(c,o);o+=c.length}
        if(!alive||!box.current)return;
        const el=box.current;
        const renderer=new THREE.WebGLRenderer({antialias:false});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
        renderer.setSize(el.clientWidth,el.clientHeight);
        el.appendChild(renderer.domElement);
        const scene=new THREE.Scene();scene.background=new THREE.Color("#f2f4f7");
        const camera=new THREE.PerspectiveCamera(70,el.clientWidth/el.clientHeight,0.01,500);
        const controls=new OrbitControls(camera,renderer.domElement);
        controls.enableDamping=true;controls.dampingFactor=0.08;
        const mesh=new SplatMesh({fileBytes:bytes,fileName});
        scene.add(mesh);
        await mesh.initialized;
        if(!alive)return;
        const center=new THREE.Vector3();const size=new THREE.Vector3();
        const frame=()=>{mesh.updateMatrixWorld(true);const b=mesh.getBoundingBox(true).applyMatrix4(mesh.matrixWorld);b.getCenter(center);b.getSize(size)};
        const view=(v:"inside"|"outside")=>{
          frame();
          if(v==="inside"){
            // стоїмо в центрі кімнати; дивимось уперед; обертання — навколо себе
            controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,0,0.05));
            controls.minDistance=0.01;controls.maxDistance=Math.max(size.x,size.z)*0.45;controls.rotateSpeed=-0.35;
          }else{
            const d=Math.max(size.x,size.y,size.z)*1.1;
            controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(d*0.6,d*0.55,d*0.6));
            controls.minDistance=0.2;controls.maxDistance=d*3;controls.rotateSpeed=0.6;
          }
          controls.update();
        };
        const setFlip=(f:boolean)=>{mesh.quaternion.set(f?1:0,0,0,f?0:1);view("inside")};
        setFlip(flip);
        api.current={setFlip,view};
        setReady(true);
        const loop=()=>{controls.update();renderer.render(scene,camera);raf=requestAnimationFrame(loop)};loop();
        const onResize=()=>{if(!el.clientWidth)return;renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix()};
        const ro=new ResizeObserver(onResize);ro.observe(el);
        cleanup=()=>{ro.disconnect();cancelAnimationFrame(raf);controls.dispose();mesh.dispose();renderer.dispose();renderer.domElement.remove()};
      }catch(e){if(alive)setErr(T.fail+" "+(e instanceof Error?e.message:String(e)))}
    })();
    return()=>{alive=false;cleanup()};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[url,fileName]);

  const btn:React.CSSProperties={padding:"8px 12px",borderRadius:10,border:"1px solid #d0d5dd",background:"#fff",fontWeight:700,fontSize:14};
  return <div style={{position:"relative",width:"100%",height,borderRadius:14,overflow:"hidden",background:"#f2f4f7",touchAction:"none"}}>
    <div ref={box} style={{position:"absolute",inset:0}}/>
    {!ready&&!err&&<div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",color:"#475467",fontWeight:700}}>{T.load} {pct?`${pct}%`:""}</div>}
    {err&&<div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",color:"#b42318",padding:16,textAlign:"center"}}>{err}</div>}
    {ready&&<div style={{position:"absolute",left:8,right:8,bottom:8,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
      <button type="button" style={btn} onClick={()=>api.current?.view("inside")}>🧍 {T.inside}</button>
      <button type="button" style={btn} onClick={()=>api.current?.view("outside")}>🏠 {T.outside}</button>
      {onFlip&&<button type="button" style={btn} onClick={()=>{const f=!fl;setFl(f);api.current?.setFlip(f);onFlip(f)}}>↕ Перевернути</button>}
      <small style={{color:"#475467",background:"#ffffffcc",padding:"4px 8px",borderRadius:8}}>{T.hint}</small>
    </div>}
  </div>;
}
