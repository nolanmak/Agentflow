import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transcribe,synthesize} from '../src/speech.js';
import {Settings,Jobs} from '../src/state.js';
import {authorize} from '../src/security.js';
import {mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const key='SENTINEL_SECRET';
for(const provider of ['deepgram','openai','elevenlabs','9router']) {
 test(`${provider}: transcription request and normalized text`,async()=>{
  let seen; const fetch=async(u,o)=>{seen={u:String(u),...o};return Response.json(provider==='deepgram'?{results:{channels:[{alternatives:[{transcript:'Hello Agentflow'}]}]}}:{text:'Hello Agentflow'});};
  const result=await transcribe({provider,model:'test-model',baseUrl:'http://127.0.0.1:20128'},key,Buffer.from('audio'),'audio/wav',undefined,fetch);
  assert.equal(result.text,'Hello Agentflow');assert.equal(seen.method,'POST');assert.equal(seen.redirect,'error');
  assert.equal(seen.headers[provider==='elevenlabs'?'xi-api-key':'Authorization'],provider==='deepgram'?`Token ${key}`:provider==='elevenlabs'?key:`Bearer ${key}`);
  if(provider==='deepgram') assert.match(seen.u,/\/v1\/listen/); else assert.ok(seen.body instanceof FormData);
 });
 test(`${provider}: speech yields playable bytes`,async()=>{
  let seen;const result=await synthesize({provider,model:'voice-model',voice:'voice1',baseUrl:'http://127.0.0.1:20128'},key,'Hello',undefined,async(u,o)=>{seen={u:String(u),...o};return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}})});
  assert.equal(result.mime,'audio/mpeg');assert.equal(result.audio.length,3);assert.ok(seen.body.includes('Hello'));
 });
 test(`${provider}: provider error is redacted`,async()=>{
  await assert.rejects(()=>synthesize({provider,model:'x',voice:'v',baseUrl:'http://127.0.0.1:20128'},key,'Hi',undefined,async()=>new Response(key,{status:401})),e=>e.code==='unauthorized'&&!e.message.includes(key));
 });
}
test('speech refuses empty input, missing keys, malformed success and cancellation',async()=>{
 await assert.rejects(()=>synthesize({provider:'deepgram',model:'x'},'', 'Hi'),/key/i);
 await assert.rejects(()=>synthesize({provider:'deepgram',model:'x'},key, ''),/text/i);
 await assert.rejects(()=>transcribe({provider:'deepgram',model:'x'},key,Buffer.from('x'),'audio/wav',undefined,async()=>Response.json({})),/transcript/i);
 const c=new AbortController();c.abort();await assert.rejects(()=>synthesize({provider:'deepgram',model:'x'},key,'Hi',c.signal),/abort/i);
});
test('settings never return secrets and input/output remain independent',async()=>{
 const m=new Map([['deepgram',key]]); const store={get:async p=>m.get(p)||'',set:async(p,k)=>m.set(p,k),delete:async p=>m.delete(p)};
 const settings=new Settings(store,await mkdtemp(join(tmpdir(),'af-settings-')));await settings.init();
 await settings.update({stt:{provider:'openai',model:'test'}});let p=await settings.public();assert.equal(p.stt.provider,'openai');assert.equal(p.tts.provider,'deepgram');assert.ok(!JSON.stringify(p).includes(key));assert.equal(p.configured.deepgram,true);
 await assert.rejects(()=>settings.update({stt:{provider:'evil'}}),/provider/i);
});
test('requests reject foreign origins, hosts, cross-site bootstrap and invalid tokens',()=>{
 const h={host:'127.0.0.1:4317','x-agentflow-token':'token'};
 assert.equal(authorize({headers:h,url:'/api/sessions'},4317,'token'),true);
 for(const headers of [{...h,origin:'https://evil.test'},{...h,host:'evil.test:4317'},{host:h.host},{...h,'sec-fetch-site':'cross-site'}])assert.throws(()=>authorize({headers,url:'/api/sessions'},4317,'token'));
 assert.throws(()=>authorize({headers:{host:h.host,'sec-fetch-site':'cross-site'},url:'/api/bootstrap'},4317,'token'));
});
test('jobs deduplicate IDs and serialize writers; completion persists',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'af-jobs-'));let calls=0,finish;
 const jobs=new Jobs(dir,async(job,emit)=>{calls++;await new Promise(r=>finish=r);emit({type:'text',text:'done'});});await jobs.init();
 const input={id:'operation-1',agent:'codex',sessionId:'session-1',text:'hello',cwd:dir};const a=await jobs.start(input);const b=await jobs.start(input);assert.equal(a.id,b.id);assert.equal(calls,1);
 await assert.rejects(()=>jobs.start({...input,id:'operation-2'}),/busy/i);finish();await new Promise(r=>setTimeout(r,30));assert.equal(jobs.get(a.id).status,'complete');
 const reboot=new Jobs(dir,async()=>{throw Error('duplicate')});await reboot.init();assert.equal((await reboot.start(input)).status,'complete');
});
test('operation retries survive native session ID resolution without a duplicate turn',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'af-alias-'));let calls=0;
 const jobs=new Jobs(dir,async(job,emit)=>{calls++;emit({type:'session',id:'native-id'});emit({type:'text',text:'done'})});await jobs.init();
 const input={id:'stable-operation',agent:'codex',sessionId:'provisional-id',text:' exact words ',cwd:dir};
 await jobs.start(input);await new Promise(r=>setTimeout(r,30));
 assert.equal((await jobs.start(input)).sessionId,'native-id');assert.equal(calls,1);
 const reboot=new Jobs(dir,async()=>{throw Error('duplicate')});await reboot.init();assert.equal((await reboot.start(input)).reply,'done');
});
