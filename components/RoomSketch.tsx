"use client";
import {parseInches,fmtInches,type Room,type Opening} from "@/lib/survey";

// Ескіз кімнати з розмірів: вид зверху (двері/вікна на стінах) і розгортка 4 стін з площами.
const WALLS=["A","B","C","D"] as const; // A — верхня (довжина), B — права (ширина), C — нижня, D — ліва
export default function RoomSketch({room,onOpening}:{room:Room;onOpening?:(id:string,patch:Partial<Opening>)=>void}){
  const L=parseInches(room.length),W=parseInches(room.width),H=parseInches(room.height);
  if(!L||!W)return null;
  const vw=320,pad=34;
  const k=Math.min((vw-2*pad)/L,(240-2*pad)/W);
  const w=L*k,h=W*k,x0=pad,y0=pad;
  const ops=(room.openings||[]).map((o,i)=>({...o,wall:(o as any).wall||WALLS[i%4],ow:parseInches(o.w)||0}));
  // розкладаємо прорізи вздовж стіни по черзі
  const byWall:Record<string,typeof ops>={A:[],B:[],C:[],D:[]};
  for(const o of ops)byWall[o.wall].push(o);
  const segs:{x1:number;y1:number;x2:number;y2:number;door:boolean;label:string}[]=[];
  for(const wall of WALLS){
    const len=wall==="A"||wall==="C"?L:W;const list=byWall[wall];
    const total=list.reduce((a,o)=>a+o.ow*(o.count||1),0);
    let pos=Math.max(0,(len-total)/(list.length+1));let cur=pos;
    for(const o of list){for(let c=0;c<(o.count||1);c++){
      const a=cur*k,b=(cur+o.ow)*k;const door=/двер|door/i.test(o.name);
      const seg=wall==="A"?{x1:x0+a,y1:y0,x2:x0+b,y2:y0}:wall==="C"?{x1:x0+a,y1:y0+h,x2:x0+b,y2:y0+h}:wall==="B"?{x1:x0+w,y1:y0+a,x2:x0+w,y2:y0+b}:{x1:x0,y1:y0+a,x2:x0,y2:y0+b};
      segs.push({...seg,door,label:o.name});cur+=o.ow+pos;
    }}
  }
  const f=(i:number)=>fmtInches(i);
  const wallArea=(len:number)=>H?Math.round(len*H/144*10)/10:null;
  return <div style={{marginTop:10}}>
    <svg viewBox={`0 0 ${vw} ${h+2*pad}`} width="100%" style={{maxWidth:420,display:"block",background:"#fff",border:"1px solid #e4e7ec",borderRadius:12}}>
      <rect x={x0} y={y0} width={w} height={h} fill="#f8fafc" stroke="#101828" strokeWidth={3}/>
      {segs.map((s,i)=><g key={i}>
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#fff" strokeWidth={5}/>
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.door?"#2f6df6":"#12b76a"} strokeWidth={s.door?2:4} strokeDasharray={s.door?undefined:"3 3"}/>
        {s.door&&<path d={s.y1===s.y2?`M${s.x1},${s.y1} A${s.x2-s.x1},${s.x2-s.x1} 0 0 ${s.y1===y0?1:0} ${s.x1},${s.y1+(s.y1===y0?1:-1)*(s.x2-s.x1)}`:`M${s.x1},${s.y1} A${s.y2-s.y1},${s.y2-s.y1} 0 0 ${s.x1===x0?0:1} ${s.x1+(s.x1===x0?1:-1)*(s.y2-s.y1)},${s.y1}`} fill="none" stroke="#2f6df6" strokeWidth={1}/>}
      </g>)}
      <text x={x0+w/2} y={y0-12} textAnchor="middle" fontSize={12} fontWeight={700} fill="#344054">A · {f(L)}</text>
      <text x={x0+w/2} y={y0+h+22} textAnchor="middle" fontSize={12} fontWeight={700} fill="#344054">C · {f(L)}</text>
      <text x={x0-8} y={y0+h/2} textAnchor="middle" fontSize={12} fontWeight={700} fill="#344054" transform={`rotate(-90 ${x0-8} ${y0+h/2})`}>D · {f(W)}</text>
      <text x={x0+w+10} y={y0+h/2} textAnchor="middle" fontSize={12} fontWeight={700} fill="#344054" transform={`rotate(90 ${x0+w+10} ${y0+h/2})`}>B · {f(W)}</text>
      <text x={x0+w/2} y={y0+h/2-4} textAnchor="middle" fontSize={13} fontWeight={800} fill="#101828">{room.name||"Кімната"}</text>
      <text x={x0+w/2} y={y0+h/2+12} textAnchor="middle" fontSize={11} fill="#667085">{Math.round(L*W/144*10)/10} sq ft{H?` · стеля ${f(H)}`:""}</text>
    </svg>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:8}}>
      {WALLS.map(wl=>{const len=wl==="A"||wl==="C"?L:W;const opsA=byWall[wl].reduce((a,o)=>a+(parseInches(o.w)||0)*(parseInches(o.h)||0)/144*(o.count||1),0);const area=wallArea(len);
        return <div key={wl} className="linetotal" style={{padding:8}}><span>Стіна {wl}</span><b style={{fontSize:13}}>{f(len)}{H?` × ${f(H)}`:""}</b><small className="muted" style={{display:"block",fontSize:11}}>{area!==null?`${Math.round((area-opsA)*10)/10} sq ft`:"висота?"}{byWall[wl].length?` · ${byWall[wl].map(o=>o.name).join(", ")}`:""}</small></div>})}
    </div>
    {onOpening&&ops.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8,alignItems:"center"}}><small className="muted">На якій стіні:</small>
      {ops.map(o=><span key={o.id} style={{display:"inline-flex",gap:4,alignItems:"center",fontSize:13}}>{o.name}<select value={o.wall} onChange={e=>onOpening(o.id,{wall:e.target.value} as any)} style={{width:"auto",padding:"4px 6px"}}>{WALLS.map(x=><option key={x}>{x}</option>)}</select></span>)}
    </div>}
    <small className="muted">Схема, не креслення: двері/вікна показані на вибраних стінах умовно, по черзі.{room.parts?.length?" Ніші/вирізи не намальовані, але враховані в площах.":""}</small>
  </div>;
}
