import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {load,save,appHome} from './store.js';import {providers,defaults,failure} from './speech.js';
export class Settings {
 constructor(store,dir=appHome){this.store=store;this.file=join(dir,'settings.json');this.value={stt:{provider:'deepgram',model:defaults.deepgram.stt},tts:{provider:'deepgram',model:defaults.deepgram.tts,voice:''},routerUrl:'http://127.0.0.1:20128'}}
 async init(){this.value=await load(this.file,this.value)}
 async public(){const configured={};for(const p of providers)configured[p]=!!await this.store.get(p);return {...structuredClone(this.value),configured,defaults};}
 async update(input){const next=structuredClone(this.value);for(const side of ['stt','tts'])if(input[side]){const c=input[side];if(!providers.includes(c.provider))throw failure('invalid_provider','Invalid provider');if(typeof c.model!=='string'||c.model.length>200)throw failure('invalid_model','Invalid model');next[side]={provider:c.provider,model:c.model.trim(),voice:typeof c.voice==='string'?c.voice.slice(0,200):''};}
 if(input.routerUrl!==undefined){const u=new URL(input.routerUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw failure('invalid_url','Invalid router URL');next.routerUrl=u.href.replace(/\/$/,'');}await save(this.file,next);this.value=next;return this.public();}
 async speech(side){return {...structuredClone(this.value[side]),baseUrl:this.value.routerUrl};}
}
export class Jobs {
 constructor(dir,runner){this.file=join(dir,'jobs.json');this.runner=runner;this.jobs=new Map();this.active=new Map();this.approvals=new Map();this.write=Promise.resolve();}
 async init(){for(const job of await load(this.file,[])){if(['running','approval'].includes(job.status)){job.status='uncertain';job.error='Service restarted during this turn. Inspect native history before sending again.'}this.jobs.set(job.id,job)}}
 persist(){const data=[...this.jobs.values()].slice(-100);this.write=this.write.then(()=>save(this.file,data));return this.write;}
 get(id){const j=this.jobs.get(id);if(!j)throw failure('not_found','Turn not found',404);return j;}
 async start(input){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(input.id))throw failure('invalid_id','Invalid operation ID');if(this.jobs.has(input.id)){const old=this.get(input.id);if(old.agent!==input.agent||(old.requestSessionId||old.sessionId)!==input.sessionId||old.text!==input.text)throw failure('conflict','Operation ID was already used for another request',409);return old;}
 let key=input.agent+':'+input.sessionId;if(this.active.has(key))throw failure('busy','This session is busy',409);
 const job={...input,requestSessionId:input.sessionId,status:'running',reply:'',events:[],createdAt:new Date().toISOString()};this.jobs.set(job.id,job);const controller=new AbortController();this.active.set(key,{job,controller});
 await this.persist();
 const emit=e=>{if(job.status==='canceled')return;if(e.type==='session'){const active=this.active.get(key);this.active.delete(key);job.sessionId=e.id;key=job.agent+':'+e.id;if(active)this.active.set(key,active);}if(e.type==='text')job.reply+=e.text;if(e.type==='replace')job.reply=e.text;job.events.push(e);if(job.events.length>1000)job.events.shift();};
 this.runner(job,emit,controller.signal,(description)=>this.ask(job,description)).then(()=>{if(job.status!=='canceled')job.status='complete'}).catch(e=>{if(job.status!=='canceled'){job.status='error';job.error=e.message||'Agent failed'}}).finally(()=>{this.active.delete(key);for(const [id,p]of this.approvals)if(p.job===job){p.resolve(false);this.approvals.delete(id)}this.persist().catch(()=>{});});return job;
 }
 async ask(job,description){const id=randomUUID();job.status='approval';job.approval={id,description};return new Promise(resolve=>this.approvals.set(id,{job,resolve}));}
 answer(id,allow){const p=this.approvals.get(id);if(!p)throw failure('not_found','Approval expired',404);p.job.status='running';delete p.job.approval;p.resolve(allow===true);this.approvals.delete(id);}
 async cancel(id){const job=this.get(id);for(const {job:j,controller}of this.active.values())if(j.id===id){job.status='canceled';controller.abort();}for(const [aid,p]of this.approvals)if(p.job===job)this.answer(aid,false);job.status='canceled';delete job.approval;await this.persist();return job;}
}
