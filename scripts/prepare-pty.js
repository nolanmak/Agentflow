// node-pty's published macOS helper may lose its executable bit on installation.
import {chmod,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
if(process.platform==='darwin'){
 const helper=fileURLToPath(new URL(`../node_modules/node-pty/prebuilds/darwin-${process.arch}/spawn-helper`,import.meta.url));
 try{const s=await stat(helper);await chmod(helper,s.mode|0o100)}catch(e){if(e.code!=='ENOENT')throw e}
}
