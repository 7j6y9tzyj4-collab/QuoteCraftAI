// Міст до застосунку QuoteCraft на iPhone (сайт відкрито у WebView застосунку).
// У звичайному браузері всі функції повертають null / нічого не роблять.
type NativeWin={ReactNativeWebView?:{postMessage(m:string):void};__QC_NATIVE_DOCSCAN?:boolean;__QC_NATIVE_OWNERGEO?:boolean};
const nw=():NativeWin|null=>typeof window==="undefined"?null:(window as unknown as NativeWin);

/** Сканер документів Apple (сам обрізає краї чека). null — сканера нема, треба звичайна камера. Порожній масив — скасували. */
export function nativeDocScan():Promise<File[]>|null{
  const w=nw();if(!w?.ReactNativeWebView||!w.__QC_NATIVE_DOCSCAN)return null;
  const id=Math.random().toString(36).slice(2,12).padEnd(8,"0");
  return new Promise<File[]>(resolve=>{
    let timer=0;
    const done=(files:File[])=>{window.removeEventListener("qc-docscan",on);window.clearTimeout(timer);resolve(files)};
    const on=(e:Event)=>{
      const d=(e as CustomEvent<{id:string;ok:boolean;pages:string[]}>).detail;if(!d||d.id!==id)return;
      const files:File[]=[];
      for(const [i,b64] of (d.pages||[]).entries()){
        try{const bin=atob(b64);const u=new Uint8Array(bin.length);for(let k=0;k<bin.length;k++)u[k]=bin.charCodeAt(k);
          files.push(new File([u],`scan-${Date.now()}-${i+1}.jpg`,{type:"image/jpeg"}))}catch{}
      }
      done(files);
    };
    window.addEventListener("qc-docscan",on);
    timer=window.setTimeout(()=>done([]),10*60*1000);
    w.ReactNativeWebView!.postMessage("qc:docscan:"+id);
  });
}

/** Надіслати застосунку адреси активних проєктів — він нагадає «Ви приїхали до клієнта» і підкаже години, коли поїдете. */
export async function syncOwnerGeo(jwt:string){
  const w=nw();if(!w?.ReactNativeWebView||!w.__QC_NATIVE_OWNERGEO||!jwt)return;
  try{
    const r=await fetch("/api/owner-geo",{headers:{Authorization:"Bearer "+jwt}});if(!r.ok)return;
    const j=await r.json() as {sites?:unknown[]};
    w.ReactNativeWebView.postMessage("qc:ownergeo:"+JSON.stringify(j.sites||[]));
  }catch{}
}
