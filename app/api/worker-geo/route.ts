import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {loadLink,workerView,type WorkerLink,type WorkerView} from "@/lib/workerView";
import {geocode} from "@/lib/geo";
import {sendPush} from "@/lib/push";

export const runtime="nodejs";
export const maxDuration=30;

// 📍 Геозони для застосунку помічника: телефон сам повідомляє «зайшов / вийшов» з об'єкта.
// GET  ?token=…                → зони (одна на адресу; id = sid-и проєктів за цією адресою)
// POST {token,id,event,at}     → enter: почати зміну · exit: закінчити й записати години у вхідні власника
const RADIUS=120;          // м: будинок + двір + машина біля дому
const REJOIN_MIN=20;       // вийшов і повернувся швидше — це та сама зміна (до машини, по матеріал)
const MIN_VISIT_MIN=10;    // коротше — проїздом, годин не пишемо
const MAX_SHIFT_H=16;      // довше — вихід не зафіксовано (телефон сів): години вписує власник
const n=(s:string)=>String(s||"").trim().toLowerCase();
const tm=(iso:string)=>new Date(iso).toLocaleTimeString("en-US",{timeZone:"America/Chicago",hour:"numeric",minute:"2-digit"});

async function coords(address:string){
  const key=n(address);if(key.length<5)return null;
  const {data}=await supabaseAdmin.from("geo_cache").select("lat,lng").eq("address",key).maybeSingle();
  if(data)return data.lat==null?null:{lat:data.lat as number,lng:data.lng as number};
  const g=await geocode(address);
  await supabaseAdmin.from("geo_cache").upsert({address:key,lat:g?.lat??null,lng:g?.lng??null});
  return g;
}
/** адреси об'єктів помічника → групи проєктів за однією адресою */
function groups(v:WorkerView){
  const m=new Map<string,{address:string;sids:string[]}>();
  for(const p of v.projects){const k=n(p.address);if(k.length<5)continue;const g=m.get(k)||{address:p.address,sids:[]};g.sids.push(p.sid);m.set(k,g)}
  return [...m.values()];
}
/** з кількох проєктів за адресою: той, що сьогодні в графіку → де працював останнім → перший */
function pickSid(v:WorkerView,sids:string[]){
  const t=v.today.find(j=>j.sid&&sids.includes(j.sid));if(t)return t.sid;
  const ps=v.projects.filter(p=>sids.includes(p.sid)&&p.days.length).sort((a,b)=>b.days[0].date.localeCompare(a.days[0].date));
  return ps[0]?.sid||sids[0];
}

export async function GET(req:NextRequest){
  const link=await loadLink(String(req.nextUrl.searchParams.get("token")||""));
  if(!link)return NextResponse.json({error:"bad link"},{status:404});
  const v=await workerView(link);
  const regions:{id:string;lat:number;lng:number;radius:number}[]=[];
  for(const g of groups(v).slice(0,20)){
    const c=await coords(g.address);
    if(c)regions.push({id:g.sids.join(","),lat:c.lat,lng:c.lng,radius:RADIUS});
  }
  return NextResponse.json({regions});
}

async function finish(link:WorkerLink,shift:any,endIso:string,who:string){
  const hrsRaw=(new Date(endIso).getTime()-new Date(shift.start_at).getTime())/3600e3;
  if(hrsRaw*60<MIN_VISIT_MIN){await supabaseAdmin.from("worker_shifts").update({end_at:endIso,hours:0}).eq("id",shift.id);return 0}
  const hours=Math.min(16,Math.round(hrsRaw*4)/4);
  const date=new Date(shift.start_at).toLocaleDateString("sv-SE",{timeZone:"America/Chicago"});
  await supabaseAdmin.from("worker_shifts").update({end_at:endIso,hours}).eq("id",shift.id);
  // один запис годин на зміну (якщо зміну «перевідкрито» — старий непереглянутий запис прибираємо нижче)
  await supabaseAdmin.from("worker_inbox").insert({token:link.token,user_id:link.user_id,worker:link.worker,sid:shift.sid,kind:"hours",
    payload:{date,hours,note:`📍 авто ${tm(shift.start_at)}–${tm(endIso)} · на місці (без обіду — перевір)`,shift:shift.id}});
  await sendPush(link.user_id,{title:`👷 ${link.worker}${who?` · ${who}`:""}`,body:`⏹ Пішов о ${tm(endIso)}: ${hours} год (${tm(shift.start_at)}–${tm(endIso)}) · 📍 авто`,url:`/?screen=pay&sid=${encodeURIComponent(shift.sid)}`,tag:`shift-${shift.id}`});
  return hours;
}

