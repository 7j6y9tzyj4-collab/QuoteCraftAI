// 🎙 Запис зустрічі з клієнтом: розмова → текст → підсумок, обсяг робіт, питання, завдання, повідомлення клієнту.
export type Meeting={
  id:string;date:string;durationSec:number;
  title:string;summary:string;
  scope:string[];questions:string[];tasks:string[];
  /** готове повідомлення клієнту (англійською) */ followup:string;
  /** дати/строки, які прозвучали в розмові */ when:string;
  /** опис робіт для калькулятора естімейту */ estimatePrompt:string;
  transcript:string;
};
export const fmtDur=(s:number)=>{const m=Math.floor(s/60),x=Math.floor(s%60);return `${m}:${String(x).padStart(2,"0")}`};
