"use client";
import {useState} from "react";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);

// Після «Accept» — оплатити завдаток карткою (Stripe Checkout). Показується, лише якщо підключено Stripe.
export default function PayDeposit({token,amount,paid}:{token:string;amount:number;paid?:{amount:number;at:string}|null}){
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  if(paid)return <div className="noPrint" style={{marginTop:12,padding:14,borderRadius:14,background:"#ecfdf3",color:"#067647"}}>
    ✓ Deposit of {money(paid.amount)} received{paid.at?` on ${new Date(paid.at).toLocaleDateString("en-US")}`:""}. Thank you!
  </div>;
  if(!(amount>0))return null;
  async function pay(){
    setBusy(true);setErr("");
    try{
      const r=await fetch("/api/quote-pay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
      const d=await r.json();
      if(!r.ok||!d.url)throw new Error(d?.error||"Payment is not available right now.");
      window.location.href=d.url;
    }catch(e){setErr(e instanceof Error?e.message:String(e));setBusy(false)}
  }
  return <div className="noPrint" style={{marginTop:12,padding:16,borderRadius:14,border:"1px solid #d0d5dd"}}>
    <h3 style={{marginTop:0}}>Pay deposit — {money(amount)}</h3>
    <p style={{fontSize:14,color:"#667085",margin:"0 0 10px"}}>Secure card payment via Stripe. You can also pay by check or Zelle — just let us know.</p>
    <button className="primary" disabled={busy} onClick={pay}>{busy?"Opening payment…":`💳 Pay ${money(amount)} deposit`}</button>
    {err&&<p style={{color:"#b42318",fontSize:14}}>{err}</p>}
  </div>;
}
