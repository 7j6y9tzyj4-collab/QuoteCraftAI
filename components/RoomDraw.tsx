"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {parseInches,fmtInches,type Room,type Part} from "@/lib/survey";
import {strokeToEdges,verts,solve,outlineStats,outlineToRect,removeEdge,addJog,displayLens,type EdgeV,type Pt,type Dir} from "@/lib/outline";

// ✏️ Намалювати кімнату пальцем: 1) обводиш контур, програма робить стіни рівними під 90°; 2) вписуєш довжину кожної стіни;
// 3) програма рахує площу підлоги й периметр і записує їх у кімнату.
const ARROW:Record<Dir,string>={R:"→",D:"↓",L:"←",U:"↑"};
const r16=(n:number)=>Math.round(n*16)/16;
const num=(n:number)=>String(Math.round(n*1000)/1000);

export default function RoomDraw({room,onSave,onClose}:{room:Room;onSave:(patch:Partial<Room>)=>void;onClose:()=>void}){
  const [edges,setEdges]=useState<EdgeV[]|null>(null);
  const vals=useMemo(()=>(edges||[]).map(e=>e.val),[edges]);
  const setVal=(i:number,v:string)=>setEdges(es=>es&&es.map((e,k)=>k===i?{...e,val:v}:e));
  const [note,setNote]=useState("");
  const [mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]);
  const [active,setActive]=useState(0);
  const [err,setErr]=useState("");
  const canvas=useRef<HTMLCanvasElement|null>(null);
  const stroke=useRef<Pt[]>([]);
  const drawing=useRef(false);

  // крок 1: полотно для малювання
  useEffect(()=>{
    if(edges)return;const c=canvas.current;if(!c)return;
    const dpr=window.devicePixelRatio||1,rect=c.getBoundingClientRect();c.width=rect.width*dpr;c.height=rect.height*dpr;
    const g=c.getContext("2d")!;g.scale(dpr,dpr);g.lineWidth=4;g.lineCap="round";g.lineJoin="round";g.strokeStyle="#175cd3";
    const pos=(e:PointerEvent):Pt=>{const r=c.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top]};
    const down=(e:PointerEvent)=>{e.preventDefault();drawing.current=true;stroke.current=[pos(e)];g.clearRect(0,0,rect.width,rect.height);setErr("");try{c.setPointerCapture(e.pointerId)}catch{}};
    const move=(e:PointerEvent)=>{if(!drawing.current)return;e.preventDefault();const p=pos(e),l=stroke.current[stroke.current.length-1];stroke.current.push(p);g.beginPath();g.moveTo(l[0],l[1]);g.lineTo(p[0],p[1]);g.stroke()};
    const up=()=>{if(!drawing.current)return;drawing.current=false;
      const ed=strokeToEdges(stroke.current);
      if(!ed){setErr("Не вдалося розпізнати форму. Обведи кімнату однією замкнутою лінією: почни з кута і повернись у нього.");return}
      setEdges(ed.map(e=>({...e,val:""})));setActive(0)};
    c.addEventListener("pointerdown",down);c.addEventListener("pointermove",move);c.addEventListener("pointerup",up);c.addEventListener("pointercancel",up);
    return()=>{c.removeEventListener("pointerdown",down);c.removeEventListener("pointermove",move);c.removeEventListener("pointerup",up);c.removeEventListener("pointercancel",up)};
  },[edges,mounted]);

  const entered=useMemo(()=>vals.map(v=>v.trim()?parseInches(v):null),[vals]);
  const bad=vals.map((v,i)=>!!v.trim()&&entered[i]===null);
  const sol=useMemo(()=>edges?solve(edges,entered):null,[edges,entered]);
  // малюнок у масштабі: вписані стіни — справжні, решта — за пропорцією ескізу
  const view=useMemo(()=>{
    if(!edges||!sol)return null;
    const lens=displayLens(edges,sol.lens);
    const v=verts(lens,edges);const end:Pt=[v[v.length-1][0]+({R:1,L:-1,D:0,U:0}[edges[edges.length-1].dir])*lens[lens.length-1],v[v.length-1][1]+({D:1,U:-1,R:0,L:0}[edges[edges.length-1].dir])*lens[lens.length-1]];
    const all=[...v,end];const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
    const x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0||1,h=Math.max(...ys)-y0||1;
    const S=Math.min(300/w,220/h),ox=(340-w*S)/2,oy=(260-h*S)/2;
    const P=(p:Pt):Pt=>[ox+(p[0]-x0)*S,oy+(p[1]-y0)*S];
    return {pts:v.map(P),end:P(end)};
  },[edges,sol]);
  const stats=useMemo(()=>{if(!edges||!sol?.ok)return null;const pts=verts(sol.lens as number[],edges);return {pts,...outlineStats(pts)}},[edges,sol]);

  function save(){
    if(!stats)return;
    const {L,W,cuts,norm}=outlineToRect(stats.pts);
    const parts:Part[]=cuts.map(c=>({id:crypto.randomUUID(),name:"Виріз з малюнка",kind:"cut",length:num(r16(c.a)),depth:num(r16(c.d)),wall:c.wall}));
    onSave({length:num(r16(L)),width:num(r16(W)),parts,outline:{pts:norm.map(p=>[r16(p[0]),r16(p[1])] as [number,number])}});
    onClose();
  }
  const hasOld=!!(room.length||room.width||(room.parts||[]).length);

  if(!mounted)return null;
  return createPortal(<div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(16,24,40,.55)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div style={{background:"#fff",width:"100%",maxWidth:560,maxHeight:"94dvh",overflow:"auto",WebkitOverflowScrolling:"touch",borderRadius:"20px 20px 0 0",padding:"16px 16px calc(24px + env(safe-area-inset-bottom))"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <b style={{fontSize:17}}>✏️ Намалювати кімнату{room.name?`: ${room.name}`:""}</b>
        <button onClick={onClose} style={{background:"#eef2f7",borderRadius:10,padding:"6px 12px",fontWeight:800}}>Закрити</button>
      </div>

      {!edges&&<>
        <p className="muted" style={{fontSize:14,margin:"8px 0"}}>Обведи пальцем контур кімнати зверху, як на плані: однією лінією, з кута в той самий кут. Рівно малювати не треба — стіни вирівняються самі.</p>
        <canvas ref={canvas} style={{width:"100%",height:320,border:"2px dashed #b2ccff",borderRadius:14,background:"#f8faff",touchAction:"none",display:"block"}}/>
        {err&&<div style={{marginTop:8,padding:"8px 10px",borderRadius:10,background:"#fffaeb",border:"1px solid #fec84b",color:"#93370d",fontSize:14,fontWeight:600}}>{err}</div>}
      </>}

      {edges&&view&&sol&&<>
        <p className="muted" style={{fontSize:14,margin:"8px 0"}}>Впиши довжину кожної стіни в дюймах (можна 96, 7 3/4 або 8&apos; 2&quot;). Останню стіну в кожному напрямку програма порахує сама.</p>
        <svg viewBox="0 0 340 260" style={{width:"100%",background:"#f8faff",border:"1px solid #d0d5dd",borderRadius:14}}>
          <polygon points={view.pts.map(p=>p.join(",")).join(" ")} fill="#e9efff" stroke="none"/>
          {edges.map((e,i)=>{const a=view.pts[i],b=i+1<view.pts.length?view.pts[i+1]:view.end;const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;const on=i===active;
            const off=e.dir==="R"?[0,-9]:e.dir==="L"?[0,13]:e.dir==="D"?[11,4]:[-11,4];
            return <g key={i} onClick={()=>setActive(i)} style={{cursor:"pointer"}}>
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={on?"#f79009":bad[i]?"#f04438":"#175cd3"} strokeWidth={on?5:3} strokeLinecap="round"/>
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={22}/>
              <circle cx={mx+off[0]} cy={my+off[1]-4} r={9} fill={on?"#f79009":"#fff"} stroke={on?"#f79009":"#98a2b3"}/>
              <text x={mx+off[0]} y={my+off[1]} textAnchor="middle" fontSize={11} fontWeight={800} fill={on?"#fff":"#344054"}>{i+1}</text>
            </g>})}
        </svg>
        <div style={{marginTop:8,padding:10,borderRadius:12,background:"#fff7ed",border:"1px solid #fed7aa"}}>
          <b style={{fontSize:14}}>Виправити форму — стіна {active+1} {ARROW[edges[active]?.dir||"R"]}</b>
          <small className="muted" style={{display:"block"}}>Натисни на стіну на малюнку (вона стане помаранчевою), потім вибери дію.</small>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
            <button type="button" className="secondary" style={{padding:"8px 10px",fontSize:13,color:"#b42318"}} disabled={edges.length<=4} onClick={()=>{const n=removeEdge(edges,active);if(!n){setNote("Цю стіну прибрати не можна — без неї кімната не замкнеться.");return}setEdges(n);setActive(a=>Math.min(a,n.length-1));setNote("Стіну прибрано, сусідні з'єднались. Перевір розміри стін поруч.")}}>✕ Прибрати цю стіну</button>
            <button type="button" className="secondary" style={{padding:"8px 10px",fontSize:13}} onClick={()=>{setEdges(addJog(edges,active,false));setActive(active+1);setNote("Додано кут назовні. Впиши розміри трьох нових стін.")}}>＋ Кут назовні</button>
            <button type="button" className="secondary" style={{padding:"8px 10px",fontSize:13}} onClick={()=>{setEdges(addJog(edges,active,true));setActive(active+1);setNote("Додано кут всередину. Впиши розміри трьох нових стін.")}}>＋ Кут всередину</button>
          </div>
          {note&&<small style={{display:"block",marginTop:6,color:"#93370d",fontWeight:600}}>{note}</small>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10}}>
          {edges.map((e,i)=>{const auto=sol.auto[i];const L=sol.lens[i];
            return <label key={i} style={{display:"block",padding:6,borderRadius:12,border:i===active?"2px solid #f79009":"2px solid transparent"}}>
              <span style={{fontSize:13}}>Стіна {i+1} {ARROW[e.dir]}</span>
              <input inputMode="text" value={vals[i]} placeholder={auto&&L!==null?`авто: ${num(L)}`:"дюйми"} onFocus={()=>setActive(i)}
                onChange={ev=>setVal(i,ev.target.value)} style={bad[i]?{borderColor:"#f04438"}:undefined}/>
              <small className="muted" style={{fontWeight:400}}>{bad[i]?"не зрозумів цифру":L!==null?`${auto?"порахував: ":""}${fmtInches(L)}`:" "}</small>
            </label>})}
        </div>
        {sol.errors.map((x,i)=><div key={i} style={{marginTop:8,padding:"8px 10px",borderRadius:10,background:"#fef3f2",border:"1px solid #fda29b",color:"#b42318",fontSize:14,fontWeight:600}}>{x}</div>)}
        {stats&&<div style={{marginTop:10,padding:12,borderRadius:12,background:"#ecfdf3",border:"1px solid #abefc6"}}>
          <b>Підлога: {Math.round(stats.areaIn2/144*10)/10} sq ft</b> · периметр {Math.round(stats.perimIn/12*10)/10} lin ft · стін: {edges.length}
        </div>}
        {stats&&hasOld&&<small className="muted" style={{display:"block",marginTop:6}}>Збереження замінить довжину, ширину і «нестандартну форму» цієї кімнати. Висота, двері, вікна і сантехніка залишаться.</small>}
        <div className="actions" style={{marginTop:10}}>
          <button className="primary" disabled={!stats} onClick={save}>Зберегти в кімнату</button>
          <button className="secondary" onClick={()=>{setEdges(null);setErr("");setNote("")}}>Намалювати заново</button>
        </div>
      </>}
    </div>
  </div>,document.body);
}
