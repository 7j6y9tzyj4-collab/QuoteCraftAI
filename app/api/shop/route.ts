import {NextRequest,NextResponse} from "next/server";
import {userFromReq,aiGuard} from "@/lib/aiGuard";
import {shopKind,splitShop,shopList,shopAdd,shopToggle,shopDel,shopClearDone} from "@/lib/shop";
export const runtime="nodejs";
// 🛒 Список покупок по проєкту — для власника (той самий список бачить помічник за своїм посиланням).
export async function POST(req:NextRequest){
  try{
    const uid=await userFromReq(req);if(!uid)return NextResponse.json({error:"auth"},{status:401});
    const b=await req.json();const sid=String(b?.sid||"");const kind=shopKind(b?.kind);if(!sid)return NextResponse.json({error:"sid"},{status:400});
    if(b.action==="add"){const text=String(b.text||"");const g=text.length>=25?await aiGuard(req,"shop-list",0.001,uid):null;
      await shopAdd(uid,sid,g&&!g.ok?text.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean):await splitShop(text,kind),"owner",kind)}
    else if(b.action==="toggle")await shopToggle(uid,String(b.id),!!b.done);
    else if(b.action==="del")await shopDel(uid,String(b.id));
    else if(b.action==="clear")await shopClearDone(uid,sid,kind);
    return NextResponse.json({items:await shopList(uid,sid,kind)});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Server error"},{status:500})}
}
