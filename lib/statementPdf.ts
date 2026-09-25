import type {Statement} from "./statement";
import {statementTotals} from "./statement";
import {COMPANY_NAME,COMPANY_CONTACT,setupPdfFonts} from "./calcPdf";

const money=(n:number)=>(n<0?"-":"")+"$"+Math.abs(Math.round(n*100)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

export type ReceiptPhoto={label:string;dataUrl:string;w:number;h:number};

export async function buildStatementPdf(s:Statement,photos:ReceiptPhoto[]=[]):Promise<Blob>{
  const {jsPDF}=await import("jspdf");
  const autoTable=(await import("jspdf-autotable")).default;
  const doc=new jsPDF({unit:"pt",format:"letter"});
  const font=await setupPdfFonts(doc);
  const M=48,W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
  const t=statementTotals(s);
  let y=M;

  doc.setFont(font,"bold");doc.setFontSize(11);doc.setTextColor(16,24,40);
  doc.text(COMPANY_NAME,W-M,y,{align:"right"});
  doc.setFont(font,"normal");doc.setFontSize(9);doc.setTextColor(100);doc.text(COMPANY_CONTACT,W-M,y+13,{align:"right"});
  doc.setTextColor(0);doc.setFont(font,"bold");doc.setFontSize(18);
  doc.text("Payment Statement",M,y);y+=22;
  doc.setFont(font,"normal");doc.setFontSize(10);doc.setTextColor(80);
  [s.client?`Client: ${s.client}`:"",s.project?`Project: ${s.project}`:"",`Date: ${new Date().toLocaleDateString("en-US")}`].filter(Boolean).forEach(l=>{doc.text(l,M,y);y+=14});
  doc.setTextColor(0);y+=4;

  const section=(title:string,head:string[],body:string[][],totalLabel:string,total:number,widths:Record<number,any>)=>{
    if(y>H-M-80){doc.addPage();y=M}
    doc.setFont(font,"bold");doc.setFontSize(11);doc.text(title,M,y);y+=6;
    autoTable(doc,{
      startY:y,head:[head],body:body.length?body:[head.map((_,i)=>i===0?"—":"")],
      foot:[[{content:totalLabel,colSpan:head.length-1,styles:{halign:"left"}},{content:money(total),styles:{halign:"right"}}]] as any,
      margin:{left:M,right:M},
      styles:{font,fontSize:8.5,cellPadding:4,overflow:"linebreak",valign:"top"},
      headStyles:{fillColor:[16,24,40],textColor:255,fontStyle:"bold"},
      footStyles:{fillColor:[255,255,255],textColor:0,fontStyle:"bold",lineWidth:{top:0.8},lineColor:[16,24,40]},
      columnStyles:{...widths,[head.length-1]:{cellWidth:80,halign:"right"}},
      rowPageBreak:"avoid",
    });
    y=(doc as any).lastAutoTable.finalY+16;
  };

  section("Labor",["Description","Amount"],s.labor.filter(l=>l.description||l.amount).map(l=>[l.description,money(Number(l.amount)||0)]),"Total labor",t.labor,{});
  if(s.receipts.length)section("Materials (reimbursed per store receipts)",["Date","Store","Items","Amount"],s.receipts.map(r=>[r.date,r.store,r.items,money(Number(r.amount)||0)]),"Total materials",t.materials,{0:{cellWidth:66},1:{cellWidth:80}});
  if(s.payments.length)section("Payments received",["Date","Method","Amount"],s.payments.map(p=>[p.date,p.method||"",money(Number(p.amount)||0)]),"Total received",t.paid,{0:{cellWidth:90}});

  if(y>H-M-110){doc.addPage();y=M}
  const line=(label:string,value:string,bold=false,big=false)=>{
    doc.setFont(font,bold?"bold":"normal");doc.setFontSize(big?13:10);
    doc.text(label,W-M-260,y);doc.text(value,W-M,y,{align:"right"});y+=big?20:15;
  };
  line("Labor",money(t.labor));
  if(t.materials)line("Materials",money(t.materials));
  line("Total",money(t.total),true);
  if(t.paid)line("Payments received","-"+money(t.paid));
  doc.setDrawColor(16,24,40);doc.setLineWidth(1);doc.line(W-M-260,y-9,W-M,y-9);y+=4;
  line(t.balance>=0?"Balance due":"Overpaid (credit)",money(Math.abs(t.balance)),true,true);

  if(s.notes.trim()){
    y+=8;doc.setFont(font,"normal");doc.setFontSize(9);doc.setTextColor(60);
    for(const l of doc.splitTextToSize(s.notes.trim(),W-2*M) as string[]){if(y>H-M){doc.addPage();y=M}doc.text(l,M,y);y+=12}
    doc.setTextColor(0);
  }
  // Додаток: фото чеків, по 2 на сторінку
  if(photos.length){
    const gap=16,colW=(W-2*M-gap)/2,maxH=H-2*M-40;
    for(let i=0;i<photos.length;i+=2){
      doc.addPage();y=M;
      doc.setFont(font,"bold");doc.setFontSize(12);doc.setTextColor(0);
      doc.text(i===0?"Receipts":"Receipts (continued)",M,y);y+=18;
      photos.slice(i,i+2).forEach((ph,k)=>{
        const x=M+k*(colW+gap);
        const sc=Math.min(colW/ph.w,maxH/ph.h);
        doc.setFont(font,"normal");doc.setFontSize(8.5);doc.setTextColor(80);
        doc.text(doc.splitTextToSize(ph.label,colW) as string[],x,y);
        try{doc.addImage(ph.dataUrl,"JPEG",x,y+14,ph.w*sc,ph.h*sc)}catch{/* пошкоджене фото — пропускаємо */}
      });
    }
    doc.setTextColor(0);
  }
  return doc.output("blob");
}

export function statementFileName(s:Statement){
  const base=["Payment Statement",s.client,s.project].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g,"").trim();
  return `${base}.pdf`;
}
