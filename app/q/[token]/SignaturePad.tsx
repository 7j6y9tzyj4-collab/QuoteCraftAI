"use client";
import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from "react";

// ✍️ Підпис пальцем (або мишкою). get() → PNG data URL (до ~600px) або null, якщо порожньо.
export type SigHandle={get:()=>string|null};
const SignaturePad=forwardRef<SigHandle,{label?:string}>(function SignaturePad({label="Sign here"},ref){
  const cv=useRef<HTMLCanvasElement>(null);const drawing=useRef(false);const [inked,setInked]=useState(false);
  useEffect(()=>{const c=cv.current;if(!c)return;const r=c.getBoundingClientRect();const k=window.devicePixelRatio||1;c.width=r.width*k;c.height=r.height*k;
    const g=c.getContext("2d")!;g.scale(k,k);g.lineWidth=2.5;g.lineCap="round";g.lineJoin="round";g.strokeStyle="#101828"},[]);
  const pos=(e:React.PointerEvent)=>{const r=cv.current!.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};
  const down=(e:React.PointerEvent)=>{e.preventDefault();drawing.current=true;cv.current!.setPointerCapture(e.pointerId);const g=cv.current!.getContext("2d")!;const [x,y]=pos(e);g.beginPath();g.moveTo(x,y)};
  const move=(e:React.PointerEvent)=>{if(!drawing.current)return;const g=cv.current!.getContext("2d")!;const [x,y]=pos(e);g.lineTo(x,y);g.stroke();setInked(true)};
  const up=()=>{drawing.current=false};
  const clear=()=>{const c=cv.current!;c.getContext("2d")!.clearRect(0,0,c.width,c.height);setInked(false)};
  useImperativeHandle(ref,()=>({get:()=>{if(!inked||!cv.current)return null;const src=cv.current;const w=Math.min(600,src.width);const t=document.createElement("canvas");t.width=w;t.height=Math.round(src.height*w/src.width);
    t.getContext("2d")!.drawImage(src,0,0,t.width,t.height);return t.toDataURL("image/png")}}),[inked]);
  return <div style={{margin:"10px 0"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"end"}}><b style={{fontSize:14}}>{label}</b><button type="button" onClick={clear} style={{border:"none",background:"none",color:"#2563eb",fontWeight:700,cursor:"pointer"}}>Clear</button></div>
    <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{width:"100%",height:140,border:"2px dashed #98a2b3",borderRadius:12,touchAction:"none",background:"#fcfcfd",marginTop:4,display:"block"}}/>
  </div>;
});
export default SignaturePad;
export const SigImg=({src}:{src?:string})=>src?<img src={src} alt="signature" style={{display:"block",maxWidth:"100%",height:80,objectFit:"contain",background:"#fff",borderRadius:8,marginTop:8}}/>:null;
