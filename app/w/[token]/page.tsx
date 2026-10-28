import {loadLink,workerView} from "@/lib/workerView";
import WorkerPortal from "./WorkerPortal";

export const dynamic="force-dynamic";
export const metadata={title:"K&V — робочий кабінет",robots:{index:false}};

// Сторінка помічника: свої проєкти, години, чеки, фото. Без цін клієнта.
export default async function WorkerPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const link=await loadLink(token);
  if(!link)return <main className="shared"><div className="sharedCard" style={{textAlign:"center"}}><h1>Посилання не дійсне</h1><p>Попроси у Василя нове посилання.</p></div></main>;
  const v=await workerView(link);
  return <main className="shared"><WorkerPortal token={token} v={v}/></main>;
}
