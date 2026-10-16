"use client";
import {useState} from "react";
import {findClient,newClient,telHref,type Client} from "@/lib/clients";

// Поле «Client» з підказками зі списку клієнтів. Нове ім'я → «＋ Зберегти клієнта» (телефон, адреса).
export default function ClientPicker({value,onChange,clients,onAdd,label="Client"}:{value:string;onChange:(v:string)=>void;clients:Client[];onAdd:(c:Client)=>void;label?:string}){
  const [adding,setAdding]=useState(false);
  const [phone,setPhone]=useState("");
  const [address,setAddress]=useState("");
  const found=findClient(clients,value);
  const listId="clients-"+label.replace(/\W/g,"");
  return <label>{label}
    <input value={value} list={listId} autoComplete="off" onChange={e=>onChange(e.target.value)} placeholder="почни писати ім'я"/>
    <datalist id={listId}>{clients.map(c=><option key={c.id} value={c.name}>{[c.phone,c.address].filter(Boolean).join(" · ")}</option>)}</datalist>
    {found&&<small className="muted" style={{display:"block",marginTop:4,fontWeight:400}}>
      {found.phone&&<a href={telHref(found.phone)} style={{marginRight:8}}>📞 {found.phone}</a>}{found.address&&<span>📍 {found.address}</span>}
      {!found.phone&&!found.address&&"у списку клієнтів, без телефону й адреси"}
    </small>}
    {!found&&value.trim().length>1&&!adding&&<button type="button" className="secondary" style={{marginTop:6,padding:"6px 10px",fontSize:13,fontWeight:700}} onClick={()=>setAdding(true)}>＋ Зберегти «{value.trim()}» як клієнта</button>}
    {adding&&!found&&<div style={{display:"grid",gap:6,marginTop:6,padding:8,background:"#f8fafc",borderRadius:10}}>
      <input placeholder="Телефон (необов'язково)" type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/>
      <input placeholder="Адреса (необов'язково)" value={address} onChange={e=>setAddress(e.target.value)}/>
      <div style={{display:"flex",gap:6}}>
        <button type="button" className="primary" style={{padding:"8px 12px"}} onClick={()=>{onAdd(newClient(value,{phone:phone.trim()||undefined,address:address.trim()||undefined}));setAdding(false);setPhone("");setAddress("")}}>Зберегти</button>
        <button type="button" className="secondary" style={{padding:"8px 12px"}} onClick={()=>setAdding(false)}>Не треба</button>
      </div>
    </div>}
  </label>;
}
