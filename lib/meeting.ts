// 🎙 Запис зустрічі з клієнтом: розмова → текст → підсумок, обсяг робіт, питання, завдання, повідомлення клієнту.
/** рядок обсягу робіт з розмови: on — піде в естімейт; verify — кількість/деталь треба перевірити на місці */
export type ScopeLine={id:string;room:string;item:string;qty:string;category:string;note:string;verify:boolean;on:boolean};
export type Meeting={
  id:string;date:string;durationSec:number;
  title:string;summary:string;
  scope:string[];questions:string[];tasks:string[];
  /** обсяг робіт по кімнатах з галочками (нові записи) */ lines?:ScopeLine[];
  /** що перевірити: нерозбірливі місця запису, суперечливі цифри */ checks?:string[];
  /** готове повідомлення клієнту (англійською) */ followup:string;
  /** дати/строки, які прозвучали в розмові */ when:string;
  /** опис робіт для калькулятора естімейту */ estimatePrompt:string;
  transcript:string;
};
/** текст для калькулятора естімейту з позначених рядків */
export function linesToPrompt(m:Meeting){
  const on=(m.lines||[]).filter(l=>l.on);if(!on.length)return m.estimatePrompt||m.scope.join("; ");
  const rooms=Array.from(new Set(on.map(l=>l.room||"")));
  return rooms.map(r=>`${r||"Work"}:\n`+on.filter(l=>(l.room||"")===r).map(l=>`- ${l.item}${l.qty?` — ${l.qty}`:""}${l.note?` (${l.note})`:""}`).join("\n")).join("\n\n");
}
export const fmtDur=(s:number)=>{const m=Math.floor(s/60),x=Math.floor(s%60);return `${m}:${String(x).padStart(2,"0")}`};
