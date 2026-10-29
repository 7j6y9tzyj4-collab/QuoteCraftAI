"use client";
import {zipSync,strToU8} from "fflate";
import {supabase} from "./supabase";
import {normDate} from "./receiptBatch";
import {buildReceiptsPdf,type ReceiptPhoto} from "./statementPdf";
import {blobToDataUrl,imageSize} from "./receiptImage";
import type {Statement,Receipt} from "./statement";

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
  const total=Math.round(rows.reduce((a,x)=>a+(Number(x.r.amount)||0),0)*100)/100;
  // підсумок по проєктах
  lines.push("","Проєкт,Чеків,Сума");
  const by=new Map<string,{n:number;sum:number}>();for(const {s,r} of rows){const k=proj(s);const v=by.get(k)||{n:0,sum:0};v.n++;v.sum+=Number(r.amount)||0;by.set(k,v)}
  for(const [k,v] of by)lines.push([k,v.n,v.sum.toFixed(2)].map(csvCell).join(","));
  lines.push(["Разом",rows.length,total.toFixed(2)].map(csvCell).join(","));
  const label=monthLabel(ym);
  files[`Чеки ${label}.csv`]=strToU8("﻿"+lines.join("\n"));
  onProgress?.("Роблю PDF…");
  const fake:Statement={id:"month",client:`Чеки за ${label}`,project:"",labor:[],receipts:rows.map(x=>x.r),payments:[],notes:"",updatedAt:new Date().toISOString()};
  try{files[`Чеки ${label}.pdf`]=new Uint8Array(await (await buildReceiptsPdf(fake,photos)).arrayBuffer())}catch{/* без PDF */}
  const zip=zipSync(files,{level:0});
  return {blob:new Blob([zip as BlobPart],{type:"application/zip"}),name:`Чеки ${label} - QuoteCraft.zip`,count:rows.length,total};
}
