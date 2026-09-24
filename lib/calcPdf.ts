import type {CalcItem,CalcTotals} from "./calcTypes";
import {computeCalcLine} from "./calcEngine";

// PDF будується напряму (jsPDF + autotable), без друку через браузер, тому
// його можна зберегти або надіслати клієнту з телефона. Шрифт DejaVu — щоб
// українські назви клієнтів і нотатки не перетворились на кракозябри.

export type CalcPdfInput={
  client:string;
  project:string;
  locationMultiplier:number;
  items:CalcItem[];
  totals:CalcTotals;
  discount:number;
  discountLabel:string;
  grandTotal:number;
  notes:string;
};

const money=(n:number)=>"$"+(Math.round(n*100)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const unitLabel=(u:string)=>({each:"each",sqft:"sq ft",hour:"hour",linear_ft:"lin ft",room:"room"} as Record<string,string>)[u]||u;

let fontCache:{reg:string;bold:string}|null=null;
async function loadFont(url:string):Promise<string>{
  const buf=await fetch(url).then(r=>{if(!r.ok)throw new Error("font "+r.status);return r.arrayBuffer()});
  const bytes=new Uint8Array(buf);
  let bin="";
  for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode.apply(null,Array.from(bytes.subarray(i,i+0x8000)));
  return btoa(bin);
}

export async function buildCalcPdf(input:CalcPdfInput):Promise<Blob>{
  const {jsPDF}=await import("jspdf");
  const autoTable=(await import("jspdf-autotable")).default;
  const doc=new jsPDF({unit:"pt",format:"letter"});

  let fontsLoaded=false;
  try{
    if(!fontCache){
      const [reg,bold]=await Promise.all([loadFont("/fonts/DejaVuSans.ttf"),loadFont("/fonts/DejaVuSans-Bold.ttf")]);
      fontCache={reg,bold};
    }
    doc.addFileToVFS("DejaVuSans.ttf",fontCache.reg);doc.addFont("DejaVuSans.ttf","DejaVu","normal");
    doc.addFileToVFS("DejaVuSans-Bold.ttf",fontCache.bold);doc.addFont("DejaVuSans-Bold.ttf","DejaVu","bold");
    fontsLoaded=true;
  }catch{/* без шрифту кирилиця не надрукується, але PDF усе одно збереться */}
  const font=fontsLoaded?"DejaVu":"helvetica";
  const M=48;
  const W=doc.internal.pageSize.getWidth();
  let y=M;

  doc.setFont(font,"bold");doc.setFontSize(18);
  doc.text(input.project||"Estimate",M,y);y+=22;
  doc.setFont(font,"normal");doc.setFontSize(10);doc.setTextColor(80);
  const meta=[input.client?`Client: ${input.client}`:"",`Date: ${new Date().toLocaleDateString("en-US")}`,input.locationMultiplier!==1?`Location multiplier: ${input.locationMultiplier}`:""].filter(Boolean);
  meta.forEach(m=>{doc.text(m,M,y);y+=14});
  doc.setTextColor(0);y+=6;

  const body=input.items.map(li=>{
    const c=computeCalcLine(li,input.locationMultiplier);
    const desc=li.note?`${li.name}\n${li.note}`:li.name;
    return [desc,`${li.quantity} ${unitLabel(li.unit)}`,li.difficulty,money(c.lineTotal)];
  });

  autoTable(doc,{
    startY:y,
    head:[["Description","Quantity","Difficulty","Total"]],
    body,
    margin:{left:M,right:M},
    styles:{font,fontSize:9,cellPadding:5,overflow:"linebreak",valign:"top"},
    headStyles:{fillColor:[16,24,40],textColor:255,fontStyle:"bold"},
    columnStyles:{0:{cellWidth:W-2*M-190},1:{cellWidth:70},2:{cellWidth:60},3:{cellWidth:60,halign:"right"}},
    didParseCell:(data:any)=>{
      if(data.section==="body"&&data.column.index===0&&typeof data.cell.raw==="string"&&data.cell.raw.includes("\n")){
        data.cell.styles.fontSize=9;
      }
    }
  });

  y=(doc as any).lastAutoTable.finalY+16;
  const line=(label:string,value:string,bold=false)=>{
    if(y>doc.internal.pageSize.getHeight()-M){doc.addPage();y=M}
    doc.setFont(font,bold?"bold":"normal");doc.setFontSize(bold?12:10);
    doc.text(label,W-M-250,y);doc.text(value,W-M,y,{align:"right"});y+=bold?18:15;
  };
  line("Labor",money(input.totals.labor));
  line("Materials",money(input.totals.materials));
  if(input.totals.supplies>0)line("Supplies / equipment",money(input.totals.supplies));
  if(input.discount>0){
    line("Subtotal",money(input.totals.lineTotal));
    line(input.discountLabel,"−"+money(input.discount));
    line("Total",money(input.grandTotal),true);
  }else{
    line("Total",money(input.totals.lineTotal),true);
  }
  line("Estimated range",`${money(Math.max(0,input.totals.low-input.discount))} – ${money(Math.max(0,input.totals.high-input.discount))}`);

  const notes=input.notes.trim();
  if(notes){
    y+=10;
    doc.setFont(font,"bold");doc.setFontSize(10);
    if(y>doc.internal.pageSize.getHeight()-M-60){doc.addPage();y=M}
    doc.text("Notes & exclusions",M,y);y+=14;
    doc.setFont(font,"normal");doc.setFontSize(9);doc.setTextColor(60);
    const lines=doc.splitTextToSize(notes,W-2*M) as string[];
    lines.forEach(l=>{if(y>doc.internal.pageSize.getHeight()-M){doc.addPage();y=M}doc.text(l,M,y);y+=12});
    doc.setTextColor(0);
  }
  return doc.output("blob");
}

export function pdfFileName(project:string,client:string){
  const base=[project||"Estimate",client].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g,"").trim();
  return `${base||"Estimate"}.pdf`;
}
