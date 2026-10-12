// Change order (доплата): додаткова робота після прийнятого естімейту.
// Клієнт погоджує за посиланням /q/<token> (та сама таблиця shared_quotes) → сума йде в «Роботу» розрахунку.
export type ChangeLine={id:string;description:string;amount:number};
export type ChangeOrder={
  id:string;no:number;title:string;lines:ChangeLine[];notes?:string;
  token?:string;
  status:"draft"|"sent"|"viewed"|"accepted";
  acceptedName?:string;acceptedAt?:string;
  /** «погоджено усно» — без посилання */ manual?:boolean;
  /** id рядка в «Роботі», куди додано суму */ laborLineId?:string;
  createdAt:string;
};
export type ChangeSnapshot={
  v:1;kind:"change";company:string;contact:string;
  client:string;project:string;date:string;no:number;title:string;
  lines:{description:string;amount:number}[];total:number;notes:string;
};
const r2=(n:number)=>Math.round((Number(n)||0)*100)/100;
export const changeTotal=(c:ChangeOrder)=>r2(c.lines.reduce((a,l)=>a+(Number(l.amount)||0),0));
export const newChangeOrder=(no:number):ChangeOrder=>({id:crypto.randomUUID(),no,title:"",lines:[{id:crypto.randomUUID(),description:"",amount:0}],notes:"",status:"draft",createdAt:new Date().toISOString()});
export const DEFAULT_CHANGE_NOTES="This change order adds work to the original agreement. All other terms of the original estimate stay the same. The amount will be added to the final payment.";
