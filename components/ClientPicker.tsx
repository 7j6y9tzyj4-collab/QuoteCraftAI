"use client";
import {useState} from "react";
import {findClient,newClient,telHref,mapHref,type Client} from "@/lib/clients";

// Поле «Client» з підказками зі списку клієнтів. Нове ім'я → «＋ Зберегти клієнта» (телефон, адреса).
export default function ClientPicker({value,onChange,clients,onAdd,label="Client"}:{value:string;onChange:(v:string)=>void;clients:Client[];onAdd:(c:Client)=>void;label?:string}){
  const [adding,setAdding]=useState(false);
  const [editing,setEditing]=useState(false);
  const [phone,setPhone]=useState("");
  const [address,setAddress]=useState("");
  const found=findClient(clients,value);
  const listId="clients-"+label.replace(/\W/g,"");
  return <label>{label}
    <input value={value} list={listId} autoComplete="off" onChange={e=>onChange(e.target.value)} placeholder="почни писати ім'я"/>
    <datalist id={listId}>{clients.map(c=><option key={c.id} value={c.name}>{[c.phone,c.address].filter(Boolean).join(" · ")}</option>)}</datalist>
    {found&&!editing&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6,fontWeight:600}}>
      {found.address&&<a href={mapHref(found.address)} target="_blank" rel="noreferrer" style={{padding:"6px 10px",borderRadius:10,background:"#eef4ff",color:"#175cd3",textDecoration:"none",fontSize:14}}>📍 {found.address}</a>}
      {found.phone&&<a href={telHref(found.phone)} style={{padding:"6px 10px",borderRadius:10,background:"#ecfdf3",color:"#067647",textDecoration:"none",fontSize:14}}>📞 {found.phone}</a>}
      <button type="button" onClick={()=>{setPhone(found.phone||"");setAddress(found.address||"");setEditing(true)}} style={{padding:"6px 10px",borderRadius:10,background:found.address&&found.phone?"#f2f4f7":"#fffaeb",color:found.address&&found.phone?"#475467":"#b54708",fontSize:13,fontWeight:700}}>{found.address&&found.phone?"✎":!found.address?"＋ Адреса":"＋ Телефон"}</button>
    </div>}
    {found&&editing&&<div style={{display:"grid",gap:6,marginTop:6,padding:8,background:"#f8fafc",borderRadius:10}}>
      <input placeholder="Адреса" value={address} onChange={e=>setAddress(e.target.value)}/>
      <input placeholder="Телефон" type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/>
      <div style={{display:"flex",gap:6}}>
        <button type="button" className="primary" style={{padding:"8px 12px"}} onClick={()=>{onAdd({...found,address:address.trim()||undefined,phone:phone.trim()||undefined,updatedAt:new Date().toISOString()});setEditing(false)}}>Зберегти</button>
        <button type="button" className="secondary" style={{padding:"8px 12px"}} onClick={()=>setEditing(false)}>Скасувати</button>
      </div>
    </div>}
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
