// Offline contract checks; no network requests or paid API calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const ts=require('typescript');
let nextResult, calls=0, sent;
class MockOpenAI{
  constructor(){this.chat={completions:{create:async args=>{
    calls++;sent=args;return {choices:[{message:{content:JSON.stringify(nextResult)}}]};
  }}};this.audio={transcriptions:{create:async()=>({text:'клазет 64 дюйми'})}}}
}
function route(file){
  const filename=path.resolve(file);
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;
  const original=mod.require.bind(mod);
  mod.require=name=>name==='openai'?MockOpenAI:original(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
  }).outputText,filename);
  return mod.exports.POST;
}
async function main(){
  const parse=route('app/api/parse-estimate/route.ts');
  const transcribe=route('app/api/transcribe/route.ts');
  const prices=[{id:'paint_walls_sqft',name:'Paint walls',aliases:[],unit:'sqft',rate:2}];
  const request=body=>new Request('http://localhost/api/parse-estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prices,...body})});
  delete process.env.OPENAI_API_KEY;
  assert.equal((await transcribe(new Request('http://localhost',{method:'POST'}))).status,503);
  process.env.OPENAI_API_KEY='offline-test-placeholder';
  assert.equal((await parse(request({text:'paint',photos:['https://example.com/photo.jpg']}))).status,400);
  assert.equal((await parse(request({text:'paint',photos:Array(5).fill('data:image/jpeg;base64,YQ==')}))).status,400);
  assert.equal(calls,0);
  nextResult={items:[],questions:['Яка площа стін?']};
  const uncertain=await (await parse(request({text:'Пофарбувати кімнату',photos:['data:image/jpeg;base64,YQ==']}))).json();
  assert.deepEqual(uncertain,nextResult);
  assert.equal(sent.messages[1].content[1].type,'image_url');
  nextResult={items:[{serviceId:'CUSTOM',description:'Labor including painting',quantity:1,unit:'each',note:'Client supplies tile.',confidence:1,explicitRate:4000}],questions:[]};
  const fixed=await (await parse(request({text:'Paint room 25 by 18 feet height 8. Total labor 4000.'}))).json();
  assert.deepEqual(fixed,nextResult,'fixed labor must not be overwritten or double charged');
  nextResult={items:[],questions:['Що потрібно зробити на фото?']};
  assert.deepEqual(await (await parse(request({photos:['data:image/jpeg;base64,YQ==']}))).json(),nextResult);
  const form=new FormData();form.append('audio',new Blob([new Uint8Array(3*1024*1024+1)]),'voice.mp4');
  assert.equal((await transcribe(new Request('http://localhost',{method:'POST',body:form}))).status,400);
  console.log('PASS: missing key, invalid photo URL, photo count, clarification preservation, multimodal request, fixed total, photo-only clarification, audio size limit');
}
main().catch(error=>{console.error(error);process.exitCode=1});
