"use client";
import dynamic from "next/dynamic";
const SplatViewer=dynamic(()=>import("@/components/SplatViewer"),{ssr:false});
export default function SplatView({url,fileName,flip}:{url:string;fileName:string;flip:boolean}){
  return <SplatViewer url={url} fileName={fileName} flip={flip} height="70vh" lang="en"/>;
}
