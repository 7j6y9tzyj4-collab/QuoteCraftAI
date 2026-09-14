const ts=require('typescript');const fs=require('fs');const assert=require('node:assert/strict');
const mod={exports:{}};new Function('exports','require',ts.transpileModule(fs.readFileSync('lib/priceCatalog.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports,require);
const {bounds,validPrice,categoryOf,matches}=mod.exports;
const p={id:'paint_walls_sqft',name:'Paint walls',aliases:['фарбування стін'],unit:'sqft',rate:2.5};
assert.deepEqual(bounds(p),{min:2.5,max:2.5});assert(validPrice(p));assert.equal(categoryOf(p),'Фарбування та підготовка');assert(matches(p,'ФАРБУВАННЯ'));
assert(!validPrice({...p,rateMin:3,rateMax:2}));assert(!validPrice({...p,rateMin:1,rateMax:2}));assert(!validPrice({...p,rateMax:Infinity}));assert(validPrice({...p,rateMin:1,rateMax:3}));
assert.equal(categoryOf({...p,category:'Моя категорія'}),'Моя категорія');
const persisted=JSON.parse(JSON.stringify({...p,rateMin:1,rateMax:3,category:'Фарбування та підготовка'}));assert.deepEqual(bounds(persisted),{min:1,max:3});console.log('Catalog range, search, compatibility and persistence tests passed');
