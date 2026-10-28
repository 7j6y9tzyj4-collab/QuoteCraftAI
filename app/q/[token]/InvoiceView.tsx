const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);

export type InvoiceData={company:string;contact:string;client:string;project:string;date:string;
  labor:{description:string;amount:number}[];receipts:{date:string;store:string;items:string;amount:number;photo?:string}[];
  payments:{date:string;amount:number;method:string}[];totals:{labor:number;materials:number;total:number;paid:number;balance:number};zelle:string;notes:string};

// Рахунок для клієнта: робота + матеріали за чеками − оплати = залишок. Цифри завжди свіжі з Оплат.
export default function InvoiceView({d}:{d:InvoiceData}){
  const t=d.totals;
  return <>
    <div className="sharedHead"><div>
      <span className="sharedEyebrow">{d.company}</span>
      <h1>Invoice — {d.project||"Project"}</h1>
      {d.client&&<p>Client: <strong>{d.client}</strong></p>}
      <p>Updated: {d.date}</p>
      {d.contact&&<p>{d.contact}</p>}
    </div></div>
    <h3>Work</h3>
    <table className="sharedTable"><tbody>{d.labor.map((l,i)=><tr key={i}><td>{l.description}</td><td style={{textAlign:"right"}}>{l.amount<0?"−":""}{money(Math.abs(l.amount))}</td></tr>)}</tbody></table>
    {d.receipts.length>0&&<><h3 style={{marginTop:20}}>Materials (store receipts)</h3>
      <table className="sharedTable"><tbody>{d.receipts.map((r,i)=><tr key={i}><td><strong>{r.store||"Receipt"}</strong> · {r.date}{r.items&&<div className="sharedNote">{r.items}</div>}{r.photo&&<a href={r.photo} target="_blank" rel="noreferrer" style={{fontSize:13}}>View receipt</a>}</td><td style={{textAlign:"right"}}>{money(r.amount)}</td></tr>)}</tbody></table></>}
    {d.payments.length>0&&<><h3 style={{marginTop:20}}>Payments received</h3>
      <table className="sharedTable"><tbody>{d.payments.map((p,i)=><tr key={i}><td>{p.date} · {p.method}</td><td style={{textAlign:"right"}}>−{money(p.amount)}</td></tr>)}</tbody></table></>}
    <div className="sharedTotals" style={{marginTop:16}}>
      <div><span>Work</span><span>{money(t.labor)}</span></div>
      <div><span>Materials</span><span>{money(t.materials)}</span></div>
      <div><span>Total</span><span>{money(t.total)}</span></div>
      <div><span>Paid</span><span>−{money(t.paid)}</span></div>
      <div className="grand"><span>{t.balance>=0?"Balance due":"Credit"}</span><span>{money(Math.abs(t.balance))}</span></div>
    </div>
    {t.balance>0.005&&d.zelle&&<div style={{marginTop:16,padding:16,borderRadius:14,border:"1px solid #d0d5dd"}}>
      <p style={{margin:0,fontSize:15}}>Please send <b>{money(t.balance)}</b> via <b>Zelle</b> to <b style={{userSelect:"all"}}>{d.zelle}</b>.</p>
      <p style={{margin:"6px 0 0",fontSize:13,color:"#667085"}}>Check or cash is also accepted. Thank you!</p></div>}
    {t.balance<=0.005&&<div style={{marginTop:16,padding:16,borderRadius:14,background:"#ecfdf3",color:"#067647"}}>✓ Paid in full. Thank you!</div>}
    {d.notes&&<p style={{whiteSpace:"pre-wrap",fontSize:13,color:"#667085",marginTop:16}}>{d.notes}</p>}
  </>;
}
