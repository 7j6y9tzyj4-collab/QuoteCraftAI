const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const deps=process.env.PRICE_TEST_MODULES;
const React=require(path.join(deps,'react')),Renderer=require(path.join(deps,'react-test-renderer'));
global.IS_REACT_ACT_ENVIRONMENT=true;
function read(file){
 const filename=path.resolve(file),m=new Module(filename,module);m.paths=module.paths;
 const original=m.require.bind(m);
 m.require=id=>id==='react'?React:id==='react/jsx-runtime'?require(path.join(deps,'react/jsx-runtime')):id.startsWith('@/lib/')?read(id.replace('@/','')+'.ts'):original(id);
 m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename);return m.exports;
}
async function main(){
 const {normalizeSurvey,areaFt}=read('lib/photoMeasurements.ts');
 const raw={surfaces:[{name:'Floor',lengthLowFt:8,lengthHighFt:10,widthLowFt:5,widthHighFt:7,basis:'reference',evidence:'Visible reference'}],questions:[],observations:[]};
 assert.equal(normalizeSurvey(raw,false).surfaces[0].lengthLowFt,null,'no scale means no numeric estimate');
 assert.equal(normalizeSurvey(raw,true).surfaces[0].lengthLowFt,8);
 assert.equal(normalizeSurvey({...raw,surfaces:[{...raw.surfaces[0],lengthLowFt:12}]},true).surfaces[0].lengthLowFt,null,'reject reversed bounds');
 assert.equal(areaFt(9,6),54);assert.throws(()=>areaFt(Infinity,6));
 const {applyChicagoPrices,chicagoPrices}=read('lib/chicagoPrices.ts');
 const defaults=read('lib/defaults.ts').defaults;
 assert.equal(Object.keys(chicagoPrices).length,14);
 assert.ok(Object.keys(chicagoPrices).every(id=>defaults.some(p=>p.id===id)));
 const own={id:'CUSTOM',name:'My work',rate:42,aliases:[],unit:'each'};
 assert.equal(applyChicagoPrices([own])[0].rate,42);
 assert.equal(applyChicagoPrices(defaults).find(p=>p.id==='bathroom_mirror_install_each').rate,75);
 const Component=read('components/PhotoMeasurements.tsx').default;
 let view,approved='';
 global.fetch=async()=>({ok:true,json:async()=>raw});
 await Renderer.act(async()=>{view=Renderer.create(React.createElement(Component,{text:'Flooring',photos:['data:image/jpeg;base64,YQ=='],disabled:false,onApprove:v=>approved=v}))});
 const button=label=>view.root.findAllByType('button').find(n=>n.children.join('')===label);
 await Renderer.act(async()=>button('Оцінити розміри з фото').props.onClick());
 assert.equal(approved,'');assert.equal(button('Підтвердити та прорахувати').props.disabled,true);
 const consent=()=>view.root.findAllByType('input').filter(n=>n.props.type==='checkbox').at(-1);
 await Renderer.act(async()=>consent().props.onChange({target:{checked:true}}));
 assert.equal(button('Підтвердити та прорахувати').props.disabled,false);
 await Renderer.act(async()=>button('Підтвердити та прорахувати').props.onClick());
 assert.ok(approved.includes('54 sq ft'));
 await Renderer.act(async()=>view.root.findAllByType('input').find(n=>n.props.type==='number').props.onChange({target:{value:''}}));
 assert.equal(button('Підтвердити та прорахувати').props.disabled,true);
 await Renderer.act(async()=>view.unmount());
 console.log('PASS: no scale, supported reference, invalid bounds, area math, rate scope, custom price preservation, confirmation gate, editable dimensions');
}
main().catch(e=>{console.error(e);process.exitCode=1});
