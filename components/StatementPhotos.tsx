"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import type {Statement} from "@/lib/statement";

// Фото роботи по проєкту (від мене або помічника).
export default function StatementPhotos({st,onPatch}:{st:Statement;onPatch:(p:Partial<Statement>)=>void}){
  const photos=st.photos||[];
  const [urls,setUrls]=useState<Record<string,string>>({});
  useEffect(()=>{
    const paths=photos.map(p=>p.path).filter(p=>!urls[p]);if(!paths.length)return;
    supabase.storage.from("receipts").createSignedUrls(paths,3600).then(({data}:{data:any[]|null})=>{const m:Record<string,string>={};for(const x of data||[])if(x.path&&x.signedUrl)m[x.path]=x.signedUrl;setUrls(u=>({...u,...m}))});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[photos.length]);
  if(!photos.length)return null;
  return <section className="panel">
    <div className="head"><h2>🏗 Фото роботи · {photos.length}</h2></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:6,marginTop:8}}>
      {[...photos].reverse().map(p=><div key={p.id} style={{position:"relative"}}>
        <a href={urls[p.path]} target="_blank" rel="noreferrer"><img src={urls[p.path]} alt="" style={{width:"100%",aspectRatio:"1",objectFit:"cover",borderRadius:10,background:"#eef2f7"}}/></a>
        <small style={{position:"absolute",left:4,bottom:4,background:"#000a",color:"#fff",borderRadius:6,padding:"0 4px",fontSize:10}}>{p.date}{p.by?` · ${p.by}`:""}</small>
        <button onClick={()=>{if(confirm("Видалити фото?")){supabase.storage.from("receipts").remove([p.path]);onPatch({photos:photos.filter(x=>x.id!==p.id)})}}} style={{position:"absolute",right:2,top:2,width:24,height:24,borderRadius:12,background:"#fffc",color:"#b42318",padding:0}}>×</button>
      </div>)}
    </div>
  </section>;
}
