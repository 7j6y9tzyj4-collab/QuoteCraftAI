import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";

type Ev={title:string;start:string;end:string;time:string;location:string};

const pad=(n:number)=>String(n).padStart(2,"0");
const unfold=(t:string)=>t.replace(/\r\n/g,"\n").replace(/\n[ \t]/g,"");
const unesc=(s:string)=>s.replace(/\\n/gi," ").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\");
const isoOf=(y:number,m:number,d:number)=>`${y}-${pad(m)}-${pad(d)}`;
const addDay=(iso:string,n:number)=>{const [y,m,d]=iso.split("-").map(Number);const x=new Date(Date.UTC(y,m-1,d+n));return isoOf(x.getUTCFullYear(),x.getUTCMonth()+1,x.getUTCDate())};

// DTSTART/DTEND → {date, time, allDay}; «Z» переводимо в Chicago
function parseDt(line:string){
  const m=line.match(/^[A-Z-]+((?:;[^:]*)?):(.*)$/);if(!m)return null;
  const params=m[1]||"",v=m[2].trim();
  const allDay=/VALUE=DATE/.test(params)||/^\d{8}$/.test(v);
  const dm=v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);if(!dm)return null;
  if(allDay||!dm[4])return {date:isoOf(+dm[1],+dm[2],+dm[3]),time:"",allDay:true};
  if(dm[7]){
    const dt=new Date(Date.UTC(+dm[1],+dm[2]-1,+dm[3],+dm[4],+dm[5],+dm[6]));
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(dt);
    const g=(t:string)=>parts.find(p=>p.type===t)?.value||"00";
    return {date:`${g("year")}-${g("month")}-${g("day")}`,time:`${g("hour")==="24"?"00":g("hour")}:${g("minute")}`,allDay:false};
  }
  return {date:isoOf(+dm[1],+dm[2],+dm[3]),time:`${dm[4]}:${dm[5]}`,allDay:false};
}

export async function POST(req:NextRequest){
  let url="";
  try{const b=await req.json();url=String(b?.url||"").trim()}catch{}
  let u:URL;
  try{u=new URL(url.replace(/^webcal:/i,"https:"))}catch{return NextResponse.json({error:"Некоректне посилання"},{status:400})}
  // тільки Google Calendar — щоб ця адреса не стала способом ходити на чужі сервери
  if(u.protocol!=="https:"||u.hostname!=="calendar.google.com"||!u.pathname.endsWith(".ics")){
    return NextResponse.json({error:"Потрібне посилання «Secret address in iCal format» з Google Calendar (calendar.google.com …ics)"},{status:400});
  }
  try{
    const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),12000);
    const r=await fetch(u.toString(),{signal:ctl.signal,cache:"no-store"});clearTimeout(to);
    if(!r.ok)return NextResponse.json({error:`Google відповів ${r.status}`},{status:502});
    const text=(await r.text()).slice(0,4_000_000);
    const events:Ev[]=[];
    for(const block of unfold(text).split("BEGIN:VEVENT").slice(1)){
      const body=block.split("END:VEVENT")[0];
      const lines=body.split("\n");
      const get=(k:string)=>lines.find(l=>l.startsWith(k+":")||l.startsWith(k+";"))||"";
      if(/^STATUS:CANCELLED/m.test(body))continue;
      if(get("RRULE"))continue; // повторювані події не показуємо (часто це шкільні/сімейні)
      const s=parseDt(get("DTSTART"));if(!s)continue;
      const e=parseDt(get("DTEND"));
      let end=s.date;
      if(e){end=e.allDay?addDay(e.date,-1):(e.time==="00:00"?addDay(e.date,-1):e.date)}
      if(end<s.date)end=s.date;
      const title=unesc((get("SUMMARY").split(":").slice(1).join(":"))||"(без назви)");
      const location=unesc(get("LOCATION").split(":").slice(1).join(":"));
      events.push({title,start:s.date,end,time:s.time,location});
    }
    events.sort((a,b)=>a.start.localeCompare(b.start));
    return NextResponse.json({events});
  }catch{
    return NextResponse.json({error:"Не вдалося завантажити календар"},{status:502});
  }
}
