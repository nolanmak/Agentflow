import {deepgramVoice} from '../public/deepgram-voices.js';
export const providers=['deepgram','openai','elevenlabs','9router'];
export const defaults={deepgram:{stt:'nova-3',tts:'aura-2-helena-en',voice:''},openai:{stt:'gpt-4o-mini-transcribe',tts:'gpt-4o-mini-tts',voice:'coral'},elevenlabs:{stt:'scribe_v2',tts:'eleven_flash_v2_5',voice:''},'9router':{stt:'',tts:'',voice:''}};
export function failure(code,message,status=400){return Object.assign(new Error(message),{code,status});}
function config(c,key){
 if(!providers.includes(c.provider))throw failure('invalid_provider','Unknown speech provider');
 if(!key&&c.provider!=='9router')throw failure('not_configured',`${c.provider} API key is not configured`);
 if(!c.model?.trim())throw failure('invalid_model','Choose a speech model in Settings');
 let base=c.provider==='9router'?(c.baseUrl||'http://127.0.0.1:20128').replace(/\/+$/,'').replace(/\/v1$/,''):({deepgram:'https://api.deepgram.com',openai:'https://api.openai.com',elevenlabs:'https://api.elevenlabs.io'})[c.provider];
 let url;try{url=new URL(base)}catch{throw failure('invalid_url','Invalid router URL')}
 if(url.username||url.password||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw failure('invalid_url','Use HTTPS or a loopback HTTP router URL');
 const headers=c.provider==='elevenlabs'?{'xi-api-key':key}:key?{Authorization:`${c.provider==='deepgram'?'Token':'Bearer'} ${key}`} : {};
 return {base,headers};
}
async function request(url,options,signal,fetcher){
 signal?.throwIfAborted();
 let r;try{r=await fetcher(url,{...options,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});}catch(e){if(signal?.aborted)throw failure('canceled','Request aborted');throw failure('provider_unavailable','Speech provider is unreachable or timed out',502)}
 if(!r.ok){await r.body?.cancel();const code=({401:'unauthorized',403:'unauthorized',429:'rate_limited',400:'invalid_configuration',404:'invalid_model'})[r.status]||'provider_unavailable';throw failure(code,`Speech provider: ${code.replaceAll('_',' ')} (HTTP ${r.status}). Check Settings.`,502)}
 return r;
}
export async function transcribe(c,key,audio,mime='audio/webm',signal,fetcher=fetch){
 const {base,headers}=config(c,key);if(!audio?.length||audio.length>20*1024*1024)throw failure('invalid_audio','Audio must be between 1 byte and 20 MB');
 if(!/^audio\/(webm|wav|x-wav|mpeg|mp3|mp4|ogg|flac)(;.*)?$/.test(mime))throw failure('invalid_audio','Unsupported audio format');
 let url,body;
 if(c.provider==='deepgram'){url=`${base}/v1/listen?model=${encodeURIComponent(c.model)}&smart_format=true`;headers['Content-Type']=mime;body=audio;}
 else {url=`${base}/v1/${c.provider==='elevenlabs'?'speech-to-text':'audio/transcriptions'}`;body=new FormData();body.append(c.provider==='elevenlabs'?'model_id':'model',c.model);body.append('file',new Blob([audio],{type:mime}),`recording.${mime.includes('wav')?'wav':mime.includes('mp4')?'mp4':mime.includes('mpeg')?'mp3':'webm'}`);}
 const r=await request(url,{method:'POST',headers,body},signal,fetcher);
 let data;try{data=await r.json()}catch{throw failure('malformed_response','Speech provider returned an invalid transcript',502)}
 const text=c.provider==='deepgram'?data.results?.channels?.[0]?.alternatives?.[0]?.transcript:data.text;
 if(typeof text!=='string')throw failure('malformed_response','Speech provider returned no valid transcript',502);
 return {text:text.trim()};
}
export async function synthesize(c,key,text,signal,fetcher=fetch){
 const {base,headers}=config(c,key);if(typeof text!=='string'||!text.trim()||text.length>12000)throw failure('invalid_text','Speech text must contain 1–12000 characters');
 let url,body;headers['Content-Type']='application/json';
 if(c.provider==='deepgram'){url=`${base}/v1/speak?model=${encodeURIComponent(c.model)}&encoding=mp3`;body={text};}
 else if(c.provider==='elevenlabs'){if(!c.voice?.trim())throw failure('invalid_voice','Choose an ElevenLabs voice ID in Settings');url=`${base}/v1/text-to-speech/${encodeURIComponent(c.voice)}?output_format=mp3_44100_128`;body={text,model_id:c.model};}
 else {url=`${base}/v1/audio/speech`;body={model:c.model,input:text,voice:c.voice||'coral',response_format:'mp3'};}
 const r=await request(url,{method:'POST',headers,body:JSON.stringify(body)},signal,fetcher);const mime=r.headers.get('content-type')?.split(';')[0]||'';
 if(!mime.startsWith('audio/')&&mime!=='application/octet-stream'){await r.body?.cancel();throw failure('malformed_response','Speech provider did not return audio',502)}
 const reader=r.body.getReader();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24*1024*1024)throw failure('too_large','Speech output exceeded 24 MB');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{})}
 if(!size)throw failure('malformed_response','Speech provider returned empty audio',502);
 return {audio:Buffer.concat(chunks),mime:mime==='application/octet-stream'?'audio/mpeg':mime};
}

export function previewConfig(config,model){
 if(model===undefined)return {...config};
 if(config.provider!=='deepgram'||typeof model!=='string'||!deepgramVoice(model))throw failure('invalid_preview','Choose a listed Deepgram voice to preview');
 return {...config,model};
}
