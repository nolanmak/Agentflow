// Paid opt-in test; uses only a disposable native Codex session and synthetic speech.
import {createApp} from '../src/server.js';
import {mkdtemp,realpath,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import WebSocket from 'ws';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {exec} from '../src/store.js';
const dir=await realpath(await mkdtemp(join(tmpdir(),'agentflow-pipeline-')));const app=await createApp({port:0,dir:join(dir,'state')});const clients=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const {token}=await(await fetch(app.url+'/api/bootstrap')).json();
 const request=async(path,body,raw=false)=>{const r=await fetch(app.url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'x-agentflow-token':token,'Content-Type':raw?'audio/mpeg':'application/json'},body:body===undefined?undefined:raw?body:JSON.stringify(body)});if(!r.ok)throw Error((await r.json()).error);return r.headers.get('content-type').startsWith('audio/')?Buffer.from(await r.arrayBuffer()):r.json()};
 const native=await request('/terminals',{agent:'codex',cwd:dir});
 async function view(){const ws=new WebSocket(app.url.replace('http','ws')+'/terminal');const v={ws,screen:''};clients.push(v);ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='output')v.screen+=m.data});await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j)});ws.send(JSON.stringify({type:'attach',token,agent:'codex',id:native.id}));return v}
 const terminal=await view(),browser=await view();const input=data=>terminal.ws.send(JSON.stringify({type:'input',data}));
 await sleep(3500);if(/trust/i.test(terminal.screen)){input('\r');await sleep(1000)}
 const text='Remember the word pineapple. Reply only remembered. Do not use tools.';input('\x1b[200~'+text+'\x1b[201~');await sleep(150);input('\r');
 const session=app.terminals.get('codex',native.id);const deadline=Date.now()+120000;let first;
 while(Date.now()<deadline){await sleep(500);if(session.pending)continue;try{first=await request('/history?agent=codex&id='+session.id);if(first.messages.some(m=>m.role==='assistant'&&/remembered/i.test(m.text)))break}catch{}}
 assert.ok(first?.messages.some(m=>m.role==='assistant'&&/remembered/i.test(m.text)),'Typed terminal response did not reach native history');
 const speech=await request('/synthesize',{text:'What word did I ask you to remember? Reply with only that word. Do not use tools.'});const transcription=await request('/transcribe',speech,true);console.log('Live Deepgram transcript:',transcription.text);
 const job=await request('/turns',{id:randomUUID(),agent:'codex',sessionId:session.id,text:transcription.text,voice:false});let result;const until=Date.now()+120000;
 do{await sleep(300);result=await request('/jobs/'+job.id);if(!['running','approval'].includes(result.status))break}while(Date.now()<until);
 assert.equal(result.status,'complete',result.error);assert.match(result.reply,/pineapple/i);assert.equal(session.pid,native.pid);assert.equal(session.exited,false);
 const history=await request('/history?agent=codex&id='+session.id);assert.ok(history.messages.some(m=>m.role==='user'&&m.text===transcription.text));assert.ok(history.messages.every(m=>m.timestamp));await sleep(300);assert.match(terminal.screen,/pineapple/i);assert.match(browser.screen,/pineapple/i);
 const audio=await request('/synthesize',{text:result.reply});const path=join(dir,'response.mp3');await writeFile(path,audio,{mode:0o600});await exec('/usr/bin/afplay',[path]);await rm(path);
 console.log(JSON.stringify({nativeSession:session.id,samePid:native.pid,reply:result.reply.trim(),audioBytes:audio.length,terminalAndBrowserUpdated:true,timestamps:true,exactTranscript:true}));
}finally{for(const v of clients)v.ws.close();await app.close();await rm(dir,{recursive:true,force:true})}
