export type Unit="each"|"sqft"|"hour"|"linear_ft"|"room";
export type Item={
  id:string;
  serviceId:string;
  description:string;
  quantity:number;
  unit:Unit;
  unitPrice:number;
  note?:string;
  confidence?:number;
};
export type Estimate={
  id:string;
  client:string;
  project:string;
  address:string;
  items:Item[];
  discount:number;
  tax:number;
  deposit:number;
  createdAt:string;
};
export type PriceRule={
  id:string;
  name:string;
  aliases:string[];
  unit:Unit;
  rate:number;
};
