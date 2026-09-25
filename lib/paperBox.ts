// Знаходимо чек на фото без AI: чек — найбільша світла пляма (білий папір на темнішому фоні).
// Працює на зменшеній сірій копії (≈240 px), повертає межі у частках 0..1 або null.
export type Box={x:number;y:number;w:number;h:number};

export function otsu(gray:Uint8ClampedArray|Uint8Array):number{
  const hist=new Array(256).fill(0);
  for(const v of gray)hist[v]++;
  const total=gray.length;let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
  let sumB=0,wB=0,best=0,t=128;
  for(let i=0;i<256;i++){
    wB+=hist[i];if(!wB)continue;const wF=total-wB;if(!wF)break;
    sumB+=i*hist[i];const mB=sumB/wB,mF=(sum-sumB)/wF;
    const v=wB*wF*(mB-mF)*(mB-mF);if(v>best){best=v;t=i}
  }
  return t;
}

export function detectPaperBox(gray:Uint8ClampedArray|Uint8Array,w:number,h:number):Box|null{
  const t=otsu(gray);
  const mask=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++)mask[i]=gray[i]>t?1:0;
  // трохи «закриваємо» дірки від тексту: піксель світлий, якщо світлий хоч один сусід по рядку
  const m2=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;m2[i]=mask[i]|(x>0?mask[i-1]:0)|(x<w-1?mask[i+1]:0)|(y>0?mask[i-w]:0)|(y<h-1?mask[i+w]:0)}
  const seen=new Uint8Array(w*h);const stack=new Int32Array(w*h);
  let bestCount=0,bb=[0,0,0,0];
  for(let s=0;s<w*h;s++){
    if(!m2[s]||seen[s])continue;
    let top=0,count=0,x0=w,y0=h,x1=0,y1=0;stack[top++]=s;seen[s]=1;
    while(top){
      const i=stack[--top];count++;const x=i%w,y=(i-x)/w;
      if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      const nb=[x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1];
      for(const n of nb)if(n>=0&&m2[n]&&!seen[n]){seen[n]=1;stack[top++]=n}
    }
    if(count>bestCount){bestCount=count;bb=[x0,y0,x1,y1]}
  }
  const [x0,y0,x1,y1]=bb;
  const bw=x1-x0+1,bh=y1-y0+1,area=bw*bh/(w*h),fill=bestCount/(bw*bh);
  // занадто мала пляма, майже все фото або «рвана» форма — не довіряємо
  if(area<0.05||area>0.97||fill<0.5)return null;
  return {x:x0/w,y:y0/h,w:bw/w,h:bh/h};
}
