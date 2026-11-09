import {settings} from '../server/config.ts';
import {readdir,readFile} from 'node:fs/promises';
import {createHash,createDecipheriv} from 'node:crypto';
import {fileURLToPath} from 'node:url';
// CLI-only reuse of the user's existing encrypted SolarOps session. Never print credentials.
export async function localSession(targetUrl=settings().url){
 const directory=fileURLToPath(new URL('../.runtime/sessions/',import.meta.url));
 const secret=process.env['SESSION_SECRET'];if(!secret)throw Error('No local session secret configured');
 const sessions:any[]=[];
 for(const name of await readdir(directory).catch(()=>[])){
  if(!name.endsWith('.session'))continue;
  try{const p=JSON.parse(await readFile(directory+name,'utf8'));const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),Buffer.from(p.iv,'base64'));d.setAuthTag(Buffer.from(p.tag,'base64'));const s=JSON.parse(Buffer.concat([d.update(Buffer.from(p.data,'base64')),d.final()]).toString());for(const candidate of [s,...(s.setup?[{token:s.setup.token,expires:s.setup.expires,connection:s.setup.config}]:[])])if(candidate.token&&candidate.expires>Date.now()&&(candidate.connection?.url??settings().url)===targetUrl)sessions.push(candidate);}catch{}
 }
 const session=sessions.sort((a,b)=>b.expires-a.expires)[0];if(!session)throw Error('Sign in or connect through SolarOps setup for the requested ThingsBoard URL first; no active session available');return session;
}
