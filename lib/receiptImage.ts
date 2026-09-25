// Фото чека: обрізаємо по межах, які знайшов AI, і робимо «скан» — сірий, контрастний, легкий.
import {detectPaperBox,type Box} from "./paperBox";
export type {Box};

// межі чека на самому пристрої: зменшена сіра копія → найбільша світла пляма
function localBox(img:HTMLImageElement):Box|null{
  const s=240/Math.max(img.naturalWidth,img.naturalHeight);
  const w=Math.max(1,Math.round(img.naturalWidth*s)),h=Math.max(1,Math.round(img.naturalHeight*s));
  const c=document.createElement("canvas");c.width=w;c.height=h;
  const ctx=c.getContext("2d");if(!ctx)return null;
  ctx.drawImage(img,0,0,w,h);
  const p=ctx.getImageData(0,0,w,h).data;const g=new Uint8ClampedArray(w*h);
  for(let i=0;i<w*h;i++)g[i]=0.299*p[i*4]+0.587*p[i*4+1]+0.114*p[i*4+2];
  return detectPaperBox(g,w,h);
}

const loadImage=(src:string)=>new Promise<HTMLImageElement>((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>fail(new Error("image"));i.src=src});

export async function scanReceipt(dataUrl:string,aiBox:Box|null,maxSide=1600,quality=.72):Promise<string>{
  const img=await loadImage(dataUrl);
  // спершу власне визначення (точніше), якщо не вийшло — межі від AI
  const aiOk=aiBox&&!(aiBox.x<=0.01&&aiBox.y<=0.01&&aiBox.w>=0.98&&aiBox.h>=0.98)?aiBox:null;
  const box=localBox(img)||aiOk;
  const W=img.naturalWidth,H=img.naturalHeight;
  const ok=box&&box.w>0.1&&box.h>0.1&&box.x>=0&&box.y>=0&&box.x<1&&box.y<1;
  const pad=0.03;
  const x0=ok?Math.max(0,(box!.x-pad))*W:0, y0=ok?Math.max(0,(box!.y-pad))*H:0;
  const x1=ok?Math.min(1,box!.x+box!.w+pad)*W:W, y1=ok?Math.min(1,box!.y+box!.h+pad)*H:H;
  const cw=Math.max(1,x1-x0),ch=Math.max(1,y1-y0);
  const scale=Math.min(1,maxSide/Math.max(cw,ch));
  const c=document.createElement("canvas");
  c.width=Math.round(cw*scale);c.height=Math.round(ch*scale);
  const ctx=c.getContext("2d");
  if(!ctx)return dataUrl;
  ctx.drawImage(img,x0,y0,cw,ch,0,0,c.width,c.height);
  const d=ctx.getImageData(0,0,c.width,c.height),p=d.data;
  for(let i=0;i<p.length;i+=4){
    const l=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];
    const v=Math.max(0,Math.min(255,(l-128)*1.45+150));
    p[i]=p[i+1]=p[i+2]=v;
  }
  ctx.putImageData(d,0,0);
  return c.toDataURL("image/jpeg",quality);
}

export function dataUrlToBlob(dataUrl:string):Blob{
  const [head,b64]=dataUrl.split(",");
  const mime=/data:([^;]+)/.exec(head)?.[1]||"image/jpeg";
  const bin=atob(b64);const u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return new Blob([u],{type:mime});
}

export const blobToDataUrl=(b:Blob)=>new Promise<string>((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>fail(r.error);r.readAsDataURL(b)});

export async function imageSize(dataUrl:string){const i=await loadImage(dataUrl);return {w:i.naturalWidth,h:i.naturalHeight}}
