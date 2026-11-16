// 📅 Подія календаря (.ics): iPhone/Mac відкривають файл у «Календарі» і пропонують додати подію.
export type IcsEvent={title:string;date:string;time?:string;minutes?:number;note?:string;location?:string};
const esc=(s:string)=>String(s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");
const fold=(l:string)=>{const out:string[]=[];let s=l;while(s.length>72){out.push(s.slice(0,72));s=" "+s.slice(72)}out.push(s);return out.join("\r\n")};
const pad=(n:number)=>String(n).padStart(2,"0");
export function buildIcs(e:IcsEvent):string{
  const d=e.date.replace(/-/g,"");
  const now=new Date();const stamp=`${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  let when:string[];
  if(e.time&&/^\d{1,2}:\d{2}$/.test(e.time)){
    const [h,m]=e.time.split(":").map(Number);const start=new Date(`${e.date}T${pad(h)}:${pad(m)}:00`);const end=new Date(start.getTime()+(e.minutes||60)*60000);
    const f=(x:Date)=>`${x.getFullYear()}${pad(x.getMonth()+1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
    when=[`DTSTART:${f(start)}`,`DTEND:${f(end)}`];   // місцевий час телефону
  }else{
    const n=new Date(`${e.date}T12:00:00`);n.setDate(n.getDate()+1);
    when=[`DTSTART;VALUE=DATE:${d}`,`DTEND;VALUE=DATE:${n.getFullYear()}${pad(n.getMonth()+1)}${pad(n.getDate())}`];
  }
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//QuoteCraft AI//Meeting//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@quotecraftai`,`DTSTAMP:${stamp}`,...when,`SUMMARY:${esc(e.title)}`,
    ...(e.note?[`DESCRIPTION:${esc(e.note)}`]:[]),...(e.location?[`LOCATION:${esc(e.location)}`]:[]),
    "BEGIN:VALARM","TRIGGER:-PT60M","ACTION:DISPLAY",`DESCRIPTION:${esc(e.title)}`,"END:VALARM",
    "END:VEVENT","END:VCALENDAR"].map(fold).join("\r\n")+"\r\n";
}
/** Google Calendar — для тих, хто не на iPhone */
export function googleCalUrl(e:IcsEvent){
  const d=e.date.replace(/-/g,"");let dates:string;
  if(e.time&&/^\d{1,2}:\d{2}$/.test(e.time)){const [h,m]=e.time.split(":").map(Number);const s=new Date(`${e.date}T${pad(h)}:${pad(m)}:00`);const en=new Date(s.getTime()+(e.minutes||60)*60000);const f=(x:Date)=>`${x.getFullYear()}${pad(x.getMonth()+1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;dates=`${f(s)}/${f(en)}`}
  else{const n=new Date(`${e.date}T12:00:00`);n.setDate(n.getDate()+1);dates=`${d}/${n.getFullYear()}${pad(n.getMonth()+1)}${pad(n.getDate())}`}
  const q=new URLSearchParams({action:"TEMPLATE",text:e.title,dates,details:e.note||"",location:e.location||""});
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
