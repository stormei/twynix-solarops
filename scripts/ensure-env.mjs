import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function ensureEnv(root){
 const example=await readFile(path.join(root,'.env.example'),'utf8');
 if(!/^SESSION_SECRET=/m.test(example))throw Error('The environment template must define SESSION_SECRET');
 const content=example.replace(/^SESSION_SECRET=.*$/m,"SESSION_SECRET='"+randomBytes(32).toString('base64url')+"'");
 try{await writeFile(path.join(root,'.env'),content,{flag:'wx',mode:0o600});return true;}
 catch(e){if(e.code==='EEXIST')return false;throw e;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const created=await ensureEnv(path.resolve(fileURLToPath(new URL('..',import.meta.url))));
 if(created)console.log('Created local .env with a unique session secret.');
}
