"use client";
import {useState} from "react";
import type {PriceRule} from "@/lib/types";
import {categories,categoryOf,bounds,matches} from "@/lib/priceCatalog";
export default function ServicePicker({prices,onSelect}:{prices:PriceRule[];onSelect:(p:PriceRule)=>void}){
 const [query,setQuery]=useState("");const [category,setCategory]=useState("");
 return <details className="noPrint"><summary>Додати роботу з каталогу</summary><label>Пошук<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Назва українською або англійською"/></label><label>Категорія<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Усі категорії</option>{Array.from(new Set([...categories,...prices.map(categoryOf)])).map(c=><option key={c}>{c}</option>)}</select></label>{Array.from(new Set([...categories,...prices.map(categoryOf)])).filter(c=>!category||category===c).map(c=>{const rows=prices.filter(p=>categoryOf(p)===c&&matches(p,query));return rows.length>0&&<section key={c}><h4>{c}</h4>{rows.map(p=><button className="secondary full" key={p.id} onClick={()=>onSelect(p)}>＋ {p.name} · ${bounds(p).min}–${bounds(p).max} / {p.unit} · вибрано ${p.rate}</button>)}</section>})}{!prices.some(p=>(!category||categoryOf(p)===category)&&matches(p,query))&&<p>Нічого не знайдено.</p>}</details>;
}
