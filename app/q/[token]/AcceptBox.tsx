"use client";
import {useRef,useState} from "react";
import SignaturePad,{SigImg,type SigHandle} from "./SignaturePad";

export default function AcceptBox({token,accepted,acceptedName,acceptedAt,acceptedSig="",kind="q",change=false}:{token:string;accepted:boolean;acceptedName:string;acceptedAt:string;acceptedSig?:string;kind?:"q"|"e";change?:boolean}){
  const [name,setName]=useState("");
  const [done,setDone]=useState(accepted?{name:acceptedName,at:acceptedAt,sig:acceptedSig}:null as null|{name:string;at:string;sig?:string});
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const pad=useRef<SigHandle>(null);
  if(done)return <div className="noPrint" style={{marginTop:24,padding:16,borderRadius:14,background:"#ecfdf3",color:"#067647"}}>
    ✓ {change?"Change order approved":"Estimate accepted"}{done.name?` by ${done.name}`:""}{done.at?` on ${new Date(done.at).toLocaleDateString("en-US")}`:""}. Thank you{change?"!":" — we will contact you to schedule the work."}<SigImg src={done.sig}/>
  </div>;
  async function accept(){
    if(!name.trim()){setErr("Please type your name.");return}
    const sig=kind!=="e"?pad.current?.get()||null:null;if(kind!=="e"&&!sig){setErr("Please sign in the box.");return}
    setBusy(true);setErr("");
    try{
      const r=await fetch("/api/quote-accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,name:name.trim(),sig,kind})});
      const d=await r.json();
      if(!r.ok)throw new Error(d?.error||"Error");
      setDone({name:name.trim(),at:d.accepted_at,sig:sig||undefined});
    }catch(e){setErr(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  return <div className="noPrint" style={{marginTop:24,padding:16,borderRadius:14,border:"1px solid #d0d5dd"}}>
    <h3 style={{marginTop:0}}>{change?"Approve this change order":"Accept this estimate"}</h3>
    <p style={{fontSize:14,color:"#667085"}}>{change?"Type your name, sign below and press Approve. The amount will be added to your final payment — nothing is charged now.":"Type your name, sign below and press Accept. This does not charge anything — we will contact you to confirm the schedule and deposit."}</p>
    {kind!=="e"&&<SignaturePad ref={pad}/>}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={{flex:"1 1 200px",padding:10,borderRadius:10,border:"1px solid #d0d5dd"}}/>
      <button className="primary" disabled={busy} onClick={accept}>{busy?"Sending…":change?"Approve change order":"Accept estimate"}</button>
    </div>
    {err&&<p style={{color:"#b42318",fontSize:14}}>{err}</p>}
  </div>;
}
