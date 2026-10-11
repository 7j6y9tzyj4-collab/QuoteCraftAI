import {prepareJobPhoto,type JobPhoto} from "@/lib/jobPhotos";

// Чек може прийти фото, скріншотом або PDF (Print → Поділитися → Зберегти/Скопіювати).
export const isPdf=(f:File|Blob)=>f.type==="application/pdf"||("name" in f&&/\.pdf$/i.test((f as File).name));
export const isReceiptFile=(f:File)=>f.type.startsWith("image/")||isPdf(f);

// PDF: одна сторінка → полотно, біле по краях обрізане.
async function openPdf(file:Blob){
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
  return pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
}
async function renderPage(doc:any,i:number,width=1100):Promise<HTMLCanvasElement>{
  const page=await doc.getPage(i);
  const base=page.getViewport({scale:1});
  const vp=page.getViewport({scale:Math.min(3,width/base.width)});
  const c=document.createElement("canvas");
  c.width=Math.round(vp.width);c.height=Math.round(vp.height);
  const ctx=c.getContext("2d")!;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
  await page.render({canvas:c,canvasContext:ctx,viewport:vp}).promise;
  return trimWhite(c);
}
// кілька полотен одне під одним → JPEG, який ще влазить в AI (≤750 КБ)
function stackCanvases(pages:HTMLCanvasElement[],maxH=2400,maxW=1400):string{
  const w=Math.max(...pages.map(p=>p.width));
  const h=pages.reduce((s,p)=>s+p.height,0);
  const scale=Math.min(1,maxH/h,maxW/w);
  const out=document.createElement("canvas");
  out.width=Math.max(1,Math.round(w*scale));out.height=Math.max(1,Math.round(h*scale));
  const o=out.getContext("2d")!;
  o.fillStyle="#fff";o.fillRect(0,0,out.width,out.height);
  let y=0;for(const p of pages){o.drawImage(p,0,y*scale,p.width*scale,p.height*scale);y+=p.height}
  let url=out.toDataURL("image/jpeg",.8);
  if(url.length>750000)url=out.toDataURL("image/jpeg",.55);
  if(url.length>750000)url=out.toDataURL("image/jpeg",.35);
  if(url.length>750000)throw new Error("зображення завелике — зроби скріншот чека");
  return url;
}

// PDF → одна картинка: перші сторінки одна під одною (для одиночного чека / вставки).
async function pdfToDataUrl(file:Blob):Promise<string>{
  const doc=await openPdf(file);
  const pages:HTMLCanvasElement[]=[];
  for(let i=1;i<=Math.min(doc.numPages,3);i++)pages.push(await renderPage(doc,i));
  await doc.destroy();
  if(!pages.length)throw new Error("PDF порожній");
  return stackCanvases(pages);
}

// Пакет чеків: PDF ділимо по сторінках — 1 сторінка = 1 чек. Фото — як є.
export type ReceiptPage={key:string;file:File;name:string;page:number;pages:number;fromPdf:boolean;dataUrl:string};
export const MAX_BATCH_PAGES=80;
export async function prepareReceiptPages(f:File):Promise<ReceiptPage[]>{
  const name=f.name||(isPdf(f)?"receipts.pdf":"receipt.jpg");
  if(!isPdf(f)){
    const p=await prepareJobPhoto(f);
    return [{key:crypto.randomUUID(),file:f,name,page:1,pages:1,fromPdf:false,dataUrl:p.dataUrl}];
  }
  const doc=await openPdf(f);
  try{
    const n=Math.min(doc.numPages,MAX_BATCH_PAGES);
    const out:ReceiptPage[]=[];
    for(let i=1;i<=n;i++){
      const c=await renderPage(doc,i,1300);
      out.push({key:crypto.randomUUID(),file:f,name,page:i,pages:doc.numPages,fromPdf:true,dataUrl:stackCanvases([c])});
    }
    if(!out.length)throw new Error("PDF порожній");
    return out;
  }finally{await doc.destroy()}
}

// «З'єднати з попереднім»: довгий чек на 2 сторінки → одна картинка
export async function joinReceiptImages(top:string,bottom:string):Promise<string>{
  const load=(src:string)=>new Promise<HTMLImageElement>((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>fail(new Error("image"));i.src=src});
  const toCanvas=(img:HTMLImageElement)=>{const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d")!.drawImage(img,0,0);return c};
  return stackCanvases([toCanvas(await load(top)),toCanvas(await load(bottom))],3000,1400);
}

function trimWhite(c:HTMLCanvasElement):HTMLCanvasElement{
  const ctx=c.getContext("2d")!;
  const {data,width:w,height:h}=ctx.getImageData(0,0,c.width,c.height);
  let top=h,bottom=-1,left=w,right=-1;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
    const i=(y*w+x)*4;
    if(data[i]<235||data[i+1]<235||data[i+2]<235){if(y<top)top=y;if(y>bottom)bottom=y;if(x<left)left=x;if(x>right)right=x}
  }
  if(bottom<0)return c;
  const pad=16;
  top=Math.max(0,top-pad);left=Math.max(0,left-pad);bottom=Math.min(h-1,bottom+pad);right=Math.min(w-1,right+pad);
  const out=document.createElement("canvas");
  out.width=right-left+1;out.height=bottom-top+1;
  out.getContext("2d")!.drawImage(c,left,top,out.width,out.height,0,0,out.width,out.height);
  return out;
}

export async function prepareReceiptFile(f:File):Promise<JobPhoto>{
  if(isPdf(f))return {id:crypto.randomUUID(),name:f.name||"receipt.pdf",dataUrl:await pdfToDataUrl(f)};
  return prepareJobPhoto(f);
}

// з буфера обміну: файли (картинка/PDF) або <img src="data:..."> у HTML
export async function filesFromDataTransfer(dt:DataTransfer|null):Promise<{files:File[];types:string[]}>{
  if(!dt)return {files:[],types:[]};
  const types=Array.from(dt.types||[]);
  const files:File[]=[];
  for(const it of Array.from(dt.items||[])){
    if(it.kind==="file"){const f=it.getAsFile();if(f&&isReceiptFile(f))files.push(f)}
  }
  if(!files.length)for(const f of Array.from(dt.files||[]))if(isReceiptFile(f))files.push(f);
  if(!files.length&&types.includes("text/html")){
    const f=imgFromHtml(dt.getData("text/html"));if(f)files.push(f);
  }
  return {files,types};
}

export async function filesFromClipboardItems(items:ClipboardItem[]):Promise<{files:File[];types:string[]}>{
  const files:File[]=[];const types:string[]=[];
  for(const it of items){
    types.push(...it.types);
    const t=it.types.find(x=>x==="application/pdf")||it.types.find(x=>x.startsWith("image/"));
    if(t){const b=await it.getType(t);files.push(new File([b],t==="application/pdf"?"receipt.pdf":`screenshot.${t.split("/")[1]||"png"}`,{type:t}));continue}
    if(it.types.includes("text/html")){const f=imgFromHtml(await (await it.getType("text/html")).text());if(f)files.push(f)}
  }
  return {files,types};
}

function imgFromHtml(html:string):File|null{
  const m=html.match(/<img[^>]+src=["'](data:(image\/[a-z+]+|application\/pdf);base64,([^"']+))["']/i);
  if(!m)return null;
  try{
    const bin=atob(m[3]);const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
    return new File([arr],m[2]==="application/pdf"?"receipt.pdf":"pasted.png",{type:m[2]});
  }catch{return null}
}
