// Install React + matching react-test-renderer in a separate folder, then set PRICE_TEST_MODULES.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const deps=process.env.PRICE_TEST_MODULES;
if(!deps)throw new Error('Set PRICE_TEST_MODULES to the test dependency node_modules folder');
const React=require(path.join(deps,'react')),Renderer=require(path.join(deps,'react-test-renderer'));
global.IS_REACT_ACT_ENVIRONMENT=true;
global.window={addEventListener(){},removeEventListener(){}};
function read(file){
 const name=path.resolve(file),m=new Module(name,module);m.paths=module.paths;
 const original=m.require.bind(m);
 m.require=id=>id==='react'?React:id==='react/jsx-runtime'?require(path.join(deps,'react/jsx-runtime')):id==='@/lib/defaults'?read('lib/defaults.ts'):original(id);
 m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,name);return m.exports;
}
const Editor=read('components/PriceEditor.tsx').default,defaults=read('lib/defaults.ts').defaults;
async function main(){
 let saved,fail=false,calls=0;
 let prices=defaults.map(p=>({...p,rate:175}));
 const onSave=async x=>{calls++;if(fail)throw new Error('Offline');saved=x;return 'Saved'};
 let view;
 await Renderer.act(async()=>{view=Renderer.create(React.createElement(Editor,{prices,onSave}))});
 const button=label=>view.root.findAllByType('button').find(n=>n.children.join('')===label);
 const input=id=>view.root.findAllByType('input').find(n=>n.props['aria-label']==='Ціна: '+defaults.find(p=>p.id===id).name);
 const mirror=()=>input('bathroom_mirror_install_each');
 await Renderer.act(async()=>button('Застосувати $75 / $125').props.onClick());
 assert.equal(mirror().props.value,75);assert.equal(input('vanity_light_install_each').props.value,125);
 assert.equal(input('light_fixture_replace').props.value,125);
 assert.equal(calls,0,'editing must not save automatically');
 prices=prices.map(p=>({...p,rate:999}));
 await Renderer.act(async()=>view.update(React.createElement(Editor,{prices,onSave})));
 assert.equal(mirror().props.value,75,'background refresh must preserve draft');
 await Renderer.act(async()=>mirror().props.onChange({target:{value:''}}));
 assert.equal(button('Зберегти ціни').props.disabled,true);
 await Renderer.act(async()=>mirror().props.onChange({target:{value:'80'}}));
 fail=true;await Renderer.act(async()=>button('Зберегти ціни').props.onClick());
 assert.equal(mirror().props.value,80);assert.equal(saved,undefined);
 fail=false;await Renderer.act(async()=>button('Зберегти ціни').props.onClick());
 assert.equal(saved.find(p=>p.id==='bathroom_mirror_install_each').rate,80);
 await Renderer.act(async()=>button('Повернути заводські ціни').props.onClick());
 const before=calls;
 await Renderer.act(async()=>button('Так, повернути').props.onClick());
 assert.equal(calls,before);assert.equal(mirror().props.value,75);
 await Renderer.act(async()=>button('Зберегти ціни').props.onClick());
 assert.deepEqual(saved,defaults);
 await Renderer.act(async()=>view.unmount());
 console.log('PASS: new defaults, draft-only editing, preserve dirty draft on refresh, reject blank price, retry failed save, confirmed factory reset + explicit save');
}
main().catch(e=>{console.error(e);process.exitCode=1});
