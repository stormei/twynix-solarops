import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.ts';
import {settings} from '../server/config.ts';
import {loginErrorMessage,missingEndpointMessage} from '../src/app/domain/login-error.ts';
import {translateMessage} from '../src/app/core/translate.ts';

test('both login routes distinguish network failures, timeouts, upstream errors and rejected credentials',async()=>{
 const keys=['TB_URL','TB_PLANT_ASSET_ID','TB_SCHEMA_VERIFIED'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{TB_URL:'https://login-diagnostics.test',TB_PLANT_ASSET_ID:'site',TB_SCHEMA_VERIFIED:'true'});
 const original=globalThis.fetch;let failure:'network'|'timeout'|number='network';
 globalThis.fetch=(async(input:any,options:any)=>{
  if(!String(input).startsWith('https://login-diagnostics.test'))return original(input,options);
  if(failure==='network')throw new TypeError('private-network-details');
  if(failure==='timeout')throw new DOMException('private-timeout-details','TimeoutError');
  return new Response('',{status:failure});
 }) as typeof fetch;
 const directory=await mkdtemp(path.join(tmpdir(),'solarops-login-errors-'));
 const server=createApp({sessionDirectory:directory}).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{
  assert.equal((await (await original(base+'/config.json')).json()).endpointConfigured,true);
  for(const route of ['/api/session','/api/setup/connect'])for(const mode of ['network','timeout',503,401] as const){
   failure=mode;const response=await original(base+route,{method:'POST',headers:{origin:settings().origin,'Content-Type':'application/json'},body:JSON.stringify({username:'test',password:'test-only'})});
   const result=await response.json();assert.equal(response.status,typeof mode==='number'&&mode===401?401:502);
   assert.equal(result.code,mode===401?undefined:mode===503?'TB_UNAVAILABLE':'TB_UNREACHABLE');
   assert.ok(!JSON.stringify(result).includes('private-'));assert.ok(!response.headers.get('set-cookie'));
  }
 }finally{globalThis.fetch=original;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});

test('login diagnostics give distinct localized actions without exposing backend error text',()=>{
 const missing=loginErrorMessage(400,'TB_URL_MISSING');assert.equal(missing,missingEndpointMessage);
 assert.match(translateMessage(missing,'en'),/Set TB_URL in .env and restart/);
 const network=loginErrorMessage(502,'TB_UNREACHABLE');assert.match(translateMessage(network,'en'),/network\/VPN/);assert.match(translateMessage(network,'nb'),/nettverk\/VPN/);
 assert.notEqual(network,loginErrorMessage(401));assert.match(translateMessage(loginErrorMessage(401),'en'),/not accepted/);
 assert.match(translateMessage(loginErrorMessage(502,'TB_UNAVAILABLE'),'en'),/server error/);
 assert.match(translateMessage(loginErrorMessage(0),'en'),/SolarOps server/);
});
