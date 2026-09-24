import {products,recipePacks,type Store} from "./materials";

// Список закупівлі на весь кошторис: сумуємо витрату товарів усіх робіт і
// округлюємо до цілих упаковок (фарбу — до галонів, плитку — до sq ft з запасом 10%,
// який уже є в рецептах). Це для власника — що купити в Home Depot / Floor & Decor.

export type ShopLine={taskId:string;name:string;quantity:number;finishRate?:number};
export type ShopRow={pid:string;name:string;pack:string;need:number;packs:number;price:number;cost:number;url:string;kind:"install"|"finish"};
export type ShopStore={store:Store;rows:ShopRow[];subtotal:number};
export type ShoppingList={stores:ShopStore[];total:number;notCovered:string[];packageInstall:string[]};

const r2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;

export function buildShoppingList(lines:ShopLine[],includeFinish=true):ShoppingList{
  const need:Record<string,{q:number;kind:"install"|"finish"}>={};
  const notCovered:string[]=[],packageInstall:string[]=[];
  for(const li of lines){
    const qty=Number(li.quantity)||0;
    if(qty<=0)continue;
    const isPackage=/^(br|kp)_/.test(li.taskId);
    // у пакетних позиціях монтажні матеріали — сумою з кошторисів власника, без переліку товарів
    if(isPackage)packageInstall.push(li.name);
    const p=recipePacks(li.taskId,qty);
    if(!p){if(!isPackage)notCovered.push(li.name);continue}
    for(const [pid,q] of Object.entries(p.install)){
      need[pid]=need[pid]||{q:0,kind:"install"};
      need[pid].q+=q;
    }
    // оздоблення: не купуємо, якщо вимкнене або клієнт дає сам (finishRate 0)
    const finishOn=includeFinish&&(li.finishRate===undefined||Number(li.finishRate)>0);
    if(finishOn)for(const [pid,q] of Object.entries(p.finish)){
      if(!need[pid])need[pid]={q:0,kind:"finish"};
      need[pid].q+=q;
    }
  }
  const byStore=new Map<Store,ShopRow[]>();
  for(const [pid,{q,kind}] of Object.entries(need)){
    const pr=products[pid];
    if(!pr||q<=0)continue;
    const packs=Math.max(1,Math.ceil(q-1e-6));
    const row:ShopRow={pid,name:pr.name,pack:pr.pack,need:q,packs,price:pr.price,cost:r2(packs*pr.price),url:pr.url,kind};
    if(!byStore.has(pr.store))byStore.set(pr.store,[]);
    byStore.get(pr.store)!.push(row);
  }
  const stores:ShopStore[]=[...byStore.entries()].map(([store,rows])=>{
    rows.sort((a,b)=>a.kind===b.kind?b.cost-a.cost:a.kind==="install"?-1:1);
    return {store,rows,subtotal:r2(rows.reduce((s,r)=>s+r.cost,0))};
  }).sort((a,b)=>b.subtotal-a.subtotal);
  return {stores,total:r2(stores.reduce((s,x)=>s+x.subtotal,0)),notCovered:[...new Set(notCovered)],packageInstall:[...new Set(packageInstall)]};
}
