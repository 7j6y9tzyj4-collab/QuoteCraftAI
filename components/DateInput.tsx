"use client";
import {normDate} from "@/lib/receiptBatch";

// Поле дати з календарем (на iPhone — колесо, на Mac — календар). Зберігає як і раніше: MM/DD/YYYY.
const toUS=(iso:string)=>{const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[2]}/${m[3]}/${m[1]}`:""};
export default function DateInput({value,onChange,style,placeholder}:{value:string;onChange:(v:string)=>void;style?:React.CSSProperties;placeholder?:string}){
  const iso=normDate(value);
  return <input type="date" value={iso} placeholder={placeholder} style={{minWidth:0,...style}}
    onChange={e=>onChange(e.target.value?toUS(e.target.value):"")}
    title={value&&!iso?`Нерозпізнана дата: ${value}`:undefined}/>;
}
