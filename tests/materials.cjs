const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const cache=new Map();
function read(file){const name=path.resolve(file);if(cache.has(name))return cache.get(name).exports;const m=new Module(name,module);m.paths=module.paths;cache.set(name,m);const orig=m.require.bind(m);m.require=id=>id.startsWith('@/')?read(id.slice(2)+'.ts'):id.startsWith('.')?read(path.resolve(path.dirname(name),id)+'.ts'):orig(id);m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,name);return m.exports;}
const {estimateAmounts:calc,lineAmounts,snapshot,validItem,validEstimate}=read('lib/estimateMath.ts');
const {defaults,applyApprovedCatalog}=read('lib/defaults.ts');const {validPrice}=read('lib/priceCatalog.ts');
const job=items=>({items,discount:0,tax:0,deposit:25});
const item=(serviceId,quantity)=>{const p=defaults.find(x=>x.id===serviceId);assert(p,serviceId);return {id:serviceId,serviceId,description:p.name,quantity,unit:p.unit,unitPrice:p.rate,...snapshot(p)}};
assert(defaults.every(validPrice));assert.equal(new Set(defaults.map(x=>x.id)).size,defaults.length);
const paint=item('paint_walls_sqft',400);let a=calc(job([paint]));assert.equal(a.labor,652);assert.equal(a.materials,132);assert.equal(a.min,500);assert.equal(a.max,1016);assert.equal(a.total,784);assert.equal(a.unknown,1);
const floor=item('lvp_install_sqft',120);a=calc(job([floor]));assert.equal(a.labor,270);assert.equal(a.materials,357.60);assert.equal(a.total,627.60);
const toilet={...item('toilet_replace',1),customerMaterials:true};const faucet={...item('bathroom_faucet_replace',1),materialStatus:'priced',materialMin:80,materialMax:120,materialRate:100};const mirror={...item('bathroom_mirror_install_each',1),customerMaterials:true};a=calc({...job([toilet,faucet,mirror]),discount:20,tax:10,deposit:25});assert.equal(a.labor,400);assert.equal(a.materials,100);assert.equal(a.total,528);assert.equal(a.deposit,132);assert.equal(a.unknown,0);
assert.equal(lineAmounts({...floor,customerMaterials:true}).materials,0);assert.equal(lineAmounts({...floor,customerMaterials:true}).unknown,false);
assert.equal(lineAmounts({...floor,materialStatus:'unknown'}).materials,0);assert(lineAmounts({...floor,materialStatus:'unknown'}).unknown);
const old={id:'old',description:'Legacy',quantity:3,unitPrice:25};assert.equal(calc(job([old])).total,75);assert.equal(calc(job([old])).unknown,0);
const saved=JSON.parse(JSON.stringify(job([paint,floor])));const before=calc(saved);const changed=defaults.map(p=>({...p,rate:999}));assert.deepEqual(calc(saved),before);assert(changed[0].rate===999);
assert(!validItem({...floor,quantity:NaN}));assert(!validItem({...faucet,materialRate:Infinity}));assert(!validItem({...faucet,materialMin:121}));assert(!validItem({...faucet,materialRate:undefined}));assert(!validEstimate({...job([floor]),deposit:101}));
const custom={id:'my-work',name:'Custom',aliases:[],unit:'each',rate:7};const updated=applyApprovedCatalog([...defaults.map(p=>({...p,rate:999})),custom,{id:'paint_room',rate:650}]);assert.equal(updated.find(p=>p.id==='paint_walls_sqft').rateMin,1.04);assert(updated.some(p=>p.id==='my-work'));assert(!updated.some(p=>p.id==='paint_room'));
console.log(`PASS ${defaults.length} catalog entries; paint, floor, bathroom; separate labor/materials, ranges, partial/unknown, customer materials, tax/discount/deposit, old estimates, JSON persistence, invalid values and reset`);
