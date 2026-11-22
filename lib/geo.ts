// 📍 Адреса → координати (OpenStreetMap Nominatim, без ключа) і відстань між точками.
export async function geocode(address:string):Promise<{lat:number;lng:number}|null>{
  const a=String(address||"").trim();if(a.length<5)return null;
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(a)}`,{headers:{"User-Agent":"QuoteCraftAI/1.0 (worker time clock)"},cache:"no-store"});
    const j=await r.json();const x=Array.isArray(j)?j[0]:null;
    return x?{lat:Number(x.lat),lng:Number(x.lon)}:null;
  }catch{return null}
}
/** відстань у метрах */
export function distM(a:{lat:number;lng:number},b:{lat:number;lng:number}){
  const R=6371000,t=(d:number)=>d*Math.PI/180;
  const dLat=t(b.lat-a.lat),dLng=t(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
/** «на місці» / «0.4 mi від об'єкта» */
export const distText=(m:number|null|undefined)=>m==null?"":m<=250?"на місці":`${(m/1609.34).toFixed(m<16093?1:0)} mi від об'єкта`;
