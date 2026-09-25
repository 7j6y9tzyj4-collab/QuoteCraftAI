// Розрахунок з клієнтом: робота + матеріали за чеками − оплати = залишок.
export type StatementLine={id:string;description:string;amount:number};
export type Receipt={id:string;date:string;store:string;items:string;amount:number;
  /** шлях у Supabase Storage (bucket receipts) */ photoPath?:string;
  /** запасний варіант без акаунта: маленька копія фото */ photoData?:string};
export type Payment={id:string;date:string;amount:number;method:string};
export type Statement={
  id:string;
  client:string;
  project:string;
  labor:StatementLine[];
  receipts:Receipt[];
  payments:Payment[];
  notes:string;
  updatedAt:string;
};

export const DEFAULT_STATEMENT_NOTES="Copies of all store receipts are available on request. Payment can be made in cash, by check, or via Zelle. Thank you!";

export const newStatement=():Statement=>({
  id:crypto.randomUUID(),client:"",project:"",
  labor:[{id:crypto.randomUUID(),description:"Agreed work (per estimate)",amount:0}],
  receipts:[],payments:[],notes:DEFAULT_STATEMENT_NOTES,updatedAt:new Date().toISOString(),
});

const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
export function statementTotals(s:Statement){
  const labor=r2(s.labor.reduce((a,l)=>a+(Number(l.amount)||0),0));
  const materials=r2(s.receipts.reduce((a,r)=>a+(Number(r.amount)||0),0));
  const total=r2(labor+materials);
  const paid=r2(s.payments.reduce((a,p)=>a+(Number(p.amount)||0),0));
  return {labor,materials,total,paid,balance:r2(total-paid)};
}
