import {timingSafeEqual} from 'node:crypto';
import {failure} from './speech.js';
export function authorize(req,port,token){
 const h=req.headers,allowed=[`127.0.0.1:${port}`,`localhost:${port}`];
 if(!allowed.includes(h.host)||h['sec-fetch-site']==='cross-site'||(h.origin&&!allowed.map(x=>'http://'+x).includes(h.origin)))throw failure('forbidden','Local origin required',403);
 if(req.url==='/api/bootstrap')return true;
 const given=h['x-agentflow-token']||'';
 if(given.length!==token.length||!timingSafeEqual(Buffer.from(given),Buffer.from(token)))throw failure('unauthorized','Local authentication required',401);
 return true;
}
