// Імпорт експорту покупок з магазину (Home Depot Purchase History, Lowe's, Menards — CSV або Excel).
// Рядки-товари групуються в чеки (за номером транзакції / замовлення), шукаються дублікати й проєкт за Job Name / PO.
import {unzipSync,strFromU8} from "fflate";
import {normDate,findDuplicate,findManualMatch,matchStatementByName} from "./receiptBatch";
import type {Receipt,Statement} from "./statement";

export type ImportRow={key:string;date:string;store:string;job:string;receiptNo:string;items:string;subtotal:number;tax:number|null;card:string;lines:number};

// ---------- читання файлу в таблицю ----------
function parseCsv(text:string):string[][]{
  const out:string[][]=[];let row:string[]=[];let cell="";let q=false;
  const delim=(()=>{const first=text.split(/\r?\n/,1)[0]||"";const c=(first.match(/,/g)||[]).length,t=(first.match(/\t/g)||[]).length,s=(first.match(/;/g)||[]).length;return t>c&&t>=s?"\t":s>c?";":","})();
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch;continue}
    if(ch==='"'){q=true;continue}
    if(ch===delim){row.push(cell);cell="";continue}
    if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(cell);out.push(row);row=[];cell="";continue}
    cell+=ch;
  }
  if(cell||row.length){row.push(cell);out.push(row)}
  return out.filter(r=>r.some(c=>c.trim()));
}
function parseXlsx(buf:Uint8Array):string[][]{
  const z=unzipSync(buf);
  const ss:string[]=[];
  const sx=z["xl/sharedStrings.xml"];
  if(sx){const x=strFromU8(sx);for(const m of x.matchAll(/<si>([\s\S]*?)<\/si>/g))ss.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join(""))}
  const name=Object.keys(z).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if(!name)return [];
  const x=strFromU8(z[name]);
  const dec=(s:string)=>s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
  const colIdx=(ref:string)=>{const l=ref.replace(/\d+/g,"");let n=0;for(const ch of l)n=n*26+ch.charCodeAt(0)-64;return n-1};
  const rows:string[][]=[];
  for(const rm of x.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){
    const r:string[]=[];
    for(const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const attrs=cm[1];const ref=(attrs.match(/r="([A-Z]+\d+)"/)||[])[1];const t=(attrs.match(/t="(\w+)"/)||[])[1];
      const body=cm[2]||"";const v=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1];
      let val=t==="s"?ss[Number(v)]??"":t==="inlineStr"?[...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join(""):v??"";
      val=dec(val);
      const i=ref?colIdx(ref):r.length;while(r.length<i)r.push("");r[i]=val;
    }
    if(r.some(c=>String(c).trim()))rows.push(r);
  }
  return rows;
}
export async function readTable(file:File):Promise<string[][]>{
  const buf=new Uint8Array(await file.arrayBuffer());
  if(buf[0]===0x50&&buf[1]===0x4b)return parseXlsx(buf);
  return parseCsv(new TextDecoder("utf-8").decode(buf).replace(/^﻿/,""));
}

// ---------- розпізнавання колонок ----------
const num=(s:string)=>{const t=String(s||"").trim();if(!t)return NaN;const neg=/^\(.*\)$/.test(t)||/^-|-\s*\$/.test(t);const n=Number(t.replace(/[^0-9.]/g,""));return isNaN(n)?NaN:neg?-n:n};
const excelDate=(v:string)=>{const n=Number(v);if(!isFinite(n)||n<30000||n>80000)return "";const d=new Date(Math.round((n-25569)*864e5));return d.toISOString().slice(0,10)};
const toUs=(iso:string)=>iso?`${iso.slice(5,7)}/${iso.slice(8,10)}/${iso.slice(0,4)}`:"";

