"use client";
import {useEffect,useRef,useState} from "react";
import type {User} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {prepareJobPhoto} from "@/lib/jobPhotos";
import {shrinkImage,dataUrlToBlob} from "@/lib/receiptImage";
import type {CalcTask} from "@/lib/calcTypes";
import {roomAreas,parseInches,fmtInches,newRoom,DOOR,WINDOW,FIXTURES,FIXTURE_MODELS,type Survey,type Room,type SurveyPhoto,type RoomPlan,type PlanTask,type Part,type Fixture} from "@/lib/survey";
import RoomSketch from "@/components/RoomSketch";
import {importScan,type ScanPayload} from "@/lib/scanImport";

const BUCKET="receipts";
const UNIT:Record<string,string>={sqft:"sq ft",linear_ft:"lin ft",each:"шт",hour:"год",room:"кімн."};
const uid=()=>crypto.randomUUID();

// мініатюра фото з приватного сховища
function Thumb({p,onRemove,big}:{p:SurveyPhoto;onRemove:()=>void;big?:boolean}){
  const [src,setSrc]=useState<string|null>(p.dataUrl||null);
  useEffect(()=>{if(p.dataUrl){setSrc(p.dataUrl);return}if(!p.path)return;let on=true;supabase.storage.from(BUCKET).createSignedUrl(p.path,3600).then(({data}:{data:any})=>{if(on&&data?.signedUrl)setSrc(data.signedUrl)});return()=>{on=false}},[p.path,p.dataUrl]);
  return <figure style={{position:"relative",margin:0}}>{src?<a href={src} target="_blank" rel="noreferrer"><img src={src} alt="" style={{width:big?200:96,height:big?200:96,objectFit:"cover",borderRadius:12,border:"1px solid #d0d5dd"}}/></a>:<div style={{width:big?200:96,height:big?200:96,borderRadius:12,background:"#eef2f7"}}/>}<button onClick={onRemove} style={{position:"absolute",top:-6,right:-6,width:24,height:24,borderRadius:12,background:"#fff0ee",color:"#b42318",fontWeight:800}}>×</button></figure>;
}

