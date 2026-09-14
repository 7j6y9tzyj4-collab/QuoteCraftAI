export type JobPhoto={id:string;name:string;dataUrl:string};

// Re-encode locally: orient through browser decoding, resize and omit EXIF.
export async function prepareJobPhoto(file:File):Promise<JobPhoto>{
  if(file.size>20*1024*1024)throw new Error("Фото завелике: максимум 20 МБ.");
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    img.src=url;
    try{await img.decode()}catch{throw new Error("Не вдалося відкрити фото. Вибери JPEG, PNG або WebP; HEIC збережи як JPEG.")}
    const canvas=document.createElement("canvas");
    const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("Не вдалося підготувати фото.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let dataUrl=canvas.toDataURL("image/jpeg",.8);
    if(dataUrl.length>750000)dataUrl=canvas.toDataURL("image/jpeg",.5);
    if(dataUrl.length>750000)throw new Error("Фото має забагато деталей. Обріж його та спробуй ще раз.");
    return {id:crypto.randomUUID(),name:file.name,dataUrl};
  }finally{URL.revokeObjectURL(url)}
}
