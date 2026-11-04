"use client";
import {useEffect} from "react";

// 🌐 English: перекладає інтерфейс на льоту за словником /api/i18n (точні фрази, шаблони з {0}, префікси).
// Дані користувача (поля вводу, нотатки, імена) не чіпає — перекладаються лише відомі фрази інтерфейсу.
const CY=/[А-Яа-яІіЇїЄєҐґ]/;
type T={re:RegExp;en:string};
let dict:Record<string,string>={};let tmpls:T[]=[];let prefixes:[string,string][]=[];let ready=false;
const esc=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function build(d:Record<string,string>){
  dict={};tmpls=[];prefixes=[];
  for(const [k0,v] of Object.entries(d)){const k=k0.replace(/\s+/g," ").trim();if(!v)continue;
    if(/\{\d+\}/.test(k)){tmpls.push({re:new RegExp("^"+esc(k).replace(/\\\{(\d+)\\\}/g,"(.+?)")+"$","s"),en:v})}
    else{dict[k]=v;if(k.length>=6)prefixes.push([k,v])}}
  tmpls.sort((a,b)=>b.re.source.length-a.re.source.length);prefixes.sort((a,b)=>b[0].length-a[0].length);ready=true;
}
export function tr(text:string):string|null{
  if(!ready||!text||!CY.test(text))return null;
  const lead=text.match(/^\s*/)![0],trail=text.match(/\s*$/)![0];const core=text.trim().replace(/\s+/g," ");
  const e=dict[core];if(e)return lead+e+trail;
  for(const t of tmpls){const m=t.re.exec(core);if(m)return lead+t.en.replace(/\{(\d+)\}/g,(_,i)=>{const x=m[Number(i)+1]??"";return tr(x)?.trim()??x})+trail}
  for(const [k,v] of prefixes)if(core.startsWith(k)&&k.length<core.length){const rest=core.slice(k.length);return lead+v+(tr(rest)??rest)+trail}
  return null;
}
const SKIP=new Set(["SCRIPT","STYLE","TEXTAREA","INPUT","NOSCRIPT"]);
const mine=new WeakMap<Node,string>();
function skipEl(el:Element|null){for(let e=el;e;e=e.parentElement){if(SKIP.has(e.tagName)||(e as HTMLElement).isContentEditable||e.hasAttribute?.("data-notr"))return true}return false}
function doText(n:Text){if(mine.get(n)===n.nodeValue)return;if(skipEl(n.parentElement))return;const r=tr(n.nodeValue||"");if(r!=null&&r!==n.nodeValue){n.nodeValue=r;mine.set(n,r)}}
function doAttrs(el:Element){if(skipEl(el.parentElement)&&el.tagName!=="INPUT"&&el.tagName!=="TEXTAREA")return;
  for(const a of ["placeholder","title","aria-label"]){const v=el.getAttribute(a);if(v){const r=tr(v);if(r!=null&&r!==v)el.setAttribute(a,r)}}}
function walk(root:Node){
  if(root.nodeType===3){doText(root as Text);return}
  if(root.nodeType!==1)return;const el=root as Element;if(SKIP.has(el.tagName)&&el.tagName!=="INPUT"&&el.tagName!=="TEXTAREA")return;
  doAttrs(el);
  const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let n:Node|null;
  while((n=w.nextNode())){if(n.nodeType===3)doText(n as Text);else doAttrs(n as Element)}
}
export default function AutoTranslate({on}:{on:boolean}){
  useEffect(()=>{
    if(!on)return;let stop=false;let obs:MutationObserver|null=null;
    const oc=window.confirm,oa=window.alert;
    (async()=>{
      try{const r=await fetch("/api/i18n");const j=await r.json();build(j.dict||{})}catch{return}
      if(stop)return;document.documentElement.lang="en";
      walk(document.body);
      obs=new MutationObserver(ms=>{for(const m of ms){if(m.type==="characterData")doText(m.target as Text);else if(m.type==="attributes")doAttrs(m.target as Element);else m.addedNodes.forEach(walk)}});
      obs.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["placeholder","title","aria-label"]});
      window.confirm=(msg?:string)=>oc.call(window,msg?(tr(String(msg))??msg):msg);
      window.alert=(msg?:any)=>oa.call(window,msg?(tr(String(msg))??msg):msg);
    })();
    return()=>{stop=true;obs?.disconnect();window.confirm=oc;window.alert=oa};
  },[on]);
  return null;
}
