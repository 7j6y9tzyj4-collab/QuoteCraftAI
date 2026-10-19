"use client";
import {useState} from "react";
import dynamic from "next/dynamic";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import type {Client,ClientSplat} from "@/lib/clients";
import {COMPANY_NAME,COMPANY_CONTACT} from "@/lib/calcPdf";

const SplatViewer=dynamic(()=>import("@/components/SplatViewer"),{ssr:false});
const BUCKET="receipts",MAX=50*1024*1024;
const mb=(n:number)=>(n/1048576).toFixed(1)+" МБ";

// Картка клієнта → «3D-кімната»: завантажив файл зі Scaniverse → дивишся сам → посилання клієнту.
export default function ClientSplats({client,user,onSave}:{client:Client;user:User|null;onSave:(c:Client)=>void}){
  const [busy,setBusy]=useState("");
  const [msg,setMsg]=useState("");
  const [open,setOpen]=useState<{s:ClientSplat;url:string}|null>(null);
  const list=client.splats||[];
  const put=(next:ClientSplat[])=>onSave({...client,splats:next,updatedAt:new Date().toISOString()});

  async function upload(f:File){
    if(!user){setMsg("Увійди в акаунт.");return}
    const ext=(f.name.split(".").pop()||"").toLowerCase();
    if(!["spz","ply","splat","ksplat"].includes(ext)){setMsg("Потрібен файл .spz, .ply, .splat або .ksplat (Scaniverse → Share → Export → SPZ).");return}
    if(f.size>MAX){setMsg(`Файл ${mb(f.size)} — забагато (макс. 50 МБ). У Scaniverse експортуй у форматі SPZ — він у ~10 разів менший за PLY.`);return}
    setBusy("Завантажую…");setMsg("");
    const id=crypto.randomUUID();const path=`${user.id}/splats/${id}.${ext}`;
    const {error}=await supabase.storage.from(BUCKET).upload(path,f,{contentType:"application/octet-stream",upsert:true});
    setBusy("");
    if(error){setMsg("Не вдалося завантажити: "+error.message);return}
    const s:ClientSplat={id,name:f.name.replace(/\.[^.]+$/,"")||"Room",path,size:f.size,createdAt:new Date().toISOString(),flip:true};
    put([s,...list]);
  }
  async function view(s:ClientSplat){
    const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(s.path,3600);
    if(error||!data?.signedUrl){setMsg("Не вдалося відкрити: "+(error?.message||""));return}
    setOpen({s,url:data.signedUrl});
  }
  async function share(s:ClientSplat){
    if(!user)return;
    setBusy("Роблю посилання…");setMsg("");
    try{
      const data={v:1,kind:"splat",company:COMPANY_NAME,contact:COMPANY_CONTACT,client:client.name,title:s.name,path:s.path,flip:s.flip!==false};
      let token=s.shareToken||"";
      if(token){const {data:row}=await supabase.from("shared_quotes").update({data,updated_at:new Date().toISOString()}).eq("token",token).select("token").maybeSingle();if(!row)token=""}
      if(!token){
        token=crypto.randomUUID();
        const {error}=await supabase.from("shared_quotes").insert({token,user_id:user.id,data,status:"sent"});
        if(error)throw error;
        put(list.map(x=>x.id===s.id?{...x,shareToken:token}:x));
      }
      const link=`${window.location.origin}/q/${token}`;
      const nav=navigator as Navigator&{share?:(d:ShareData)=>Promise<void>};
      if(nav.share&&/iPhone|iPad|Android/i.test(navigator.userAgent)){try{await nav.share({text:link});setMsg("Посилання надіслано.");return}catch{}}
      try{await navigator.clipboard.writeText(link);setMsg("Посилання скопійовано: "+link)}catch{setMsg("Посилання: "+link)}
    }catch(e){setMsg("Не вдалося: "+(e instanceof Error?e.message:String(e)))}finally{setBusy("")}
  }
  async function remove(s:ClientSplat){
    if(!confirm(`Видалити 3D «${s.name}»? Файл буде видалено назавжди${s.shareToken?", посилання клієнта перестане працювати":""}.`))return;
    await supabase.storage.from(BUCKET).remove([s.path]);
    if(s.shareToken)await supabase.from("shared_quotes").delete().eq("token",s.shareToken);
    put(list.filter(x=>x.id!==s.id));
  }

  return <section className="panel">
    <div className="head"><h2>🏠 3D-кімната (фото-реалістична)</h2>
      <label className="add" style={{cursor:"pointer"}}>＋ Файл<input type="file" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f)void upload(f)}}/></label></div>
    {!list.length&&<p className="muted" style={{fontSize:14}}>Безкоштовний додаток <b>Scaniverse</b> на iPhone: «＋» → <b>Splat</b> → повільно обійди кімнату з камерою (1–2 хв, знизу й зверху) → дочекайся обробки → Share → Export → <b>SPZ</b> → збережи у Файли → тут «＋ Файл».</p>}
    {busy&&<p className="muted">{busy}</p>}
    {list.map(s=><div key={s.id} style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",padding:"8px 0",borderTop:"1px solid #eaecf0"}}>
      <span style={{flex:"1 1 160px"}}><b>{s.name}</b><small className="muted" style={{display:"block"}}>{new Date(s.createdAt).toLocaleDateString("uk-UA")} · {mb(s.size)}{s.shareToken?" · 🔗":""}</small></span>
      <button className="secondary" onClick={()=>view(s)}>👁 Дивитись</button>
      <button className="secondary" onClick={()=>share(s)} disabled={!!busy}>🔗 Клієнту</button>
      <button className="secondary" onClick={()=>remove(s)} style={{color:"#b42318"}}>🗑</button>
    </div>)}
    {msg&&<p className="muted" style={{fontSize:13,wordBreak:"break-all"}}>{msg}</p>}
    {open&&<div style={{position:"fixed",inset:0,zIndex:1000,background:"#000c",display:"flex",flexDirection:"column",padding:"max(12px,env(safe-area-inset-top)) 8px 12px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",color:"#fff",marginBottom:8}}><b>{open.s.name}</b><button className="secondary" onClick={()=>setOpen(null)}>✕ Закрити</button></div>
      <div style={{flex:1}}><SplatViewer url={open.url} fileName={open.s.path} flip={open.s.flip!==false} height="100%"
        onFlip={f=>put(list.map(x=>x.id===open.s.id?{...x,flip:f}:x))}/></div>
      <small style={{color:"#ddd",marginTop:6}}>Якщо кімната догори дриґом — «↕ Перевернути» (запам'ятається і для клієнта після «🔗 Клієнту»).</small>
    </div>}
  </section>;
}
