// Мінімальний запис .xlsx без бібліотек (fflate вже є): кілька аркушів, жирні заголовки, формат 0.00, формули.
import {zipSync,strToU8} from "fflate";

export type XCell=string|number|null|undefined|{f:string;bold?:boolean}|{v:string|number;bold?:boolean};
export type XSheet={name:string;rows:XCell[][];widths?:number[];/** скільки верхніх рядків закріпити */freeze?:number;/** рядки (0-based), які зробити жирними */bold?:number[]};

const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"");
const col=(i:number)=>{let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
export const cellRef=(r:number,c:number)=>col(c)+(r+1);
const sheetName=(n:string,used:Set<string>)=>{let s=n.replace(/[\\/?*[\]:]/g," ").slice(0,31)||"Sheet";let k=2;while(used.has(s))s=s.slice(0,28)+" "+k++;used.add(s);return s};

// стилі: 0 звичайний, 1 жирний, 2 число 0.00, 3 жирне число 0.00
const STYLES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>`;

function sheetXml(sh:XSheet){
  const bold=new Set(sh.bold||[]);
  const rows=sh.rows.map((row,ri)=>{
    const cells=row.map((c,ci)=>{
      if(c===null||c===undefined||c==="")return "";
      const ref=cellRef(ri,ci);let b=bold.has(ri);let v:unknown=c;
      if(typeof c==="object"){if("f" in c){b=b||!!c.bold;return `<c r="${ref}" s="${b?3:2}"><f>${esc(c.f)}</f></c>`}b=b||!!c.bold;v=c.v}
      if(typeof v==="number"&&isFinite(v))return `<c r="${ref}" s="${b?3:2}"><v>${Math.round(v*100)/100}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${b?' s="1"':""}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    }).join("");
    return `<row r="${ri+1}">${cells}</row>`;
  }).join("");
  const cols=sh.widths?.length?`<cols>${sh.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")}</cols>`:"";
  const fr=sh.freeze?`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`:"";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fr}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

export function buildXlsx(sheets:XSheet[]):Uint8Array{
  const used=new Set<string>();const names=sheets.map(s=>sheetName(s.name,used));
  const f:Record<string,Uint8Array>={
    "[Content_Types].xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    "_rels/.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n,i)=>`<sheet name="${esc(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml":strToU8(STYLES),
  };
  sheets.forEach((s,i)=>{f[`xl/worksheets/sheet${i+1}.xml`]=strToU8(sheetXml(s))});
  return zipSync(f,{level:6});
}
