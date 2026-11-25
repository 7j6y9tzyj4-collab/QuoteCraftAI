import {NextRequest,NextResponse} from "next/server";
import {supabaseAdmin} from "@/lib/supabaseAdmin";
import {geocode} from "@/lib/geo";
import {statementStatus,type Statement} from "@/lib/statement";

export const runtime="nodejs";
export const maxDuration=30;

// 📍 Об'єкти власника для застосунку на iPhone: адреси проєктів «В роботі» та тих, що сьогодні в графіку.
// Застосунок ставить на них геозони й нагадує: «Ви приїхали до клієнта — почати облік часу?»
const RADIUS=120;
const n=(s:string)=>String(s||"").trim().toLowerCase();

async function coords(address:string){
  const key=n(address);if(key.length<5)return null;
  const {data}=await supabaseAdmin.from("geo_cache").select("lat,lng").eq("address",key).maybeSingle();
  if(data)return data.lat==null?null:{lat:data.lat as number,lng:data.lng as number};
  const g=await geocode(address);
  await supabaseAdmin.from("geo_cache").upsert({address:key,lat:g?.lat??null,lng:g?.lng??null});
  return g;
}

export async function GET(req:NextRequest){
  try{
    const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    const {data:u}=jwt?await supabaseAdmin.auth.getUser(jwt):{data:null};
    const uid=u?.user?.id;if(!uid)return NextResponse.json({error:"auth"},{status:401});
    const [{data:st},{data:cl},{data:set}]=await Promise.all([
      supabaseAdmin.from("user_statements").select("statements").eq("user_id",uid).maybeSingle(),
      supabaseAdmin.from("user_clients").select("data").eq("user_id",uid),
      supabaseAdmin.from("user_settings").select("schedule").eq("user_id",uid).maybeSingle(),
    ]);
    const clients=((cl||[]) as {data:{name?:string;address?:string}}[]).map(c=>c.data||{});
    const list=((st?.statements||[]) as Statement[]).filter(s=>s&&s.id&&!(s as {own?:boolean}).own);
    // сьогодні в графіку (за Чикаго)
    const today=new Date().toLocaleDateString("sv-SE",{timeZone:"America/Chicago"});
    type J={sid?:string;client?:string;start?:string;days?:number;sat?:boolean};
    const sch=set?.schedule as unknown;
    const jobs=(Array.isArray(sch)?sch:Array.isArray((sch as {jobs?:unknown[]}|null)?.jobs)?(sch as {jobs:unknown[]}).jobs:[]) as J[];
    // кінець роботи: робочі дні без неділі (і без суботи, якщо не позначено) — як у графіку
    const endOf=(j:J)=>{const d=new Date(String(j.start)+"T12:00:00");let left=Math.max(1,Math.ceil(Number(j.days)||1));for(let g=0;g<400;g++){const w=d.getDay();if(w!==0&&(w!==6||j.sat)){left--;if(left<=0)break}d.setDate(d.getDate()+1)}return d.toLocaleDateString("sv-SE")};
    const todaySids=new Set<string>(),todayClients=new Set<string>();
    for(const j of jobs)if(j.start&&String(j.start)<=today&&endOf(j)>=today){if(j.sid)todaySids.add(String(j.sid));if(j.client)todayClients.add(n(String(j.client)))}
    // одна зона на адресу: id = проєкт (той, що сьогодні в графіку, інакше перший «В роботі»)
    const byAddr=new Map<string,{address:string;sid:string;title:string;today:boolean}>();
    for(const s of list){
      const inToday=todaySids.has(s.id)||todayClients.has(n(s.client));
      if(!inToday&&statementStatus(s)!=="active")continue;
      const address=String((s as {address?:string}).address||clients.find(c=>n(c.name||"")===n(s.client))?.address||"");
      const k=n(address);if(k.length<5)continue;
      const cur=byAddr.get(k);
      if(!cur||(inToday&&!cur.today))byAddr.set(k,{address,sid:s.id,title:String(s.client||s.project||"клієнт"),today:inToday});
    }
    const sites:{id:string;lat:number;lng:number;radius:number;title:string}[]=[];
    for(const g of [...byAddr.values()].sort((a,b)=>Number(b.today)-Number(a.today)).slice(0,15)){
      const c=await coords(g.address);
      if(c)sites.push({id:g.sid,lat:c.lat,lng:c.lng,radius:RADIUS,title:g.title});
    }
    return NextResponse.json({sites});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"error"},{status:500})}
}
