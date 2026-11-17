"use client";
import {zipSync,strToU8} from "fflate";
import {supabase} from "./supabase";
import {normDate} from "./receiptBatch";
import {buildReceiptsPdf,type ReceiptPhoto} from "./statementPdf";
import {blobToDataUrl,imageSize} from "./receiptImage";
import {recAmt,type Statement,type Receipt} from "./statement";
import {buildXlsx,cellRef,type XCell,type XSheet} from "./xlsx";

// 📦 Чеки за місяць: ZIP з фото по папках проєктів + таблиця (CSV для Excel/Numbers) + один PDF усіх чеків.
const money=(n:number)=>"$"+(Number(n)||0).toFixed(2);
const safe=(s:string)=>String(s||"").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim().slice(0,80);
const csvCell=(v:unknown)=>{const s=String(v??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
export const monthLabel=(ym:string)=>new Date(ym+"-15T12:00:00").toLocaleDateString("uk-UA",{month:"long",year:"numeric"});

export function receiptsInMonth(list:Statement[],ym:string){
  const rows:{s:Statement;r:Receipt;d:string}[]=[];
  for(const s of list)for(const r of s.receipts||[]){const d=normDate(r.date);if(d.startsWith(ym))rows.push({s,r,d})}
  return rows.sort((a,b)=>a.d.localeCompare(b.d));
}

export async function buildMonthZip(list:Statement[],ym:string,onProgress?:(t:string)=>void):Promise<{blob:Blob;name:string;count:number;total:number}>{
  const rows=receiptsInMonth(list,ym);
  const files:Record<string,Uint8Array>={};
  const photos:ReceiptPhoto[]=[];
  const used=new Set<string>();
  const proj=(s:Statement)=>safe(s.own?"Мої витрати":[s.client,s.project].filter(Boolean).join(" - "))||"Без назви";
  let i=0;
  for(const {s,r,d} of rows){
    onProgress?.(`Завантажую фото ${++i} / ${rows.length}…`);
    let blob:Blob|null=null;
    try{
      if(r.photoPath){const {data}=await supabase.storage.from("receipts").download(r.photoPath);blob=data||null}
      else if(r.photoData){blob=await (await fetch(r.photoData)).blob()}
    }catch{blob=null}
    if(!blob)continue;
    let name=`${proj(s)}/${d} ${safe(r.store||"Receipt")} ${money(r.amount)}`;let k=2;while(used.has(name))name=`${name.replace(/ \(\d+\)$/,"")} (${k++})`;used.add(name);
    files[`${name}.jpg`]=new Uint8Array(await blob.arrayBuffer());
    try{const dataUrl=await blobToDataUrl(blob);const {w,h}=await imageSize(dataUrl);photos.push({label:`${r.date} · ${r.store||"Receipt"} · ${money(r.amount)} — ${proj(s)}`,dataUrl,w,h})}catch{/* без фото в PDF */}
  }
  const src=(r:Receipt)=>r.src==="mail"?"пошта":r.by?`помічник (${r.by})`:r.photoPath||r.photoData?"фото":"вручну";
  const lines=[["Дата","Магазин","Що куплено","Сума","Проєкт","Категорія","Номер чека","Звідки","Фото"].join(",")];
  for(const {s,r,d} of rows)lines.push([d,r.store,r.items,(Number(r.amount)||0).toFixed(2),proj(s),s.own?(r.category||""):"клієнт",r.receiptNo||"",src(r),r.photoPath||r.photoData?"так":"ні"].map(csvCell).join(","));
  const total=Math.round(rows.reduce((a,x)=>a+recAmt(x.r),0)*100)/100;
  // підсумок по проєктах
  lines.push("","Проєкт,Чеків,Сума");
  const by=new Map<string,{n:number;sum:number}>();for(const {s,r} of rows){const k=proj(s);const v=by.get(k)||{n:0,sum:0};v.n++;v.sum+=recAmt(r);by.set(k,v)}
  for(const [k,v] of by)lines.push([k,v.n,v.sum.toFixed(2)].map(csvCell).join(","));
  lines.push(["Разом",rows.length,total.toFixed(2)].map(csvCell).join(","));
  const label=monthLabel(ym);
  files[`Чеки ${label}.csv`]=strToU8("﻿"+lines.join("\n"));
  files[`Місяць ${label} - QuoteCraft.xlsx`]=buildMonthXlsx(list,ym);
  onProgress?.("Роблю PDF…");
  const fake:Statement={id:"month",client:`Чеки за ${label}`,project:"",labor:[],receipts:rows.map(x=>x.r),payments:[],notes:"",updatedAt:new Date().toISOString()};
  try{files[`Чеки ${label}.pdf`]=new Uint8Array(await (await buildReceiptsPdf(fake,photos)).arrayBuffer())}catch{/* без PDF */}
  const zip=zipSync(files,{level:0});
  return {blob:new Blob([zip as BlobPart],{type:"application/zip"}),name:`Чеки ${label} - QuoteCraft.zip`,count:rows.length,total};
}

// 📊 Таблиця місяця (.xlsx): Підсумок · Чеки · Оплати · Помічники — для звірки з банком.
const kindLabel=(r:Receipt)=>r.kind==="return"?"повернення":r.kind==="deposit"?(r.back?`депозит (повернули ${r.back})`:"депозит (чекає)"):"покупка";
const payerLabel=(r:Receipt)=>r.paidBy==="biz"?"бізнес-картка":r.paidBy==="other"?"готівка/інше":r.paidBy?`${r.paidBy} (повернути)`:"";
const isMeName=(n:string,self?:boolean)=>!!self||/^(я|me|vasyl|василь)$/i.test(String(n||"").trim());
export function monthXlsxName(ym:string){return `Місяць ${monthLabel(ym)} - QuoteCraft.xlsx`}
export function buildMonthXlsx(list:Statement[],ym:string):Uint8Array{
  const name=(s:Statement)=>s.own?"Мої витрати":[s.client||"Без імені",s.project].filter(Boolean).join(" — ");
  const inM=(d:string)=>normDate(d).startsWith(ym);
  // Чеки
  const rec:XCell[][]=[["Дата","Магазин","Що куплено","Сума","Проєкт","Тип","Хто платив","Картка","Номер чека","Звідки"]];
  for(const {s,r,d} of receiptsInMonth(list,ym))rec.push([d,r.store,r.items,Number(r.amount)||0,name(s),s.own?(r.category||"мої витрати"):kindLabel(r),payerLabel(r),r.card?`****${r.card}`:"",r.receiptNo||"",r.src==="mail"?"пошта":r.by?`помічник (${r.by})`:r.photoPath||r.photoData?"фото":"вручну"]);
  const recN=rec.length;
  rec.push([],["Разом (без депозитів)","","",{f:`SUMIFS(D2:D${recN},F2:F${recN},"<>депозит*")`,bold:true}]);
  // Оплати
  const pay:XCell[][]=[["Дата","Клієнт","Проєкт","Спосіб","Сума"]];
  for(const s of list)if(!s.own)for(const p of s.payments||[])if(inM(p.date))pay.push([normDate(p.date),s.client,s.project,p.method||"",Number(p.amount)||0]);
  const payH=pay.slice(1).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));pay.length=1;pay.push(...payH);
  const payN=pay.length;pay.push([],["Разом","","","",{f:`SUM(E2:E${payN})`,bold:true}]);
  // Помічники: години і виплати
  const crew:XCell[][]=[["Дата","Хто","Проєкт","Години","Ставка","Нараховано","Примітка"]];
  const outs:XCell[][]=[["Дата","Хто","Проєкт","Виплачено","Як"]];
  for(const s of list){
    const cr=s.crew||[];
    for(const w of s.workLog||[])if(inM(w.date)){const c=cr.find(x=>x.id===w.workerId);if(!c||isMeName(c.name,c.self))continue;const h=Number(w.hours)||0,rt=Number(c.rate)||0;crew.push([normDate(w.date),c.name,name(s),h,rt,Math.round(h*rt*100)/100,w.note||""])}
    for(const p of s.payouts||[])if(inM(p.date)){const c=cr.find(x=>x.id===p.workerId);if(c&&isMeName(c.name,c.self))continue;outs.push([normDate(p.date),c?.name||"?",name(s),Number(p.amount)||0,p.method||""])}
  }
  const cH=crew.slice(1).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));crew.length=1;crew.push(...cH);
  const crewN=crew.length;crew.push(["Разом","","",{f:`SUM(D2:D${crewN})`,bold:true},"",{f:`SUM(F2:F${crewN})`,bold:true}]);
  const oH=outs.slice(1).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));outs.length=1;outs.push(...oH);
  const outStart=crew.length+2;
  const crewSheet:XCell[][]=[...crew,[],...outs.map(r=>r)];
  const outEnd=crewSheet.length;
  crewSheet.push(["Разом виплачено","","",{f:`SUM(D${outStart+1}:D${outEnd})`,bold:true}]);
  // Підсумок по проєктах
  const sum:XCell[][]=[[`Місяць: ${monthLabel(ym)}`],[],["Проєкт","Отримано","Чеки","Помічникам виплачено","Різниця"]];
  const r2=(n:number)=>Math.round(n*100)/100;
  let own=0;
  for(const s of list){
    const g=r2((s.payments||[]).filter(p=>inM(p.date)).reduce((a,p)=>a+(Number(p.amount)||0),0));
    const m=r2((s.receipts||[]).filter(r=>inM(r.date)).reduce((a,r)=>a+recAmt(r),0));
    if(s.own){own=r2(own+m);continue}
    const me=new Set((s.crew||[]).filter(c=>isMeName(c.name,c.self)).map(c=>c.id));
    const o=r2((s.payouts||[]).filter(p=>inM(p.date)&&!me.has(p.workerId)).reduce((a,p)=>a+(Number(p.amount)||0),0));
    if(!g&&!m&&!o)continue;
    const i=sum.length;sum.push([name(s),g,m,o,{f:`${cellRef(i,1)}-${cellRef(i,2)}-${cellRef(i,3)}`}]);
  }
  const a=4,b=sum.length;
  sum.push(["Разом по проєктах",{f:`SUM(B${a}:B${b})`,bold:true},{f:`SUM(C${a}:C${b})`,bold:true},{f:`SUM(D${a}:D${b})`,bold:true},{f:`SUM(E${a}:E${b})`,bold:true}]);
  const tot=sum.length;
  sum.push([],["Мої витрати (інструменти тощо)","","","",own?-own:0],["На руках за місяць","","","",{f:`E${tot}+E${tot+2}`,bold:true}]);
  const pend=list.flatMap(s=>(s.receipts||[]).filter(r=>r.kind==="deposit"&&!r.back).map(r=>({s,r})));
  if(pend.length){sum.push([],["Депозити, що мають повернутись"]);for(const {s,r} of pend)sum.push([`${normDate(r.date)} ${r.store} — ${name(s)}`,"","","",Number(r.amount)||0])}
  const sheets:XSheet[]=[
    {name:"Підсумок",rows:sum,widths:[44,14,14,22,14],bold:[0,2]},
    {name:"Чеки",rows:rec,widths:[12,18,40,12,32,18,20,10,16,14],freeze:1,bold:[0]},
    {name:"Оплати",rows:pay,widths:[12,24,30,12,12],freeze:1,bold:[0]},
    {name:"Помічники",rows:crewSheet,widths:[12,16,32,10,10,12,30],freeze:1,bold:[0,crew.length+1]},
  ];
  return buildXlsx(sheets);
}
