"use client";
import {useEffect} from "react";

// Позначає «клієнт переглянув». Не рахує, якщо відкрив сам власник (увійшов у QuoteCraft на цьому пристрої).
export default function ViewPing({token}:{token:string}){
  useEffect(()=>{
    let jwt="";
    try{const k=Object.keys(localStorage).find(x=>/^sb-.*-auth-token$/.test(x));if(k)jwt=JSON.parse(localStorage.getItem(k)||"{}")?.access_token||""}catch{}
    fetch("/api/quote-view",{method:"POST",headers:{"Content-Type":"application/json",...(jwt?{Authorization:`Bearer ${jwt}`}:{})},body:JSON.stringify({token}),keepalive:true}).catch(()=>{});
  },[token]);
  return null;
}
