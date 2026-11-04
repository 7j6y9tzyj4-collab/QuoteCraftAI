// Профіль компанії власника акаунта (user_settings.company). Замість вшитого «K&V House Renovation».
// Клієнтський кеш: QuoteCraftApp завантажує профіль при вході і кладе сюди через setCompany().
export type Company={name:string;owner:string;phone:string;email:string;license:string;address:string;website:string;logo:string};
export const EMPTY_COMPANY:Company={name:"",owner:"",phone:"",email:"",license:"",address:"",website:"",logo:""};

let cur:Company={...EMPTY_COMPANY};
export function setCompany(c:Partial<Company>|null|undefined){cur={...EMPTY_COMPANY,...(c||{})}}
export const getCompany=()=>cur;
export const companyName=(c:Company=cur)=>c.name.trim()||"Your Company";
export const ownerFirst=(c:Company=cur)=>c.owner.trim().split(/\s+/)[0]||"";
export function companyContact(c:Company=cur){return [c.phone,c.email].map(x=>x.trim()).filter(Boolean).join(" · ")}
export function signature(c:Company=cur){const o=ownerFirst(c);return `— ${[o,companyName(c)].filter(Boolean).join(", ")}`}
export const cleanCompany=(x:any):Company=>({...EMPTY_COMPANY,...Object.fromEntries(Object.entries(x||{}).filter(([k,v])=>k in EMPTY_COMPANY&&typeof v==="string").map(([k,v])=>[k,String(v).slice(0,k==="logo"?400000:200)]))});
