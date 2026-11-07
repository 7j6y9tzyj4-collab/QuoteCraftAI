"use client";
// Заголовок блоку зі стрілкою: натиснув — розгорнулось / згорнулось.
export default function FoldTitle({open,onToggle,title,summary}:{open:boolean;onToggle:()=>void;title:React.ReactNode;summary?:React.ReactNode}){
  return <h2 onClick={onToggle} style={{cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",margin:0}}>
    <span style={{display:"inline-flex",width:26,height:26,borderRadius:8,background:"#eef2f7",alignItems:"center",justifyContent:"center",fontSize:14,transition:"transform .15s",transform:open?"rotate(90deg)":"none",flex:"none"}}>▶</span>
    <span>{title}</span>
    {!open&&summary!=null&&<small style={{fontWeight:600,fontSize:13,color:"#667085"}}>{summary}</small>}
  </h2>;
}