export async function POST(req:NextRequest){
  try{
    const b=await req.json();
    const link=await loadLink(String(b?.token||""));
    if(!link)return NextResponse.json({error:"bad link"},{status:404});
    const sids=String(b?.id||"").split(",").filter(x=>link.projects.includes(x));
    const event=b?.event==="enter"?"enter":b?.event==="exit"?"exit":"";
    if(!sids.length||!event)return NextResponse.json({error:"bad event"},{status:400});
    // час події з телефона (могла чекати інтернету), але не з майбутнього і не старше доби
    const now=Date.now();let at=new Date(String(b?.at||"")).getTime();
    if(!Number.isFinite(at)||at>now+60e3||at<now-24*3600e3)at=now;
    const atIso=new Date(at).toISOString();
    const v=await workerView(link);
    const name=(sid:string)=>v.projects.find(p=>p.sid===sid)?.client||"";
    const {data:openRows}=await supabaseAdmin.from("worker_shifts").select("*").eq("token",link.token).is("end_at",null).order("start_at",{ascending:false}).limit(1);
    const open=(openRows||[])[0] as any;

    if(event==="exit"){
      if(!open||!sids.includes(open.sid))return NextResponse.json({ok:true,ignored:"no open shift here"});
      if((at-new Date(open.start_at).getTime())/3600e3>MAX_SHIFT_H){
        await supabaseAdmin.from("worker_shifts").update({end_at:atIso,hours:null}).eq("id",open.id);
        await sendPush(link.user_id,{title:`👷 ${link.worker} · ${name(open.sid)}`,body:"⚠️ Зміна довша за 16 год — вихід не зафіксовано. Впиши години вручну.",url:`/?screen=pay&sid=${encodeURIComponent(open.sid)}`});
        return NextResponse.json({ok:true,stale:true});
      }
      const hours=await finish(link,open,atIso,name(open.sid));
      return NextResponse.json({ok:true,hours});
    }

    // ---- enter ----
    if(open){
      if(sids.includes(open.sid))return NextResponse.json({ok:true,ignored:"already on site"});
      // відкрита зміна на іншому об'єкті (вихід звідти не дійшов) — закриваємо її цим моментом
      if((at-new Date(open.start_at).getTime())/3600e3>MAX_SHIFT_H)await supabaseAdmin.from("worker_shifts").update({end_at:atIso,hours:null}).eq("id",open.id);
      else await finish(link,open,atIso,name(open.sid));
    }else{
      // щойно вийшов і повернувся (до машини, в магазин поруч) — продовжуємо ту саму зміну
      const {data:lastRows}=await supabaseAdmin.from("worker_shifts").select("*").eq("token",link.token).in("sid",sids).not("end_at","is",null).order("end_at",{ascending:false}).limit(1);
      const last=(lastRows||[])[0] as any;
      if(last&&last.source==="geo"&&at-new Date(last.end_at).getTime()<REJOIN_MIN*60e3){
        const {data:pend}=await supabaseAdmin.from("worker_inbox").select("id,applied_at").eq("token",link.token).eq("kind","hours").eq("payload->>shift",last.id);
        const applied=(pend||[]).some((r:any)=>r.applied_at);
        if(!applied){
          if(pend?.length)await supabaseAdmin.from("worker_inbox").delete().in("id",(pend as any[]).map(r=>r.id));
          await supabaseAdmin.from("worker_shifts").update({end_at:null,hours:null}).eq("id",last.id);
          return NextResponse.json({ok:true,rejoined:true});
        }
      }
    }
    const sid=pickSid(v,sids);
    const {data:row,error}=await supabaseAdmin.from("worker_shifts").insert({token:link.token,user_id:link.user_id,sid,worker:link.worker,start_at:atIso,start_dist_m:0,source:"geo"}).select("id").single();
    if(error)throw error;
    await sendPush(link.user_id,{title:`👷 ${link.worker}${name(sid)?` · ${name(sid)}`:""}`,body:`▶ Прибув о ${tm(atIso)} · 📍 авто`,url:`/?screen=pay&sid=${encodeURIComponent(sid)}`,tag:`shift-${row.id}`});
    return NextResponse.json({ok:true,started:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"error"},{status:500})}
}
