import {supabaseAdmin} from "./supabaseAdmin";

// 🧠 Правила з правок власника: читаються при новому естімейті (AI застосовує) і при 🔍 перевірці (нагадує, що забув).
export type Lesson={id:string;text:string;count:number;source:string|null;example:string|null;active:boolean;created_at:string;updated_at:string};
export async function getLessons(user_id:string|null|undefined,limit=40):Promise<Lesson[]>{
  if(!user_id)return [];
  try{const {data}=await supabaseAdmin.from("calc_lessons").select("*").eq("user_id",user_id).eq("active",true).order("count",{ascending:false}).order("updated_at",{ascending:false}).limit(limit);return (data||[]) as Lesson[]}
  catch{return []}
}
const norm=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
/** Зберегти правило: якщо таке вже є (той самий текст) — +1 до лічильника. Повертає збережене. */
export async function saveLesson(user_id:string,text:string,source:string,example=""):Promise<Lesson|null>{
  const t=text.trim().slice(0,300);if(t.length<6)return null;
  const all=await getLessons(user_id,200);
  const same=all.find(l=>norm(l.text)===norm(t));
  if(same){const {data}=await supabaseAdmin.from("calc_lessons").update({count:same.count+1,updated_at:new Date().toISOString(),example:example.slice(0,300)||same.example}).eq("id",same.id).select("*").maybeSingle();return data as Lesson}
  const {data}=await supabaseAdmin.from("calc_lessons").insert({user_id,text:t,source,example:example.slice(0,300)}).select("*").maybeSingle();
  return data as Lesson;
}
export function lessonsPrompt(ls:Lesson[],mode:"generate"|"review"){
  if(!ls.length)return "";
  const list=ls.map(l=>`- ${l.text}${l.count>1?` (${l.count}x)`:""}`).join("\n");
  return mode==="generate"
    ?`This contractor's personal rules, learned from how he corrected past estimates. Apply each rule when it fits THIS job (add the usual line, use his usual quantity/difficulty). His explicit words in the current job description always win over these rules. Do not apply a rule to an unrelated kind of job.\n${list}`
    :`This contractor's personal habits, learned from his past corrections. If a habit fits this job and the estimate is missing it, add an item (level "medium", text starts with "🧠 Зазвичай ти…" / "🧠 You usually…"). Do not repeat habits that are already covered.\n${list}`;
}
