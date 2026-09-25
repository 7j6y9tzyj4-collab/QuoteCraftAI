"use client";
import {useState} from "react";

export default function AcceptBox({token,accepted,acceptedName,acceptedAt,kind="q"}:{token:string;accepted:boolean;acceptedName:string;acceptedAt:string;kind?:"q"|"e"}){
  const [name,setName]=useState("");
  const [done,setDone]=useState(accepted?{name:acceptedName,at:acceptedAt}:null as null|{name:string;at:string});
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  if(done)return <div className="noPrint" style={{marginTop:24,padding:16,borderRadius:14,background:"#ecfdf3",color:"#067647"}}>
    ✓ Estimate accepted{done.name?` by ${done.name}`:""}{done.at?` on ${new Date(done.at).toLocaleDateString("en-US")}`:""}. Thank you — we will contact you to schedule the work.
  </div>;
  async function accept(){
    if(!name.trim()){setErr("Please type your name.");return}
    setBusy(true);setErr("");
    try{
      const r=await fetch("/api/quote-accept",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,name:name.trim(),kind})});
      const d=await r.json();
      if(!r.ok)throw new Error(d?.error||"Error");
      setDone({name:name.trim(),at:d.accepted_at});
    }catch(e){setErr(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  return <div className="noPrint" style={{marginTop:24,padding:16,borderRadius:14,border:"1px solid #d0d5dd"}}>
    <h3 style={{marginTop:0}}>Accept this estimate</h3>
    <p style={{fontSize:14,color:"#667085"}}>Type your name and press Accept. This does not charge anything — we will contact you to confirm the schedule and deposit.</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={{flex:"1 1 200px",padding:10,borderRadius:10,border:"1px solid #d0d5dd"}}/>
      <button className="primary" disabled={busy} onClick={accept}>{busy?"Sending…":"Accept estimate"}</button>
    </div>
    {err&&<p style={{color:"#b42318",fontSize:14}}>{err}</p>}
  </div>;
}
