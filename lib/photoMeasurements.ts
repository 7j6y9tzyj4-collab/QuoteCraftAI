export type Surface={name:string;lengthLowFt:number|null;lengthHighFt:number|null;widthLowFt:number|null;widthHighFt:number|null;basis:"reference"|"visible_measurement"|"unknown";evidence:string};
export type PhotoSurveyResult={surfaces:Surface[];questions:string[];observations:string[]};
export const PRELIMINARY_NOTE="PRELIMINARY ESTIMATE — based on approximate dimensions approved for budgeting only. On-site measurements and inspection are required before a final quote. Hidden conditions and unlisted work are excluded.";
export function validBounds(low:unknown,high:unknown):boolean{
 return typeof low==="number"&&typeof high==="number"&&Number.isFinite(low)&&Number.isFinite(high)&&low>0&&high>=low&&high<=1000;
}
export function normalizeSurvey(input:PhotoSurveyResult,hasReference:boolean):PhotoSurveyResult{
 const surfaces=(input.surfaces||[]).slice(0,12).map(s=>{
  const grounded=s.basis==="visible_measurement"||(s.basis==="reference"&&hasReference);
  const length=grounded&&validBounds(s.lengthLowFt,s.lengthHighFt);
  const width=grounded&&validBounds(s.widthLowFt,s.widthHighFt);
  return {...s,lengthLowFt:length?s.lengthLowFt:null,lengthHighFt:length?s.lengthHighFt:null,widthLowFt:width?s.widthLowFt:null,widthHighFt:width?s.widthHighFt:null};
 });
 return {surfaces,questions:(input.questions||[]).slice(0,10),observations:(input.observations||[]).slice(0,10)};
}
export function areaFt(length:number,width:number):number{
 if(!Number.isFinite(length)||!Number.isFinite(width)||length<=0||width<=0)throw new Error("Вкажи додатні довжину та ширину.");
 return Math.round(length*width*100)/100;
}