// Поля з локальним буфером: батьківський стан оновлюється, коли поле втрачає фокус (або Enter).
// Інакше на iPhone кожна цифра перемальовує весь екран і клавіатура «скидає» поле.
function BInput({value,onCommit,...rest}:{value:string;onCommit:(v:string)=>void}&Omit<React.InputHTMLAttributes<HTMLInputElement>,"value"|"onChange">){
  const [v,setV]=useState(value);const [focus,setFocus]=useState(false);
  useEffect(()=>{if(!focus)setV(value)},[value,focus]);
  return <input {...rest} value={v} onChange={e=>setV(e.target.value)} onFocus={()=>setFocus(true)}
    onBlur={()=>{setFocus(false);if(v!==value)onCommit(v)}} onKeyDown={e=>{if(e.key==="Enter")(e.target as HTMLInputElement).blur()}}/>;
}
function BTextarea({value,onCommit,...rest}:{value:string;onCommit:(v:string)=>void}&Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>,"value"|"onChange">){
  const [v,setV]=useState(value);const [focus,setFocus]=useState(false);
  useEffect(()=>{if(!focus)setV(value)},[value,focus]);
  return <textarea {...rest} value={v} onChange={e=>setV(e.target.value)} onFocus={()=>setFocus(true)} onBlur={()=>{setFocus(false);if(v!==value)onCommit(v)}}/>;
}
// поле розміру в дюймах з дробами; поруч — як програма це зрозуміла
function DimInput({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){
  const [live,setLive]=useState(value);
  useEffect(()=>setLive(value),[value]);
  const v=parseInches(live);
  return <label>{label}<BInput inputMode="decimal" placeholder='напр. 70 або 7 15/16' value={value} onCommit={onChange} onInput={e=>setLive((e.target as HTMLInputElement).value)} style={live&&v===null?{borderColor:"#f04438"}:undefined}/>
    <small className="muted" style={{fontWeight:400}}>{live?(v!==null?`= ${fmtInches(v)} = ${Math.round(v/12*100)/100} ft`:"не зрозумів — пиши дюйми: 70, 7 3/4"):"дюйми"}</small></label>;
}

export default function SurveyEditor({survey,user,clientId,tasks,onChange,onBack,onToEstimate}:{
  survey:Survey;user:User|null;clientId:string;tasks:CalcTask[];
  onChange:(s:Survey)=>void;onBack:()=>void;onToEstimate:(s:Survey)=>void;
}){
  const [msg,setMsg]=useState("");
  const [busyRoom,setBusyRoom]=useState("");
  const [recRoom,setRecRoom]=useState("");
  const fileRef=useRef<HTMLInputElement|null>(null);
  const camRef=useRef<HTMLInputElement|null>(null);
  const targetRoom=useRef("");
  const recRef=useRef<MediaRecorder|null>(null);
  const chunks=useRef<Blob[]>([]);
  const sRef=useRef(survey);sRef.current=survey;

  const save=(patch:Partial<Survey>)=>onChange({...sRef.current,...patch,updatedAt:new Date().toISOString()});
  const setRoom=(id:string,patch:Partial<Room>)=>save({rooms:sRef.current.rooms.map(r=>r.id===id?{...r,...patch}:r)});

  async function addPhotos(files:FileList|null){
    const rid=targetRoom.current;const room=sRef.current.rooms.find(r=>r.id===rid);
    if(!room||!files?.length)return;
    setBusyRoom(rid);setMsg("");
    const added:SurveyPhoto[]=[];
    for(const f of Array.from(files).slice(0,8)){
      try{
        const p=await prepareJobPhoto(f);
        const id=uid();
        let saved=false;
        if(user){
          const path=`${user.id}/surveys/${sRef.current.id}/${rid}/${id}.jpg`;
          const {error}=await supabase.storage.from(BUCKET).upload(path,dataUrlToBlob(p.dataUrl),{contentType:"image/jpeg",upsert:true});
          if(!error){added.push({id,path});saved=true}
        }
        if(!saved)added.push({id,dataUrl:await shrinkImage(p.dataUrl,900,.6)});
      }catch(e){setMsg(e instanceof Error?e.message:String(e))}
    }
    const cur=sRef.current.rooms.find(r=>r.id===rid);
    if(cur)setRoom(rid,{photos:[...cur.photos,...added]});
    setBusyRoom("");
    if(fileRef.current)fileRef.current.value="";if(camRef.current)camRef.current.value="";
  }
  function removePhoto(rid:string,p:SurveyPhoto){
    if(!confirm("Видалити фото?"))return;
    const room=sRef.current.rooms.find(r=>r.id===rid);if(!room)return;
    setRoom(rid,{photos:room.photos.filter(x=>x.id!==p.id)});
    if(p.path&&user)supabase.storage.from(BUCKET).remove([p.path]).then(()=>{});
  }

  // голосова нотатка → текст (той самий /api/transcribe, що в калькуляторі)
  async function toggleRec(rid:string){
    if(recRoom===rid){recRef.current?.stop();return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=["audio/mp4","audio/webm;codecs=opus","audio/webm"].find(m=>MediaRecorder.isTypeSupported(m))||"";
      const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      chunks.current=[];recRef.current=rec;setRecRoom(rid);
      rec.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};
      rec.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());setRecRoom("");
        const blob=new Blob(chunks.current,{type:rec.mimeType||"audio/mp4"});
        if(blob.size<800){setMsg("Запис надто короткий.");return}
        setBusyRoom(rid);
        try{
          const ext=(rec.mimeType||"").includes("webm")?"webm":"mp4";
          const form=new FormData();form.append("audio",blob,`voice.${ext}`);
          const r=await fetch("/api/transcribe",{method:"POST",body:form});const d=await r.json();
          if(!r.ok)throw new Error(d?.error||"Не вдалося розпізнати");
          const t=String(d.text||"").trim();
          const room=sRef.current.rooms.find(x=>x.id===rid);
          if(t&&room)setRoom(rid,{notes:[room.notes.trim(),t].filter(Boolean).join(" ")});
        }catch(e){setMsg(e instanceof Error?e.message:String(e))}
        finally{setBusyRoom("")}
      };
      rec.start();
    }catch{setMsg("Немає доступу до мікрофона. Дозволь у Налаштування → Safari → Мікрофон.")}
  }

  const [renderingRoom,setRenderingRoom]=useState("");
  // опис стін для AI: довжини і прорізи (зі скану або ручні) — щоб він розставляв по правильних стінах
  function roomLayout(room:Room){
    const L=parseInches(room.length)||0,W=parseInches(room.width)||0,H=parseInches(room.height)||0;
    const lens:Record<string,number>={A:L,B:W,C:L,D:W};const from:Record<string,string>={A:"from corner A/D (left) to corner A/B (right)",B:"from corner A/B (top) to corner B/C (bottom)",C:"from corner B/C (right) to corner C/D (left)",D:"from corner C/D (bottom) to corner A/D (top)"};
    const lines=["A","B","C","D"].map(wl=>{const ops=(room.openings||[]).filter(o=>(o.wall||"A")===wl).map(o=>{const ow=parseInches(o.w)||0;const at=typeof o.t==="number"?Math.round(o.t*Math.max(0,lens[wl]-ow)):null;return `${/двер|door/i.test(o.name)?"door":/проріз|opening/i.test(o.name)?"open passage (no door)":"window"} ${o.w}"×${o.h}"${at!==null?` starting ${at}" along the wall`:""}`});
      return `Wall ${wl}: ${Math.round(lens[wl])}" long, measured ${from[wl]}; ${ops.length?ops.join(", "):"no openings"}.`});
    const views=[...room.photos.filter(x=>x.view),...room.photos.filter(x=>!x.view)].slice(0,24).map((p,i)=>p.view?`Photo ${i+1} faces wall ${p.view.facing} (EXACT, measured by LiDAR; camera at ${p.view.x}" from wall D, ${p.view.y}" from wall A).`:"").filter(Boolean);
    const known=(room.fixtures||[]).filter(f=>f.fromScan).map(f=>`${f.label||f.type} on wall ${f.wall}`);
    return `Room ${Math.round(L)}"×${Math.round(W)}", ceiling ${Math.round(H)}". `+lines.join(" ")+(views.length?" "+views.join(" ")+" For these photos do NOT guess the wall — use the given one.":"")+(known.length?` Already placed precisely by the LiDAR scan (do NOT return these again): ${known.join("; ")}. Return only items that are NOT in this list (e.g. plants, rugs, lamps, wall AC, curtains, radiators, lights, mirrors, towel bars).`:"");
  }
  // 📡 LiDAR-скан з iPhone: веб створює токен → відкриває додаток QuoteCraft Scan → чекає payload у scan_inbox
  const [scanWait,setScanWait]=useState<{rid:string;token:string;pin:string}|null>(null);
  const [scanMsg,setScanMsg]=useState("");
  const scanTimer=useRef<ReturnType<typeof setInterval>|null>(null);
  function stopScanWait(){if(scanTimer.current)clearInterval(scanTimer.current);scanTimer.current=null;setScanWait(null)}
  async function startScan(rid:string){
    setScanMsg("");
    if(!user){setScanMsg("Увійди в акаунт, щоб приймати скани.");return}
    setScanMsg("Готую посилання…");
    const token=crypto.randomUUID().replace(/-/g,"");
    const pin=String(Math.floor(100000+Math.random()*900000));
    const {error}=await supabase.from("scan_inbox").insert({token,pin,user_id:user.id,survey_id:sRef.current.id,room_id:rid});
    if(error){setScanMsg("Скан: "+error.message+(/scan_inbox/.test(error.message)?" (таблиця scan_inbox ще не створена)":""));return}
    setScanWait({rid,token,pin});setScanMsg("");
    const started=Date.now();
    scanTimer.current=setInterval(async()=>{
      if(Date.now()-started>20*60e3){stopScanWait();setMsg("Скан не прийшов за 20 хв — спробуй ще раз.");return}
      const {data}=await supabase.from("scan_inbox").select("payload").eq("token",token).maybeSingle();
      if(data?.payload){
        stopScanWait();
        try{
          const cur=sRef.current.rooms.find(x=>x.id===rid);if(!cur)return;
          const {note,...patch}=importScan(data.payload as ScanPayload,cur);
          setRoom(rid,patch);setMsg("✅ "+note+((patch.photos||[]).some(x=>x.view)?" · розставляю решту з кадрів…":""));
          if((patch.photos||[]).some(x=>x.view))setTimeout(()=>makePlan(rid,"uk",true),1500);
        }catch(e){setMsg("Скан: "+(e instanceof Error?e.message:String(e)))}
        supabase.from("scan_inbox").delete().eq("token",token).then(()=>{});
      }
    },3000);
    // Додаток відкривають вручну і вводять код. Будь-який перехід на quotecraftscan:// з домашнього веб-додатка iOS ламає сторінку («This page couldn't load»), тому автовідкриття нема.
  }
  // Скани, що прийшли, поки сторінка була закрита/зламана: підбираємо при відкритті огляду
  useEffect(()=>{
    if(!user)return;let on=true;
    (async()=>{
      const {data}=await supabase.from("scan_inbox").select("token,room_id,payload").eq("survey_id",sRef.current.id).not("payload","is",null);
      if(!on||!data?.length)return;
      let rooms=sRef.current.rooms;const notes:string[]=[];
      for(const row of data){
        const cur=rooms.find(x=>x.id===row.room_id);
        if(cur){try{const {note,...patch}=importScan(row.payload as ScanPayload,cur);rooms=rooms.map(x=>x.id===cur.id?{...x,...patch}:x);notes.push(note)}catch(e){notes.push("Скан: "+(e instanceof Error?e.message:String(e)))}}
        supabase.from("scan_inbox").delete().eq("token",row.token).then(()=>{});
      }
      if(rooms!==sRef.current.rooms)save({rooms});
      if(notes.length)setMsg("✅ "+notes.join(" · "));
      const withViews=rooms.filter(r=>data.some(row=>row.room_id===r.id)&&(r.photos||[]).some(x=>x.view));
      withViews.forEach((r,i)=>setTimeout(()=>makePlan(r.id,"uk",true),1500+i*500));
    })();
    return()=>{on=false};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id]);
  useEffect(()=>()=>{if(scanTimer.current)clearInterval(scanTimer.current)},[]);
  async function roomPhotosData(room:Room,max:number,side=1400){
    const photos:string[]=[];
    for(const p of room.photos.slice(0,max)){
      let d=p.dataUrl||"";
      if(!d&&p.path){const {data}=await supabase.storage.from(BUCKET).download(p.path);if(data)d=await new Promise<string>(ok=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result));fr.readAsDataURL(data)})}
      if(d){try{d=await shrinkImage(d,side,side<1400?.72:.8)}catch{}if(d.length<=750000)photos.push(d)}
    }
    return photos;
  }
  // 📸 Фото-рендер: 3D-ескіз (ракурс) + фото кімнати + побажання → AI-картинка «після ремонту»
  async function makeRender(rid:string,sketchPng:string,view?:string,aspect?:number){
    const room=sRef.current.rooms.find(r=>r.id===rid);if(!room)return;
    setRenderingRoom(rid);setMsg("");
    try{
      const photos=await roomPhotosData(room,1);
      // для AI — англійською, з розмірами; «Інше» — за підписом (ТВ, ліжко…)
      const EN:Record<string,string>={toilet:"toilet",vanity:"bathroom vanity cabinet with sink",sink:"sink",tub:"bathtub",shower:"shower",washer:"washing machine",dryer:"dryer",fan:"ceiling fan",light:"ceiling light",heater:"radiator",cabinet:"cabinet",mirror:"mirror",vanityLight:"vanity light bar above the mirror",towelBar:"towel bar"};
      const LBL:[RegExp,string][]=[[/тумба під тв|тв-тумба|tv stand|media console/i,"low TV stand / media console"],[/комод|dresser/i,"dresser"],[/кутов|секц|sectional/i,"sectional sofa section"],[/диван|sofa|couch/i,"sofa"],[/крісло|armchair/i,"armchair"],[/тв|tv|телев/i,"TV"],[/ліжко|bed/i,"bed"],[/журнальн|coffee/i,"coffee table"],[/стіл|table|desk/i,"table"],[/стілець|chair/i,"chair"],[/рослин|вазон|plant/i,"large potted plant"],[/килим|rug|carpet/i,"area rug"],[/торшер|floor lamp/i,"floor lamp"],[/кондиц|air cond/i,"wall-mounted air conditioner unit"],[/радіатор|heater|плінтусн/i,"baseboard heater"],[/штор|curtain/i,"curtains"],[/полиц|shelf|book/i,"bookshelf"],[/холод|refrig/i,"refrigerator"],[/плит|stove/i,"stove"],[/духов|oven/i,"oven"],[/посудом|dish/i,"dishwasher"],[/камін|fire/i,"fireplace"],[/сходи|stair/i,"stairs"],[/світильник|люстр|light/i,"ceiling light"],[/шаф|storage|closet/i,"storage cabinet"]];
      const MV:Record<string,string>={"m-one":"modern one-piece skirted toilet","m-hung":"wall-hung toilet with in-wall tank and flush plate","m-float":"modern floating wall-mounted wood vanity with quartz top and undermount sink, matte black faucet","m-vessel":"floating wood vanity with quartz top and vessel sink, tall matte black faucet","m-floor":"modern wood vanity on slim black legs with quartz top","m-wallsink":"wall-hung modern sink","m-free":"freestanding oval soaking tub with floor-mounted black filler","m-alcove":"built-in alcove tub","m-walk":"curbless walk-in shower with frameless glass panel, black rain shower head, linear drain","m-door":"glass shower enclosure with black frame and door","m-washer":"modern front-load washer","m-stack":"stacked front-load washer and dryer","m-dryer":"modern dryer","m-base":"flat-panel base cabinets with slim black pulls","m-upper":"flat-panel wall cabinets","m-tall":"tall flat-panel pantry cabinet","m-disk":"slim LED flush ceiling light","m-pendant":"black dome pendant light","m-fan":"modern ceiling fan with LED light","m-roundled":"round backlit LED mirror","m-rectled":"rectangular backlit LED mirror","m-roundblack":"round mirror with thin black frame","m-linear":"linear black LED vanity light bar","m-globes":"brass wall sconces with white glass globes","m-bar":"matte black towel bar","m-ring":"matte black towel ring","m-panel":"flat white panel radiator",vanityDrawer:"cabinet vanity",sinkSquare:"wall-hung square sink",pedestal:"pedestal sink",showerSquare:"square shower stall",showerRound:"corner rounded shower",stacked:"stacked washer+dryer",upper:"wall cabinet",tall:"tall cabinet",round:"round mirror",rect:"rectangular mirror",framed:"framed mirror cabinet"};
      const fixtures=(room.fixtures||[]).map(f=>{const lab=f.label||"";const en=f.type==="other"?(LBL.find(([re])=>re.test(lab))?.[1]||(lab?`"${lab}"`:"item")):(EN[f.type]||f.type);const mv=f.model&&MV[f.model]?` (${MV[f.model]})`:"";const L=parseInches(room.length)||0,W=parseInches(room.width)||0;const wl=f.wall==="A"||f.wall==="C"?L:W;const start=Math.round((f.t||0)*Math.max(0,wl-f.w));
        return `${en}${mv} ${Math.round(f.w)}" wide${f.h?`, ${Math.round(f.h)}" tall`:""}${f.y?`, mounted with its bottom ${Math.round(f.y)}" above the floor`:" standing on the floor"} against wall ${f.wall}, ${start}" from the wall's start corner`}).join("; ");
      const tile=room.floorTile?`${room.floorTile.w}×${room.floorTile.h} in`:"";
      const openings=room.openings.map(o=>`${/вікно|window/i.test(o.name)?"window":/проріз|opening/i.test(o.name)?"open passage (no door)":"door"} ${o.w}×${o.h} in on wall ${o.wall||"?"}`).join(", ");
      const look=room.look?Object.entries(room.look).filter(([,v])=>v).map(([k,v])=>`${k} ${v}`).join(", "):"";
      // тип кімнати для AI: спочатку по тому, що в ній стоїть, потім по назві
      const types=new Set((room.fixtures||[]).map(f=>f.type));const labels=(room.fixtures||[]).map(f=>f.label||"").join(" ").toLowerCase();
      const kind=types.has("toilet")||types.has("tub")||types.has("shower")?"bathroom":/плит|холод|духов|stove|refrig|oven/.test(labels)?"kitchen":/ліжко|bed/.test(labels)?"bedroom":/диван|sofa|тв|tv/.test(labels)?"living room":types.has("washer")||types.has("dryer")?"laundry room":
        /ванн|bath/i.test(room.name)?"bathroom":/кухн|kitchen/i.test(room.name)?"kitchen":/спальн|bedroom/i.test(room.name)?"bedroom":/вітальн|living/i.test(room.name)?"living room":/коридор|hall/i.test(room.name)?"hallway":/туалет|powder/i.test(room.name)?"powder room":"room";
      const r=await fetch("/api/render",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sketch:sketchPng,view:view||"",aspect:aspect||1,photos,room:room.name||"",kind,wish:room.renderWish||"",fixtures,tile,openings,look}),signal:AbortSignal.timeout(90000)});
      const d=await r.json();if(!r.ok)throw new Error(d?.error||"Render error");
      const id=uid();let item:SurveyPhoto={id,dataUrl:d.image};
      if(user){
        const path=`${user.id}/surveys/${sRef.current.id}/${rid}/render-${id}.png`;
        const {error}=await supabase.storage.from(BUCKET).upload(path,dataUrlToBlob(d.image),{contentType:"image/png",upsert:true});
        if(!error)item={id,path};
      }
      const cur=sRef.current.rooms.find(x=>x.id===rid);if(!cur)return;
      setRoom(rid,{renders:[...(cur.renders||[]),item]});
    }catch(e){setMsg("Рендер: "+(e instanceof Error?e.message:String(e)))}
    finally{setRenderingRoom("")}
  }
  function removeRender(rid:string,p:SurveyPhoto){
    if(!confirm("Видалити рендер?"))return;
    const room=sRef.current.rooms.find(r=>r.id===rid);if(!room)return;
    setRoom(rid,{renders:(room.renders||[]).filter(x=>x.id!==p.id)});
    if(p.path&&user)supabase.storage.from(BUCKET).remove([p.path]).then(()=>{});
  }

  async function makePlan(rid:string,lang:"uk"|"en"="uk",sceneOnly=false){
    const room=sRef.current.rooms.find(r=>r.id===rid);if(!room)return;
    if(sceneOnly&&!room.photos.length){setMsg("Спочатку додай фото кімнати.");return}
    if(!sceneOnly&&!room.notes.trim()&&!room.photos.length){setMsg("Додай фото або напиши/наговори, що треба зробити.");return}
    setBusyRoom(rid);setMsg("");
    try{
      const all=[...room.photos.filter(x=>x.view),...room.photos.filter(x=>!x.view)];const pick=all.length>24?Array.from({length:24},(_,i)=>all[Math.floor(i*all.length/24)]):all;const ordered={...room,photos:pick};
      const photos=sceneOnly?await roomPhotosData(ordered,24,ordered.photos.length>12?768:1000):await roomPhotosData(room,6);
      const r=await fetch("/api/room-plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({room:room.name,areas:roomAreas(room),notes:room.notes,photos,lang,mode:sceneOnly?"scene":"plan",layout:roomLayout(sceneOnly?ordered:room),tasks:tasks.map(t=>({id:t.id,name:t.name,unit:t.unit,category:t.category}))}),signal:AbortSignal.timeout(130000)});
      const d=await r.json();if(!r.ok)throw new Error(d?.error||"AI error");
      const cur=sRef.current.rooms.find(x=>x.id===rid);if(!cur)return;
      if(lang==="en"&&cur.plan)setRoom(rid,{plan:{...cur.plan,en:{summary:d.summary,tasks:d.tasks}}});
      else{
        const seen=(Array.isArray(d.fixtures)?d.fixtures:[]) as {type:string;label?:string;wall:string;t:number;off?:number;style?:string;w?:number;d?:number;h?:number;y?:number;note:string}[];
        // сантехніка з фото: додаємо тільки ті типи, яких ще нема (ручні не чіпаємо); у режимі «розставити з фото» — замінюємо всі, що були з фото
        const keep=sceneOnly?(cur.fixtures||[]).filter(f=>!f.fromPhoto):(cur.fixtures||[]);
        const have=new Set(keep.map(f=>f.type+"|"+(f.label||"")));
        const num=(v:unknown,lo:number,hi:number)=>{const n=Number(v);return Number.isFinite(n)&&n>=lo&&n<=hi?Math.round(n*2)/2:undefined};
        const tiny=(f:{type:string;label?:string;w?:number;d?:number;h?:number})=>f.type==="other"&&((Number(f.w)||99)<10&&(Number(f.h)||99)<10||/розетк|вимикач|outlet|switch/i.test(f.label||""));
        const added:Fixture[]=seen.filter(f=>FIXTURES[f.type]&&!tiny(f)&&!have.has(f.type+"|"+(f.label||""))).map(f=>{const w=num(f.w,4,240)??FIXTURES[f.type].w;const dd=num(f.d,1,120)??FIXTURES[f.type].d;const h=num(f.h,1,110);const y=num(f.y,1,110);const off=num(f.off,1,200);
          return {id:crypto.randomUUID(),type:f.type,wall:/^[ABCD]$/.test(f.wall)?f.wall:"A",t:Math.max(0,Math.min(1,Number(f.t)||0.5)),w,d:dd,fromPhoto:true,...(f.type==="other"&&f.label?{label:String(f.label).slice(0,30)}:{}),...(h?{h}:{}),...(y?{y}:{}),...(off?{off}:{}),...(f.style&&FIXTURE_MODELS[f.type]?.some(v=>v.id===f.style)?{model:f.style}:{})}});
        const tile=d.floorTile&&Number(d.floorTile.w)>0&&Number(d.floorTile.h)>0?{w:Number(d.floorTile.w),h:Number(d.floorTile.h)}:cur.floorTile||null;
        const hex=(v:unknown)=>typeof v==="string"&&/^#[0-9a-fA-F]{6}$/.test(v)?v:undefined;
        const look={...(cur.look||{}),...(hex(d.look?.wall)?{wall:hex(d.look.wall)}:{}),...(hex(d.look?.floor)?{floor:hex(d.look.floor)}:{}),...(hex(d.look?.vanity)?{vanity:hex(d.look.vanity)}:{})};
        if(sceneOnly)setRoom(rid,{fixtures:[...keep,...added],floorTile:tile,look});
        else setRoom(rid,{plan:{summary:d.summary,condition:d.condition,tasks:d.tasks,questions:d.questions||[],createdAt:new Date().toISOString(),seen,floorTile:tile},fixtures:[...keep,...added],floorTile:tile,look});
      }
    }catch(e){setMsg((sceneOnly?"Розставити не вийшло: ":"План не вийшов: ")+(e instanceof Error?e.message:String(e)))}
    finally{setBusyRoom("")}
  }
  const setTask=(rid:string,i:number,patch:Partial<PlanTask>|null)=>{
    const room=sRef.current.rooms.find(r=>r.id===rid);if(!room?.plan)return;
    const tasksN=patch===null?room.plan.tasks.filter((_,k)=>k!==i):room.plan.tasks.map((t,k)=>k===i?{...t,...patch}:t);
    setRoom(rid,{plan:{...room.plan,tasks:tasksN}});
  };

  const ready=survey.rooms.some(r=>r.plan?.tasks.length||r.notes.trim());
  return <>
    <div className="screenbar noPrint"><button onClick={onBack}>← Клієнт</button><b>📋 Огляд</b><span/></div>
    <section className="panel grid">
      <label>Назва<BInput value={survey.title} onCommit={v=>save({title:v})}/></label>
      <label>Дата<BInput value={survey.date} onCommit={v=>save({date:v})}/></label>
      <label className="wide">Адреса об'єкта<BInput value={survey.address||""} onCommit={v=>save({address:v})}/></label>
    </section>

    {survey.rooms.map((r,idx)=>{
      const a=roomAreas(r);const busy=busyRoom===r.id;
      return <section className="panel" key={r.id}>
        <div className="head"><BInput value={r.name} placeholder={`Кімната ${idx+1}`} onCommit={v=>setRoom(r.id,{name:v})} style={{fontWeight:800,fontSize:17,border:0,padding:"4px 0",background:"transparent"}}/>
          <button className="remove" onClick={()=>{if(confirm(`Прибрати «${r.name||"кімнату"}»?`))save({rooms:survey.rooms.filter(x=>x.id!==r.id)})}}>×</button></div>

        <div className="grid3" style={{marginTop:8}}>
          <DimInput label="Довжина" value={r.length} onChange={v=>setRoom(r.id,{length:v})}/>
          <DimInput label="Ширина" value={r.width} onChange={v=>setRoom(r.id,{width:v})}/>
          <DimInput label="Висота" value={r.height} onChange={v=>setRoom(r.id,{height:v})}/>
        </div>
        {(()=>{const v=[r.length,r.width,r.height].map(x=>parseInches(x)||0);if(!v.some(x=>x>0&&x<30))return null;
          // розміри схожі на фути (8.58 замість 103") → план і 3D розвалюються, бо все рахується в дюймах
          const ft=(x:string)=>{const n=parseInches(x);return n&&n<30?String(Math.round(n*12*2)/2):x};
          return <div style={{marginTop:8,padding:"8px 10px",background:"#fffaeb",border:"1px solid #fedf89",borderRadius:12,fontSize:13}}>
            ⚠️ Розміри схожі на <b>фути</b> ({r.length} × {r.width} × {r.height}), а програма рахує в <b>дюймах</b> — тому план і 3D розвалюються.
            <button type="button" style={{display:"block",marginTop:6,padding:"6px 10px",borderRadius:10,fontWeight:800,background:"#f79009",color:"#fff"}}
              onClick={()=>setRoom(r.id,{length:ft(r.length),width:ft(r.width),height:ft(r.height),parts:(r.parts||[]).map(p=>({...p,length:ft(p.length),depth:ft(p.depth)}))})}>Перевести фути → дюйми</button>
          </div>})()}
        <details style={{marginTop:8}} open={!!r.parts?.length}>
          <summary style={{fontSize:13,color:"#175cd3",fontWeight:700}}>Нестандартна форма (ніша, короб чи шафа в кутку)</summary>
          <small className="muted">Головний прямокутник — вище. Тут додай ділянки: <b>ніша/виступ</b> — додається до підлоги й стін; <b>вирізаний кут</b> (Г-подібна кімната) — віднімається від підлоги.</small>
          {(r.parts||[]).map(p=>{const setP=(patch:Partial<Part>)=>setRoom(r.id,{parts:(r.parts||[]).map(x=>x.id===p.id?{...x,...patch}:x)});
            return <div key={p.id} style={{marginTop:8,padding:8,background:"#f8fafc",borderRadius:10}}>
            <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 84px 84px 36px",gap:6,alignItems:"end"}}>
              <label>Що<select value={p.kind} onChange={e=>setP({kind:e.target.value as "add"|"cut",wall:undefined})}><option value="add">Ніша назовні — кімната більша (+)</option><option value="cut">Короб / шафа в кутку — кімната менша (−)</option></select></label>
              <label>Довжина<BInput inputMode="decimal" placeholder="дюйми" value={p.length} onCommit={v=>setP({length:v})}/></label>
              <label>Глибина<BInput inputMode="decimal" placeholder="дюйми" value={p.depth} onCommit={v=>setP({depth:v})}/></label>
              <button className="remove" onClick={()=>setRoom(r.id,{parts:(r.parts||[]).filter(x=>x.id!==p.id)})}>×</button>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6,alignItems:"center",fontSize:13}}>
              {p.kind==="cut"?<><span className="muted">Який кут:</span><select value={p.wall||"AB"} onChange={e=>setP({wall:e.target.value})} style={{width:"auto",padding:"6px 8px"}}><option value="AB">верх-право (A/B)</option><option value="BC">низ-право (B/C)</option><option value="CD">низ-ліво (C/D)</option><option value="DA">верх-ліво (D/A)</option></select></>
              :<><span className="muted">На стіні:</span><select value={p.wall||"A"} onChange={e=>setP({wall:e.target.value})} style={{width:"auto",padding:"6px 8px"}}><option value="A">A (верх)</option><option value="B">B (право)</option><option value="C">C (низ)</option><option value="D">D (ліво)</option></select>
                <select value={p.pos||"end"} onChange={e=>setP({pos:e.target.value})} style={{width:"auto",padding:"6px 8px"}}><option value="start">на початку</option><option value="middle">по середині</option><option value="end">в кінці</option></select></>}
              <BInput placeholder="назва (душ, шафа)" value={p.name} onCommit={v=>setP({name:v})} style={{width:140,padding:"6px 8px"}}/>
            </div>
          </div>})}
          <button className="secondary" style={{marginTop:8,padding:"6px 10px",fontSize:13}} onClick={()=>setRoom(r.id,{parts:[...(r.parts||[]),{id:uid(),name:"",kind:"add",length:"",depth:""}]})}>＋ Ділянка</button>
        </details>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8,alignItems:"center"}}>
          <small className="muted">Прорізи:</small>
          {r.openings.map(o=><span key={o.id} style={{display:"inline-flex",gap:4,alignItems:"center",background:"#eef2f7",borderRadius:10,padding:"4px 8px",fontSize:13}}>{o.name} {o.w}×{o.h}{o.count>1?` ×${o.count}`:""}<button onClick={()=>setRoom(r.id,{openings:r.openings.filter(x=>x.id!==o.id)})} style={{background:"transparent",color:"#b42318",padding:"0 4px"}}>×</button></span>)}
          <button className="secondary" style={{padding:"5px 10px",fontSize:13}} onClick={()=>setRoom(r.id,{openings:[...r.openings,{id:uid(),...DOOR,count:1}]})}>＋ Двері</button>
          <button className="secondary" style={{padding:"5px 10px",fontSize:13}} onClick={()=>setRoom(r.id,{openings:[...r.openings,{id:uid(),...WINDOW,count:1}]})}>＋ Вікно</button>
          <button className="secondary" style={{padding:"5px 10px",fontSize:13}} onClick={()=>{const w=prompt("Ширина прорізу, дюйми:","30");const h=w&&prompt("Висота, дюйми:","80");if(w&&h)setRoom(r.id,{openings:[...r.openings,{id:uid(),name:"Проріз",w,h,count:1}]})}}>＋ Свій</button>
        </div>
        {a.floorSqft!==null&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginTop:10}}>
          {[["Підлога",a.floorSqft,"sq ft"],["Стіни",a.wallsSqft,"sq ft"],["Стеля",a.ceilingSqft,"sq ft"],["Периметр",a.perimeterFt,"lin ft"]].map(([k,v,u])=><div key={String(k)} className="linetotal"><span>{k}</span><b>{v===null?"—":`${v} ${u}`}</b></div>)}
        </div>}
        {a.wallsSqft!==null&&a.openingsSqft>0&&<small className="muted">стіни без прорізів (−{a.openingsSqft} sq ft)</small>}
        <RoomSketch room={r} onOpening={(id,patch)=>setRoom(r.id,{openings:r.openings.map(o=>o.id===id?{...o,...patch}:o)})} onPart={(id,patch)=>setRoom(r.id,{parts:(r.parts||[]).map(x=>x.id===id?{...x,...patch}:x)})} onFixture={(id,patch)=>{const list=r.fixtures||[];if(patch===null)setRoom(r.id,{fixtures:list.filter(x=>x.id!==id)});else if(list.some(x=>x.id===id))setRoom(r.id,{fixtures:list.map(x=>x.id===id?{...x,...patch}:x)});else setRoom(r.id,{fixtures:[...list,patch as Fixture]})}} onRender={(png,view,aspect)=>makeRender(r.id,png,view,aspect)} rendering={renderingRoom===r.id}/>
        <div style={{marginTop:8}}>
          <label>📸 Побажання до фото-рендеру (плитка, кольори, стиль — українською можна)</label>
          <BInput value={r.renderWish||""} onCommit={v=>setRoom(r.id,{renderWish:v})} placeholder="напр.: плитка 12×24 сіра під бетон, біла тумба, чорні крани, LED-дзеркало"/>
          {renderingRoom===r.id&&<div className="muted" style={{fontSize:12,marginTop:4}}>⏳ Малюю… зазвичай 20–40 секунд.</div>}
          {!!(r.renders||[]).length&&<div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:8}}>{(r.renders||[]).map(p=><Thumb key={p.id} p={p} onRemove={()=>removeRender(r.id,p)} big/>)}</div>}
        </div>

        <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"12px 0"}}>
          {r.photos.map(p=><Thumb key={p.id} p={p} onRemove={()=>removePhoto(r.id,p)}/>)}
        </div>
        <div className="actions" style={{flexWrap:"wrap"}}>
          <button className="primary" disabled={busy} onClick={()=>{targetRoom.current=r.id;camRef.current?.click()}}>📷 Фото</button>
          <button className="secondary" disabled={busy} onClick={()=>{targetRoom.current=r.id;fileRef.current?.click()}}>🖼 З галереї</button>
          <button className="secondary" disabled={busy||!!scanWait} onClick={()=>startScan(r.id)} title="Відкриває додаток QuoteCraft Scan на iPhone (LiDAR). Після сканування розміри, двері/вікна і сантехніка з'являться тут самі.">📡 Сканувати LiDAR</button>
          {scanMsg&&<span className="muted" style={{fontSize:12,alignSelf:"center",color:/Скан:|Увійди/.test(scanMsg)?"#b42318":undefined}}>{scanMsg}</span>}
          {scanWait?.rid===r.id&&<div style={{flexBasis:"100%",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",fontSize:13,background:"#eef2ff",border:"1px solid #c7d2fe",borderRadius:12,padding:"8px 10px"}}>
            <div style={{flex:1,minWidth:200}}>
              <div>Відкрий на iPhone <b>QuoteCraft Scan</b> — він сам побачить цю кімнату. Скануй → «Відправити» → повернись сюди.</div>
              <div className="muted" style={{fontSize:12,marginTop:4}}>Перший раз (прив'язка iPhone) — введи там код: <b style={{fontSize:18,letterSpacing:3,color:"#1d4ed8"}}>{scanWait.pin.slice(0,3)} {scanWait.pin.slice(3)}</b></div>
              <div className="muted" style={{fontSize:12}}>⏳ Чекаю скан… заявка діє 20 хв.</div>
            </div>
            <button type="button" onClick={stopScanWait} style={{background:"transparent",color:"#b42318",fontWeight:700}}>скасувати</button>
          </div>}
          {!!r.photos.length&&<button className="secondary" disabled={busy} onClick={()=>makePlan(r.id,"uk",true)} title="AI подивиться фото і розставить сантехніку, дзеркало, світло, кольори стін і підлоги на план і 3D">{busy?"Дивлюсь…":"🏠 Розставити з фото"}</button>}
          <button className="secondary" disabled={busy&&recRoom!==r.id} onClick={()=>toggleRec(r.id)} style={recRoom===r.id?{background:"#fee4e2",color:"#b42318"}:undefined}>{recRoom===r.id?"⏹ Стоп":"🎙 Наговорити"}</button>
        </div>
        <label style={{marginTop:8}}>Що треба зробити (українською)<BTextarea rows={3} value={r.notes} placeholder="зняти стару плитку, нова ванна, плитка на стіни до стелі, вентилятор, фарбування" onCommit={v=>setRoom(r.id,{notes:v})}/></label>
        <div className="actions" style={{marginTop:8}}>
          <button className="primary" disabled={busy} onClick={()=>makePlan(r.id)}>{busy?"Думаю…":r.plan?"🔄 Скласти план заново":"🧠 Скласти план робіт"}</button>
        </div>

        {r.plan&&<div style={{marginTop:12,padding:12,borderRadius:14,background:"#f8fafc",border:"1px solid #e4e7ec"}}>
          <p style={{margin:0,fontWeight:700}}>{r.plan.summary}</p>
          {r.plan.condition&&<p className="muted" style={{fontSize:14,margin:"6px 0 0"}}><b>Що є зараз:</b> {r.plan.condition}</p>}
          <div style={{marginTop:10}}>
            {r.plan.tasks.map((t,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 72px 64px 36px",gap:6,marginTop:6,alignItems:"start"}}>
              <div><BInput value={t.name} onCommit={v=>setTask(r.id,i,{name:v})}/>{(t.basis||t.note)&&<small className="muted">{[t.basis,t.note].filter(Boolean).join(" · ")}</small>}</div>
              <BInput type="number" step="0.5" value={String(t.qty)} onCommit={v=>setTask(r.id,i,{qty:Number(v)||0})}/>
              <select value={t.unit} onChange={e=>setTask(r.id,i,{unit:e.target.value})}>{Object.entries(UNIT).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
              <button className="remove" onClick={()=>setTask(r.id,i,null)}>×</button>
            </div>)}
            <button className="secondary" style={{marginTop:8,padding:"6px 10px",fontSize:13}} onClick={()=>setRoom(r.id,{plan:{...r.plan!,tasks:[...r.plan!.tasks,{name:"",qty:1,unit:"each",basis:"вручну"}]}})}>＋ Рядок</button>
          </div>
          {r.plan.questions?.length>0&&<div style={{marginTop:10,padding:8,background:"#fffaeb",borderRadius:10,fontSize:14}}><b>Уточнити:</b><ul style={{margin:"4px 0 0",paddingLeft:18}}>{r.plan.questions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>}
          <div className="actions" style={{marginTop:10}}>
            <button className="secondary" disabled={busy} onClick={()=>makePlan(r.id,"en")}>🌐 {r.plan.en?"Оновити англійську":"Англійською для клієнта"}</button>
          </div>
          {r.plan.en&&<details style={{marginTop:8}}><summary style={{fontSize:13}}>English version</summary><p style={{fontSize:14}}>{r.plan.en.summary}</p><ul style={{fontSize:14,paddingLeft:18}}>{r.plan.en.tasks.map((t,i)=><li key={i}>{t.name} — {t.qty} {t.unit}</li>)}</ul></details>}
        </div>}
      </section>;
    })}

    <div className="actions"><button className="secondary" onClick={()=>save({rooms:[...survey.rooms,newRoom(`Кімната ${survey.rooms.length+1}`)]})}>＋ Ще кімната</button></div>
    <section className="panel"><label>Загальні нотатки по об'єкту<BTextarea rows={2} value={survey.notes} onCommit={v=>save({notes:v})} placeholder="паркування, доступ, що купує клієнт, терміни"/></label></section>
    {msg&&<p className="muted" style={{margin:"0 4px 10px"}}>{msg}</p>}
    <div className="actions noPrint"><button className="primary huge" disabled={!ready} onClick={()=>onToEstimate(survey)}>🧮 В естімейт — усі кімнати</button></div>
    <small className="muted" style={{display:"block",margin:"6px 4px 16px"}}>Кімнати з планом підуть у калькулятор з кількостями з розмірів. Без плану — піде твій текст «що треба зробити».</small>
    <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>addPhotos(e.target.files)}/>
    <input ref={camRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>addPhotos(e.target.files)}/>
  </>;
}
