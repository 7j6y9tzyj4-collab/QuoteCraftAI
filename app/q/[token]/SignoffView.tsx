"use client";
import {useEffect,useRef,useState} from "react";

// ✍️ Сторінка клієнта: підтвердження завершення роботи + підпис пальцем.
export type SignoffData={company:string;contact:string;logo:string;client:string;project:string;items:{text:string;done:boolean}[];
  signed:{name:string;at:string;sig:string}|null};
export default function SignoffView({token,d}:{token:string;d:SignoffData}){
  const cv=useRef<HTMLCanvasElement>(null);const drawing=useRef(false);const [inked,setInked]=useState(false);
  const [name,setName]=useState(d.client||"");const [busy,setBusy]=useState(false);const [err,setErr]=useState("");
  const [signed,setSigned]=useState(d.signed);
  useEffect(()=>{const c=cv.current;if(!c)return;const r=c.getBoundingClientRect();const k=window.devicePixelRatio||1;c.width=r.width*k;c.height=r.height*k;
    const g=c.getContext("2d")!;g.scale(k,k);g.lineWidth=2.5;g.lineCap="round";g.lineJoin="round";g.strokeStyle="#101828"},[signed]);
  const pos=(e:React.PointerEvent)=>{const r=cv.current!.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};
  const down=(e:React.PointerEvent)=>{e.preventDefault();drawing.current=true;cv.current!.setPointerCapture(e.pointerId);const g=cv.current!.getContext("2d")!;const [x,y]=pos(e);g.beginPath();g.moveTo(x,y)};
  const move=(e:React.PointerEvent)=>{if(!drawing.current)return;const g=cv.current!.getContext("2d")!;const [x,y]=pos(e);g.lineTo(x,y);g.stroke();setInked(true)};
  const up=()=>{drawing.current=false};
  const clear=()=>{const c=cv.current!;c.getContext("2d")!.clearRect(0,0,c.width,c.height);setInked(false)};
  async function submit(){
    setErr("");if(!inked){setErr("Please sign in the box.");return}if(name.trim().length<2){setErr("Please type your name.");return}
    setBusy(true);
    try{
      // зменшуємо підпис до ~600px ширини, щоб не важив багато
      const src=cv.current!;const w=Math.min(600,src.width);const t=document.createElement("canvas");t.width=w;t.height=Math.round(src.height*w/src.width);
      t.getContext("2d")!.drawImage(src,0,0,t.width,t.height);const sig=t.toDataURL("image/png");
      const r=await fetch("/api/signoff-sign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,name,sig})});const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Error");setSigned({name,at:new Date().toISOString(),sig});
    }catch(e){setErr(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  const open=d.items.filter(i=>!i.done),done=d.items.filter(i=>i.done);
  return <div>
    {d.logo&&<img src={d.logo} alt="" style={{maxHeight:56,maxWidth:200,objectFit:"contain",display:"block",marginBottom:8}}/>}
    <span className="eyebrow">{d.company}</span>
    <h1 style={{margin:"6px 0 4px"}}>Work Completion</h1>
    <p style={{margin:0,color:"#475467"}}>{d.project}{d.client?` · ${d.client}`:""}</p>
    {d.items.length>0&&<div style={{marginTop:16}}>
      <h3 style={{margin:"0 0 6px"}}>Punch list</h3>
      {done.map((i,k)=><div key={"d"+k} style={{padding:"6px 0",borderTop:"1px solid #eaecf0"}}>✅ {i.text}</div>)}
      {open.map((i,k)=><div key={"o"+k} style={{padding:"6px 0",borderTop:"1px solid #eaecf0"}}>⬜ {i.text} <small style={{color:"#b54708"}}>— will be completed</small></div>)}
    </div>}
    {signed?<div style={{marginTop:18,padding:14,borderRadius:14,background:"#ecfdf3",border:"1px solid #abefc6"}}>
      <b style={{color:"#067647",fontSize:18}}>✓ Signed — thank you!</b>
      <p style={{margin:"6px 0"}}>{signed.name} · {new Date(signed.at).toLocaleString("en-US")}</p>
      {signed.sig&&<img src={signed.sig} alt="signature" style={{maxWidth:"100%",height:90,objectFit:"contain",background:"#fff",borderRadius:8}}/>}
    </div>:<div style={{marginTop:18}}>
      <p style={{fontSize:15,lineHeight:1.5}}>I confirm that the work on <b>{d.project||"this project"}</b> has been completed to my satisfaction{open.length?", except the items marked “will be completed” above":""}.</p>
      <label style={{display:"block",fontWeight:700,marginBottom:6}}>Your name<input value={name} onChange={e=>setName(e.target.value)} style={{display:"block",width:"100%",padding:12,borderRadius:10,border:"1px solid #d0d5dd",fontSize:16,marginTop:4,boxSizing:"border-box"}}/></label>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",marginTop:8}}><b>Sign here</b><button type="button" onClick={clear} style={{border:"none",background:"none",color:"#2563eb",fontWeight:700}}>Clear</button></div>
      <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{width:"100%",height:160,border:"2px dashed #98a2b3",borderRadius:12,touchAction:"none",background:"#fcfcfd",marginTop:4}}/>
      {err&&<p style={{color:"#b42318",margin:"6px 0 0"}}>{err}</p>}
      <button onClick={submit} disabled={busy} style={{width:"100%",marginTop:12,padding:16,borderRadius:14,border:"none",background:"#079455",color:"#fff",fontWeight:800,fontSize:17}}>{busy?"Saving…":"✓ Confirm & Sign"}</button>
      {d.contact&&<p style={{fontSize:13,color:"#667085",marginTop:10}}>Questions? {d.company} · {d.contact}</p>}
    </div>}
  </div>;
}
