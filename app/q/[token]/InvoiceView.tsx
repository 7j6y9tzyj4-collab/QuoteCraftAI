const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);

export type InvoiceData={logo?:string;company:string;contact:string;client:string;project:string;date:string;
  labor:{description:string;amount:number;/** розбивка change order, що стоїть за цим рядком */details?:{description:string;amount:number}[]}[];
  /** change orders, надіслані клієнту, але ще не погоджені — в суму не входять */pending?:{no:number;title:string;total:number;lines:{description:string;amount:number}[]}[];receipts:{date:string;store:string;items:string;amount:number;photo?:string}[];
  payments:{date:string;amount:number;method:string}[];totals:{labor:number;materials:number;total:number;paid:number;balance:number;fixed?:boolean;included?:boolean;matPlan?:number;matOver?:number};zelle:string;notes:string};

// Рахунок для клієнта: робота + матеріали за чеками − оплати = залишок. Цифри завжди свіжі з Оплат.
/** рядок без ціни: «no charge» → Included, інакше «—» (ціна буде пізніше) */
const amt=(x:{description:string;amount:number})=>x.amount?money(x.amount):/no charge/i.test(x.description)?"Included":"—";
export default function InvoiceView({d}:{d:InvoiceData}){
  const t=d.totals;
  return <>
    <div className="sharedHead"><div>
      {d.logo&&<img src={d.logo} alt="" style={{height:52,maxWidth:200,objectFit:"contain",display:"block",marginBottom:8}}/>}<span className="sharedEyebrow">{d.company}</span>
      <h1>Invoice — {d.project||"Project"}</h1>
      {d.client&&<p>Client: <strong>{d.client}</strong></p>}
      <p>Updated: {d.date}</p>
      {d.contact&&<p>{d.contact}</p>}
    </div></div>
    <h3>Work</h3>
    <table className="sharedTable"><tbody>{d.labor.map((l,i)=><tr key={i}><td>{l.details?.length
        ?<details><summary style={{cursor:"pointer"}}>{l.description} <span style={{color:"#175cd3",fontSize:13,whiteSpace:"nowrap"}}>· View breakdown</span></summary>
          <table style={{width:"100%",marginTop:6,fontSize:13,color:"#475467",borderCollapse:"collapse"}}><tbody>{l.details.map((x,j)=><tr key={j}><td style={{padding:"4px 8px 4px 0",borderTop:"1px solid #eaecf0"}}>{x.description}</td><td style={{padding:"4px 0",borderTop:"1px solid #eaecf0",textAlign:"right",whiteSpace:"nowrap"}}>{amt(x)}</td></tr>)}</tbody></table>
        </details>
        :l.description}</td><td style={{textAlign:"right",verticalAlign:"top"}}>{l.amount?<>{l.amount<0?"−":""}{money(Math.abs(l.amount))}</>:amt(l)}</td></tr>)}</tbody></table>
    {d.receipts.length>0&&!t.included&&(!t.fixed||(t.matOver||0)>0)&&<details style={{marginTop:20,border:"1px solid #d0d5dd",borderRadius:14,padding:"12px 14px"}}>
      <summary style={{cursor:"pointer",fontWeight:700}}><span style={{display:"inline-flex",width:"calc(100% - 20px)",justifyContent:"space-between",gap:8}}><span>{t.fixed?"Materials — store receipts (over the estimate)":"Materials (store receipts)"} · {d.receipts.length} <span style={{color:"#175cd3",fontWeight:600,fontSize:14}}>View all</span></span><span>{money(d.receipts.reduce((a,r)=>a+r.amount,0))}</span></span></summary>
      <table className="sharedTable" style={{marginTop:10}}><tbody>{d.receipts.map((r,i)=><tr key={i}><td><strong>{r.store||"Receipt"}</strong> · {r.date}{r.items&&<div className="sharedNote">{r.items}</div>}{r.photo&&<a href={r.photo} target="_blank" rel="noreferrer" style={{fontSize:13}}>View receipt</a>}</td><td style={{textAlign:"right"}}>{money(r.amount)}</td></tr>)}</tbody></table></details>}
    {(d.pending||[]).length>0&&<><h3 style={{marginTop:20}}>Change orders awaiting your approval</h3>
      <p style={{fontSize:13,color:"#667085",margin:"0 0 8px"}}>Not included in the total below until approved.</p>
      {d.pending!.map((c,i)=><details key={i} style={{border:"1px dashed #d0d5dd",borderRadius:14,padding:"10px 14px",marginBottom:8}}>
        <summary style={{cursor:"pointer"}}><span style={{display:"inline-flex",width:"calc(100% - 20px)",justifyContent:"space-between",gap:8}}><span>Change order #{c.no}{c.title?` — ${c.title}`:""} <span style={{color:"#175cd3",fontSize:13}}>View</span></span><b>{money(c.total)}</b></span></summary>
        <table style={{width:"100%",marginTop:6,fontSize:13,color:"#475467",borderCollapse:"collapse"}}><tbody>{c.lines.map((x,j)=><tr key={j}><td style={{padding:"4px 8px 4px 0",borderTop:"1px solid #eaecf0"}}>{x.description}</td><td style={{padding:"4px 0",borderTop:"1px solid #eaecf0",textAlign:"right",whiteSpace:"nowrap"}}>{amt(x)}</td></tr>)}</tbody></table>
      </details>)}</>}
    {d.payments.length>0&&<><h3 style={{marginTop:20}}>Payments received</h3>
      <table className="sharedTable"><tbody>{d.payments.map((p,i)=><tr key={i}><td>{p.date} · {p.method}</td><td style={{textAlign:"right"}}>−{money(p.amount)}</td></tr>)}</tbody></table></>}
    <div className="sharedTotals" style={{marginTop:16}}>
      <div><span>Work</span><span>{money(t.labor)}</span></div>
      {t.fixed?<><div><span>Materials (per estimate)</span><span>{money(t.matPlan||0)}</span></div>{(t.matOver||0)>0&&<div><span>Additional materials (over estimate)</span><span>{money(t.matOver||0)}</span></div>}</>
        :t.included?<div><span>Materials</span><span>Included</span></div>
        :<div><span>Materials</span><span>{money(t.materials)}</span></div>}
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
