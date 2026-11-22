"use client";
import {useState} from "react";
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);

// 💳 Оплата онлайн (Stripe): картка або з банку. Якщо просимо частину зараз — дві кнопки.
export default function PayButton({token,now,full}:{token:string;now:number;full:number}){
  const [busy,setBusy]=useState(false);const [err,setErr]=useState("");
  async function go(isFull:boolean){
    setBusy(true);setErr("");
    try{const r=await fetch("/api/pay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,full:isFull})});
      const j=await r.json();if(!r.ok||!j.url)throw new Error(j.error||"Payment is not available right now");
      window.location.href=j.url;
    }catch(e){setErr(e instanceof Error?e.message:String(e));setBusy(false)}
  }
  const btn={display:"block",width:"100%",padding:"14px 16px",borderRadius:12,fontSize:16,fontWeight:700,cursor:"pointer",border:"none"} as const;
  return <div style={{marginTop:16,padding:16,borderRadius:14,border:"1px solid #d0d5dd"}}>
    <button disabled={busy} onClick={()=>go(false)} style={{...btn,background:"#175cd3",color:"#fff"}}>{busy?"Opening secure payment…":`Pay ${money(now)} online`}</button>
    {full>now+0.005&&<button disabled={busy} onClick={()=>go(true)} style={{...btn,marginTop:8,background:"#fff",color:"#175cd3",border:"1px solid #175cd3"}}>Pay the full balance {money(full)}</button>}
    <p style={{margin:"8px 0 0",fontSize:13,color:"#667085"}}>Card or bank account (ACH). Secure checkout by Stripe.</p>
    {err&&<p style={{margin:"8px 0 0",fontSize:13,color:"#b42318"}}>{err}</p>}
  </div>;
}
