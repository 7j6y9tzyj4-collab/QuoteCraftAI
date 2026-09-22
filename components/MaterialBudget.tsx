"use client";
import {useState} from "react";
import {materialProducts} from "@/lib/materialProducts";
import type {Item} from "@/lib/types";
export default function MaterialBudget({item,onChange}:{item:Item;onChange:(p:Partial<Item>)=>void}){
 const [id,setId]=useState("");const [low,setLow]=useState(1);const [high,setHigh]=useState(1);
 const product=materialProducts.find(p=>p.id===id);
 const valid=product&&Number.isFinite(low)&&Number.isFinite(high)&&low>0&&high>=low&&item.quantity>0;
 return <details className="noPrint"><summary>Порахувати матеріал з ціни упаковки</summary><p>Вкажи загальну кількість упаковок для цієї роботи. Не додавай той самий матеріал повторно. Це замінить поточний бюджет матеріалів позиції.</p>
 <label>Матеріал<select value={id} onChange={e=>setId(e.target.value)}><option value="">Вибери конкретний товар</option>{materialProducts.map(p=><option key={p.id} value={p.id}>{p.name} · ${p.price} / {p.pack}</option>)}</select></label>
 {product&&<><p><a href={product.url} target="_blank" rel="noreferrer">Джерело · {product.checked}</a> — {product.note}</p><div className="grid"><label>Упаковок від<input type="number" min="1" step="1" value={low} onChange={e=>setLow(Number(e.target.value))}/></label><label>Упаковок до<input type="number" min="1" step="1" value={high} onChange={e=>setHigh(Number(e.target.value))}/></label></div>
 <button type="button" className="secondary" disabled={!valid} onClick={()=>{if(!valid||!product)return;const min=Math.ceil(low)*product.price/item.quantity,max=Math.ceil(high)*product.price/item.quantity;onChange({materialBasisQuantity:item.quantity,materialMin:min,materialMax:max,materialRate:max,materialStatus:"partial",materialNote:`${product.name}: ${Math.ceil(low)}–${Math.ceil(high)} уп. × $${product.price}; ${product.url}; перевірено ${product.checked}. Перевір повноту комплекту; ціна за одиницю для кількості ${item.quantity}.`})}}>Підставити бюджет і перевірити комплект</button></>}
 </details>;
}
