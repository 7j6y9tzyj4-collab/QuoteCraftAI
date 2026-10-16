// Клієнти: один запис — ім'я, телефон, адреса; історія збирається з естімейтів і Оплат за ім'ям.
import type {SavedCalc} from "./calcTypes";
import type {Statement} from "./statement";
import {statementTotals} from "./statement";

export type Client={id:string;name:string;phone?:string;email?:string;address?:string;notes?:string;createdAt:string;updatedAt:string};
export const normName=(s:string)=>String(s||"").trim().toLowerCase().replace(/\s+/g," ");
export const newClient=(name="",extra:Partial<Client>={}):Client=>({id:crypto.randomUUID(),name:name.trim(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...extra});
export const findClient=(clients:Client[],name:string)=>{const n=normName(name);return n?clients.find(c=>normName(c.name)===n)||null:null};

// телефон у вигляді для посилань tel:/sms:
export const telHref=(p?:string)=>{const d=String(p||"").replace(/[^\d+]/g,"");return d?`tel:${d}`:""};
export const smsHref=(p?:string,body?:string)=>{const d=String(p||"").replace(/[^\d+]/g,"");return d?`sms:${d}${body?`&body=${encodeURIComponent(body)}`:""}`:""};
export const mapHref=(a?:string)=>a?.trim()?`https://maps.apple.com/?q=${encodeURIComponent(a.trim())}`:"";

// імена, які є в естімейтах / Оплатах, але ще не в списку клієнтів
export function missingClientNames(clients:Client[],calcs:SavedCalc[],statements:Statement[]):string[]{
  const have=new Set(clients.map(c=>normName(c.name)));
  const out=new Map<string,string>();
  for(const x of [...calcs.map(c=>c.client),...statements.filter(s=>!s.own).map(s=>s.client)]){
    const n=normName(x);if(n&&!have.has(n)&&!out.has(n))out.set(n,String(x).trim());
  }
  return [...out.values()];
}

export function clientHistory(c:Client,calcs:SavedCalc[],statements:Statement[]){
  const n=normName(c.name);
  const ests=calcs.filter(x=>normName(x.client)===n).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  const sts=statements.filter(s=>!s.own&&normName(s.client)===n).sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  const r2=(v:number)=>Math.round(v*100)/100;
  let paid=0,balance=0,materials=0,labor=0;
  for(const s of sts){const t=statementTotals(s);paid+=t.paid;balance+=t.balance;materials+=t.materials;labor+=t.labor}
  return {ests,sts,paid:r2(paid),balance:r2(balance),materials:r2(materials),labor:r2(labor),earned:r2(paid-materials),quoted:r2(ests.reduce((a,e)=>a+(Number(e.total)||0),0))};
}
