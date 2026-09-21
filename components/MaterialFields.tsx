"use client";
import type {Item,PriceRule} from "@/lib/types";
type Value=Pick<PriceRule,"materialRate"|"materialMin"|"materialMax"|"materialStatus"|"materialNote">;
export default function MaterialFields({value,onChange,disabled=false}: {value:Value;onChange:(v:Value)=>void;disabled?:boolean}){
 const status=value.materialStatus??"unknown";
 return <fieldset disabled={disabled} className="materialFields"><legend>Матеріали за одиницю роботи</legend>
 <label>Стан оцінки<select value={status} onChange={e=>onChange({...value,materialStatus:e.target.value as Item["materialStatus"]})}><option value="unknown">Потрібна оцінка</option><option value="partial">Оцінено частину комплекту</option><option value="priced">Повний комплект оцінено</option><option value="none">Не потрібні</option></select></label>
 {status!=="none"&&<><div className="grid3">{(["materialMin","materialMax","materialRate"] as const).map((key,index)=><label key={key}>{["Матеріали від, $","Матеріали до, $","Вибрана ціна матеріалів, $"][index]}<input aria-label={key} type="number" min="0" step="0.01" value={value[key]??""} onChange={e=>onChange({...value,[key]:e.target.value===""?undefined:Number(e.target.value)})}/></label>)}</div><label>Що включено / що уточнити<input value={value.materialNote??""} onChange={e=>onChange({...value,materialNote:e.target.value})}/></label></>}
 {status==="partial"&&<p className="itemWarning">Це лише частина матеріалів. Її включено до попереднього підсумку; решту додай окремо або уточни бюджет.</p>}
 {status==="unknown"&&<p className="itemWarning">Матеріали ще не включено до суми. Вкажи діапазон і вибрану ціну повного комплекту або познач, що його надає клієнт.</p>}
 </fieldset>;
}
