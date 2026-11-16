"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {parseInches,fmtInches,type Room,type Part} from "@/lib/survey";
import {strokeToEdges,verts,vertsCh,fullLens,dragDelta,sketchScale,solve,outlineStats,outlineToRect,removeEdge,addJog,displayLens,type EdgeV,type Pt,type Dir} from "@/lib/outline";

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
  // ◢ скоси 45°: вписана довжина діагоналі → катет = D/√2
  const chD=useMemo(()=>(edges||[]).map(e=>e.ch===undefined?null:e.ch.trim()?parseInches(e.ch):NaN),[edges]);
  const legs=useMemo(()=>chD.map(d=>d!==null&&!isNaN(d)&&d>0?d/Math.SQRT2:0),[chD]);
  const sol0=useMemo(()=>edges?solve(edges,entered,legs):null,[edges,entered,legs]);
  const sol=useMemo(()=>{if(!sol0)return null;const miss=chD.some(d=>d!==null&&(isNaN(d)||!(d>0)));return miss?{...sol0,ok:false,errors:[...sol0.errors,"Впиши довжину кожного скосу (діагональної стіни)."]}:sol0},[sol0,chD]);
  // малюнок у масштабі: вписані стіни — справжні, решта — за пропорцією ескізу
  const view=useMemo(()=>{
    if(!edges||!sol)return null;
    const k=sketchScale(edges,sol.lens);
    const dl=edges.map((e,i)=>chD[i]===null?0:legs[i]>0?legs[i]:Math.min(e.sketch,edges[(i+1)%edges.length].sketch)*k*0.18);
    const lens=displayLens(edges,sol.lens,dl);
    const v=vertsCh(lens,edges,dl);const xs=v.map(p=>p[0]),ys=v.map(p=>p[1]);
    const x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0||1,h=Math.max(...ys)-y0||1;
    const S=Math.min(300/w,220/h),ox=(340-w*S)/2,oy=(260-h*S)/2;
    const P=(p:Pt):Pt=>[ox+(p[0]-x0)*S,oy+(p[1]-y0)*S];
    // відрізки: стіна i (пряма частина) і, якщо є, скіс після неї
    const segs:{i:number;ch:boolean;a:Pt;b:Pt}[]=[];let j=0;const pts=v.map(P);
    for(let i=0;i<edges.length;i++){const a=pts[j];const b=pts[(j+1)%pts.length];segs.push({i,ch:false,a,b});j++;
      if(dl[i]>0){segs.push({i,ch:true,a:pts[j%pts.length],b:pts[(j+1)%pts.length]});j++}}
    return {pts,segs,S,k};
  },[edges,sol,chD,legs]);
  const stats=useMemo(()=>{if(!edges||!sol?.ok)return null;const L=sol.lens as number[];const pts=vertsCh(L,edges,legs);return {pts,ortho:verts(fullLens(L,legs),edges),...outlineStats(pts)}},[edges,sol,legs]);

  // ✋ перетягування стіни: сусідні стіни подовжуються / коротшають (крок 1")
  const svgRef=useRef<SVGSVGElement|null>(null);
  const drag=useRef<{i:number;start:number;base:EdgeV[];S:number;k:number;moved:boolean}|null>(null);
  const svgPt=(e:React.PointerEvent):Pt=>{const r=svgRef.current!.getBoundingClientRect();return [(e.clientX-r.left)*340/r.width,(e.clientY-r.top)*260/r.height]};
  function dragStart(e:React.PointerEvent,i:number){
    if(!edges||!view)return;setActive(i);
    const p=svgPt(e);const horiz=edges[i].dir==="R"||edges[i].dir==="L";
    drag.current={i,start:horiz?p[1]:p[0],base:edges.map(x=>({...x})),S:view.S,k:view.k,moved:false};
    try{(e.currentTarget as Element).setPointerCapture(e.pointerId)}catch{}
  }
  function dragMove(e:React.PointerEvent){
    const d=drag.current;if(!d)return;e.preventDefault();
    const p=svgPt(e);const horiz=d.base[d.i].dir==="R"||d.base[d.i].dir==="L";
    const mv=Math.round(((horiz?p[1]:p[0])-d.start)/d.S);if(!mv&&!d.moved)return;
    const {prev,dp,next,dn}=dragDelta(d.base,d.i,mv);
    const nb=d.base.map(x=>({...x}));
    for(const [k,dl] of [[prev,dp],[next,dn]] as [number,number][]){
      const v=nb[k].val.trim()?parseInches(nb[k].val):null;
      if(v!==null){if(v+dl<=0)return;nb[k].val=num(r16(v+dl))}
      else{const s2=nb[k].sketch+dl/d.k;if(s2<=0)return;nb[k].sketch=s2}
    }
    d.moved=true;setEdges(nb);setNote(mv?`Стіну ${d.i+1} посунуто на ${mv>0?"+":""}${mv}" — сусідні стіни змінились.`:"");
  }
  function dragEnd(){drag.current=null}

  function save(){
    if(!stats)return;
    const {L,W,cuts,norm}=outlineToRect(stats.pts,stats.ortho);
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
        <svg ref={svgRef} viewBox="0 0 340 260" onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} style={{width:"100%",background:"#f8faff",border:"1px solid #d0d5dd",borderRadius:14,touchAction:"none"}}>
          <polygon points={view.pts.map(p=>p.join(",")).join(" ")} fill="#e9efff" stroke="none"/>
          {view.segs.map(({i,ch,a,b})=>{const e=edges[i];const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;const on=i===active;
            if(ch)return <g key={"c"+i}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={chD[i]===null||isNaN(chD[i] as number)?"#f79009":"#7a5af8"} strokeWidth={3} strokeDasharray={legs[i]>0?undefined:"5 4"} strokeLinecap="round"/><text x={mx} y={my+4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#7a5af8">◢</text></g>;
            const off=e.dir==="R"?[0,-9]:e.dir==="L"?[0,13]:e.dir==="D"?[11,4]:[-11,4];
            return <g key={i} onPointerDown={ev=>dragStart(ev,i)} style={{cursor:e.dir==="R"||e.dir==="L"?"ns-resize":"ew-resize"}}>
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={on?"#f79009":bad[i]?"#f04438":"#175cd3"} strokeWidth={on?5:3} strokeLinecap="round"/>
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={26}/>
              <circle cx={mx+off[0]} cy={my+off[1]-4} r={9} fill={on?"#f79009":"#fff"} stroke={on?"#f79009":"#98a2b3"}/>
              <text x={mx+off[0]} y={my+off[1]} textAnchor="middle" fontSize={11} fontWeight={800} fill={on?"#fff":"#344054"}>{i+1}</text>
            </g>})}
        </svg>
        <small className="muted" style={{display:"block",marginTop:4}}>✋ Потягни стіну пальцем — вона посунеться, а сусідні подовжаться чи вкоротяться (крок 1&quot;).</small>
        <div style={{marginTop:8,padding:10,borderRadius:12,background:"#fff7ed",border:"1px solid #fed7aa"}}>
          <b style={{fontSize:14}}>Виправити форму — стіна {active+1} {ARROW[edges[active]?.dir||"R"]}</b>
          <small className="muted" style={{display:"block"}}>Натисни на стіну на малюнку (вона стане помаранчевою), потім вибери дію.</small>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
            <button type="button" className="secondary" style={{padding:"8px 10px",fontSize:13,color:"#b42318"}} disabled={edges.length<=4} onClick={()=>{const n=removeEdge(edges,active);if(!n){setNote("Цю стіну прибрати не можна — без неї кімната не замкнеться.");return}setEdges(n);setActive(a=>Math.min(a,n.length-1));setNote("Стіну прибрано, сусідні з'єднались. Перевір розміри стін поруч.")}}>✕ Прибрати цю стіну</button>
            <button type="button" className="secondary" style={{padding:"8px 10px",fontSize:13}} onClick={()=>{setEdges(addJog(edges,active,false));setActive(active+1);setNote("Додано кут назовні. Впиши розміри трьох нових стін.")}}>＋ Кут назовні</button>
            <button type="button" className="secondary" style={{padding:"8px 10px",fontSize:13}} onClick={()=>{setEdges(addJog(edges,active,true));setActive(active+1);setNote("Додано кут всередину. Впиши розміри трьох нових стін.")}}>＋ Кут всередину</button>
            <button type="button" className="secondary" style={{padding:"8px 10px",fontSize:13,color:"#6941c6"}} onClick={()=>{const on=edges[active].ch!==undefined;setEdges(edges.map((x,k)=>k===active?{...x,ch:on?undefined:""}:x));setNote(on?"Скіс прибрано.":`Кут після стіни ${active+1} скошено під 45°. Впиши довжину діагональної стіни, а стіни ${active+1} і ${(active+1)%edges.length+1} — лише їхню пряму частину.`)}}>{edges[active]?.ch!==undefined?"✕ Прибрати скіс":"◢ Скосити кут (45°)"}</button>
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
              {e.ch!==undefined&&<span style={{display:"block",marginTop:6}}><span style={{fontSize:13,color:"#6941c6"}}>◢ Скіс після стіни {i+1}</span>
                <input inputMode="text" value={e.ch} placeholder="діагональ, дюйми" onFocus={()=>setActive(i)} onChange={ev=>{const v=ev.target.value;setEdges(es=>es&&es.map((x,k)=>k===i?{...x,ch:v}:x))}} style={chD[i]!==null&&isNaN(chD[i] as number)&&e.ch.trim()?{borderColor:"#f04438"}:undefined}/></span>}
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
