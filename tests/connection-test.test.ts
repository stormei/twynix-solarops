import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {testThingsBoardConnection} from '../server/connection-test.ts';
import {ApiError} from '../server/thingsboard.ts';
import {createApp} from '../server/index.ts';
import {settings} from '../server/config.ts';

test('reachability accepts authentication challenges without sending credentials or following redirects',async()=>{
 for(const status of [200,401,403]){
  const result=await testThingsBoardConnection('https://configured.test',async(url,options)=>{
   assert.equal(url,'https://configured.test/api/auth/user');assert.equal(options?.method,'GET');assert.equal(options?.redirect,'error');assert.equal(options?.credentials,'omit');assert.deepEqual(options?.headers,{Accept:'application/json'});assert.equal(options?.body,undefined);
   return new Response('ignored',{status});
  });assert.deepEqual(result,{reachable:true});
 }
});

test('reachability distinguishes transport failure, server errors and a missing API',async()=>{
 for(const [failure,code] of [[new TypeError('private DNS details'),'TB_UNREACHABLE'],[new DOMException('timed out','TimeoutError'),'TB_UNREACHABLE'],[503,'TB_UNAVAILABLE'],[404,'TB_TEST_FAILED'],[302,'TB_TEST_FAILED']] as const){
  await assert.rejects(()=>testThingsBoardConnection('https://configured.test',async()=>{if(typeof failure!=='number')throw failure;return new Response('',{status:failure});}),(e:unknown)=>e instanceof ApiError&&e.code===code&&!e.message.includes('private'));
 }
});

test('anonymous connection test uses only server configuration, preserves sessions and bounds repeated requests',async()=>{
 const previous=process.env.TB_URL;process.env.TB_URL='https://configured.test';const original=globalThis.fetch;let calls=0;
 globalThis.fetch=(async(input:any,options:any)=>{if(!String(input).startsWith('https://configured.test'))return original(input,options);calls++;assert.equal(options.headers['X-Authorization'],undefined);assert.equal(options.body,undefined);return new Response('',{status:401});}) as typeof fetch;
 const dir=await mkdtemp(path.join(tmpdir(),'solarops-probe-')),server=createApp({sessionDirectory:dir}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const post=(body:unknown={},origin=settings().origin)=>original(base+'/api/setup/test-connection',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await post({},'https://other.test')).status,403);assert.equal(calls,0);
  assert.equal((await post({url:'https://other.test'})).status,400);assert.equal(calls,0);
  const response=await post();assert.equal(response.status,200);assert.deepEqual(await response.json(),{reachable:true});assert.equal(response.headers.get('set-cookie'),null);
  assert.equal((await original(base+'/api/plants/main')).status,401);
  for(let i=0;i<4;i++)assert.equal((await post()).status,200);
  assert.equal((await post()).status,429);assert.equal(calls,5);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.TB_URL;else process.env.TB_URL=previous;await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
