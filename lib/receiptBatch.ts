// Пакет чеків: дублікати, пошук проєкту за назвою файлу.
import type {Receipt,Statement} from "./statement";

// Відбиток картинки (SHA-256 підготовленого зображення) — той самий файл/сторінка дає той самий відбиток.
export async function imageHash(dataUrl:string):Promise<string>{
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(dataUrl));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,32);
}

export const normStore=(s:string)=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"").replace(/^the/,"");
const normNo=(s?:string)=>String(s||"").replace(/[^0-9a-z]/gi,"").toLowerCase();

// MM/DD/YYYY, M/D/YY, YYYY-MM-DD … → YYYY-MM-DD (або "")
export function normDate(s:string):string{
  const t=String(s||"").trim();
  let m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m=t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if(m){const y=m[3].length===2?"20"+m[3]:m[3];return `${y}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`}
  return "";
}

export type DupCheck={store:string;date:string;amount:number;receiptNo?:string;hash?:string};
// той самий магазин + дата + сума (± $0.01), або той самий номер чека, або та сама картинка
export function findDuplicate(d:DupCheck,existing:Receipt[]):Receipt|null{
  const no=normNo(d.receiptNo),st=normStore(d.store),dt=normDate(d.date),amt=Number(d.amount)||0;
  for(const r of existing){
    if(d.hash&&r.hash&&d.hash===r.hash)return r;
    if(no.length>=6&&normNo(r.receiptNo)===no)return r;
    const rs=normStore(r.store);
    const sameStore=!!st&&!!rs&&(st===rs||st.includes(rs)||rs.includes(st));
    if(sameStore&&dt&&dt===normDate(r.date)&&amt!==0&&Math.abs(amt-(Number(r.amount)||0))<=0.011)return r;
  }
  return null;
}

// чек без фото (вписаний вручну) з тією ж сумою: той самий магазин або магазин не вписаний,
// дата в межах 30 днів (вручну часто ставлять день, коли забрав, а не день замовлення)
export const hasPhoto=(r:Receipt)=>!!(r.photoPath||r.photoData);
export function findManualMatch(d:DupCheck,existing:Receipt[]):Receipt|null{
  const st=normStore(d.store),dt=normDate(d.date),amt=Number(d.amount)||0;
  if(!amt)return null;
  const day=(x:string)=>{const n=normDate(x);return n?new Date(n+"T12:00:00").getTime():NaN};
  for(const r of existing){
    if(hasPhoto(r))continue;
    if(Math.abs(amt-(Number(r.amount)||0))>0.011)continue;
    const rs=normStore(r.store);
    const storeOk=!rs||!st||st===rs||st.includes(rs)||rs.includes(st);
    if(!storeOk)continue;
    const a=day(dt),b=day(r.date);
    if(!isNaN(a)&&!isNaN(b)&&Math.abs(a-b)>30*864e5)continue;
    return r;
  }
  return null;
}

// «Uzma.pdf», «Uzma receipts 10-10.pdf» → розрахунок з клієнтом Uzma. Кілька однаково схожих або жодного → null.
const words=(s:string)=>String(s||"").toLowerCase().replace(/\.[a-z0-9]{2,5}$/i,"").split(/[^a-zа-яіїєґ0-9']+/i).filter(w=>w.length>=2);
const STOP=new Set(["scanned","document","documents","scan","receipt","receipts","pdf","img","image","photo","копія","чеки","чек"]);
export function matchStatementByName(fileName:string,list:Statement[]):Statement|null{
  const fw=new Set(words(fileName).filter(w=>!STOP.has(w)));
  if(!fw.size)return null;
  let best:Statement|null=null,bestScore=0,tie=false;
  for(const s of list){
    const cw=words(s.client).filter(w=>!STOP.has(w));
    if(!cw.length)continue;
    const hits=cw.filter(w=>fw.has(w)).length;
    if(!hits)continue;
    const pw=words(s.project).filter(w=>fw.has(w)).length;
    const score=hits*10+pw+(hits===cw.length?5:0);
    if(score>bestScore){best=s;bestScore=score;tie=false}else if(score===bestScore)tie=true;
  }
  return tie?null:best;
}

// назва файлу без розширення — для нового проєкту («Uzma.pdf» → «Uzma»)
export const baseName=(fileName:string)=>String(fileName||"").replace(/\.[a-z0-9]{2,5}$/i,"").replace(/[_]+/g," ").trim();