type Cols={date:number;txn:number;store:number;job:number;desc:number;qty:number;amount:number;unit:number;tax:number;total:number;card:number};
function findCols(h:string[]):Cols{
  const H=h.map(x=>String(x||"").toLowerCase().replace(/\s+/g," ").trim());
  const f=(...re:RegExp[])=>{for(const r of re){const i=H.findIndex(x=>r.test(x));if(i>=0)return i}return -1};
  return {
    date:f(/^(transaction |purchase |order |sales )?date/,/date/),
    txn:f(/transaction (id|#|number)/,/receipt (id|#|number)/,/order (number|#|id)/,/invoice (number|#)/,/^transaction$/,/^order$/),
    store:f(/store (name|location)/,/^store$/,/store number|store #/,/^location$/),
    job:f(/job ?name/,/^job/,/po ?(\/ ?job)? ?name/,/^po\b|purchase order|po number|po #/),
    desc:f(/(item|sku|product) description/,/^description/,/description/,/item name|product name/,/^item$/),
    qty:f(/^qty|quantity/),
    amount:f(/pre-?tax (amount|total)/,/extended net|net extended/,/net amount|line total|merchandise total/,/extended price|ext\.? (price|amount)/,/^amount$|^net$|^subtotal$/,/extended retail/),
    unit:f(/net unit price/,/unit price|^price$/),
    tax:f(/^(sales )?tax( amount)?$/,/(^|[^-])\btax\b(?!.*pre)/),
    total:f(/order total|transaction total|receipt total|grand total|^total$/),
    card:f(/card (number|#|last)|last ?4|payment (method|type)|tender/),
  };
}

export type ParseResult={rows:ImportRow[];headers:string[];problem?:string;hasTax:boolean;hasTotal:boolean};
export function parseStoreExport(table:string[][],storeName:string):ParseResult{
  // заголовок — перший рядок, де є «date» і щось схоже на суму/опис
  let hi=table.findIndex(r=>r.some(c=>/date/i.test(c))&&r.some(c=>/total|amount|price|description|extended/i.test(c)));
  if(hi<0)return {rows:[],headers:table[0]||[],problem:"Не знайшов рядок із заголовками (Date, Amount / Total…).",hasTax:false,hasTotal:false};
  const headers=table[hi];const c=findCols(headers);
  if(c.date<0||(c.amount<0&&c.total<0&&c.unit<0))return {rows:[],headers,problem:"Не знайшов колонку з датою або сумою.",hasTax:false,hasTotal:false};
  const groups=new Map<string,ImportRow>();
  const at=(r:string[],i:number)=>i>=0?String(r[i]??"").trim():"";
  for(const r of table.slice(hi+1)){
    const rawD=at(r,c.date);const iso=normDate(rawD)||excelDate(rawD);if(!iso)continue; // рядки «Total», порожні
    let amt=NaN;
    if(c.amount>=0)amt=num(at(r,c.amount));
    if(isNaN(amt)&&c.unit>=0){const u=num(at(r,c.unit));const q=c.qty>=0?num(at(r,c.qty)):1;if(!isNaN(u))amt=u*(isNaN(q)?1:q)}
    const tot=c.total>=0?num(at(r,c.total)):NaN;
    const tax=c.tax>=0?num(at(r,c.tax)):NaN;
    if(isNaN(amt)&&isNaN(tot))continue;
    const store=at(r,c.store);const txn=at(r,c.txn);
    const key=txn?`${txn}|${iso}`:`${iso}|${store}|${at(r,c.job)}`;
    const g=groups.get(key)||{key,date:toUs(iso),store:storeName+(store&&!/^\d+$/.test(store)?` — ${store}`:store?` #${store}`:""),job:"",receiptNo:txn,items:"",subtotal:0,tax:null,card:"",lines:0};
    if(!isNaN(amt))g.subtotal+=amt;
    if(!isNaN(tot)&&isNaN(amt))g.subtotal=tot; // лише підсумок на рядок-чек
    if(!isNaN(tax))g.tax=(g.tax||0)+tax;
    const job=at(r,c.job);if(job&&!g.job)g.job=job;
    const d=at(r,c.desc);if(d&&g.lines<8)g.items+=(g.items?"; ":"")+d.slice(0,60);
    const cd=at(r,c.card).match(/(\d{4})\s*$/);if(cd&&!g.card)g.card=cd[1];
    g.lines++;groups.set(key,g);
  }
  const rows=[...groups.values()].map(g=>({...g,subtotal:Math.round(g.subtotal*100)/100,tax:g.tax===null?null:Math.round(g.tax*100)/100}));
  rows.sort((a,b)=>normDate(a.date).localeCompare(normDate(b.date)));
  return {rows,headers,hasTax:c.tax>=0,hasTotal:c.total>=0&&c.amount<0,problem:rows.length?undefined:"У файлі не знайшов жодної покупки з датою й сумою."};
}

// сума чека: підсумок + податок (з колонки або за %)
export const importAmount=(r:ImportRow,taxPct:number)=>Math.round((r.subtotal+(r.tax!==null?r.tax:r.subtotal*(taxPct||0)/100))*100)/100;

export type Placed={row:ImportRow;amount:number;dup?:{sid:string;label:string};sid:string;why:string};
// де вже є такий чек (дублікат або вписаний вручну) і в який проєкт покласти новий
export function placeRows(rows:ImportRow[],list:Statement[],taxPct:number):Placed[]{
  return rows.map(row=>{
    const amount=importAmount(row,taxPct);
    const d={store:row.store,date:row.date,amount,receiptNo:row.receiptNo};
    for(const s of list){
      const hit=findDuplicate(d,s.receipts||[])||findManualMatch(d,s.receipts||[]);
      if(hit)return {row,amount,dup:{sid:s.id,label:s.own?"Мої витрати":`${s.client||"Без імені"}${s.project?` — ${s.project}`:""}`},sid:"",why:""};
    }
    const m=row.job?matchStatementByName(row.job,list.filter(s=>!s.own)):null;
    return {row,amount,sid:m?.id||"",why:m?`Job Name «${row.job}»`:""};
  });
}

export function toReceipt(p:Placed):Receipt{
  const r=p.row;
  return {id:crypto.randomUUID(),date:r.date,store:r.store,items:r.items||(r.job?`Job: ${r.job}`:""),amount:p.amount,receiptNo:r.receiptNo||undefined,card:r.card||undefined,
    why:p.why||"імпорт з файлу магазину",...(p.amount<0?{kind:"return" as const}:{})};
}
