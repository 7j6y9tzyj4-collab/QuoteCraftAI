const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);

// Після «Accept»: як оплатити завдаток (Zelle).
export default function ZelleBox({zelle,amount}:{zelle:string;amount:number}){
  if(!zelle||!(amount>0))return null;
  return <div className="noPrint" style={{marginTop:12,padding:16,borderRadius:14,border:"1px solid #d0d5dd"}}>
    <h3 style={{marginTop:0}}>Deposit — {money(amount)}</h3>
    <p style={{fontSize:15,margin:0}}>Please send the deposit via <b>Zelle</b> to <b style={{userSelect:"all"}}>{zelle}</b>.</p>
    <p style={{fontSize:13,color:"#667085",margin:"6px 0 0"}}>Add your name and address in the memo. Check is also accepted.</p>
  </div>;
}
