import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.ts';
import {settings} from '../server/config.ts';
const siteId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',invId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

test('wizard authenticates a candidate, validates and activates the configured instance without modifying upstream equipment',async()=>{
 const originalFetch=globalThis.fetch;const writes:string[]=[];
 const token='test.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
 globalThis.fetch=(async(input:any,options:any)=>{
  const u=new URL(String(input));if(u.origin!=='https://another-thingsboard.example')return originalFetch(input,options);
  if(options?.method&&options.method!=='GET')writes.push(u.pathname);
  const site={id:{id:siteId,entityType:'ASSET'},name:'Remote rooftop'},device={id:{id:invId,entityType:'DEVICE'},name:'Arbitrary vendor device'};
  if(u.pathname==='/api/auth/login'){assert.equal(JSON.parse(options.body).password,'test-password-only');return Response.json({token});}
  if(u.pathname==='/v3/api-docs'){assert.equal(options.headers['X-Authorization'],'Bearer '+token);return Response.json({info:{version:'4.4.0'},paths:{'/api/user/assets':{},'/api/plugins/telemetry/{entityType}/{entityId}/values/timeseries/history':{}}});}
  if(u.pathname==='/api/auth/user')return Response.json({authority:'CUSTOMER_USER',firstName:'  Ada ',lastName:' Solar  ',email:'ada@example.test',password:'never-exposed',tenantId:'private-tenant'});
  if(u.pathname==='/api/user/assets')return Response.json({data:[site],hasNext:false});
  if(u.pathname===`/api/asset/${siteId}`)return Response.json(site);
  if(u.pathname===`/api/device/${invId}`)return Response.json(device);
  if(u.pathname.includes('/values/attributes')){const root=u.pathname.includes(siteId);const m=root?{solaropsSchemaVersion:'1.0.0',solaropsRole:'site',siteKey:'remote-site',timezone:'America/Denver',dataSourceKind:'physical'}:{solaropsSchemaVersion:'1.0.0',solaropsRole:'inverter',equipmentKey:'remote-inverter',solaropsTelemetryMapping:{acPower:{key:'RealWatts',unit:'W'}}};return Response.json(Object.entries(m).map(([key,value])=>({key,value})));}
  if(u.pathname.includes('/relations/info/from/ASSET/'))return Response.json([{from:site.id,to:device.id,type:'Contains'}]);
  if(u.pathname.includes('/relations/info/from/DEVICE/'))return Response.json([]);
  if(u.pathname.endsWith('/keys/timeseries'))return Response.json(['RealWatts']);
  if(u.pathname.endsWith('/values/timeseries'))return Response.json({RealWatts:[{ts:Date.now(),value:3500}]});
  throw Error('Unexpected upstream path '+u.pathname);
 }) as typeof fetch;
 const environmentKeys=['TB_URL','TB_PLANT_ASSET_ID','TB_DEVICE_PREFIX','TB_SCHEMA_VERIFIED'];const originalEnvironment=Object.fromEntries(environmentKeys.map(k=>[k,process.env[k]]));for(const key of environmentKeys)process.env[key]=key==='TB_SCHEMA_VERIFIED'?'false':'';
 process.env.TB_URL='https://another-thingsboard.example';
 const directory=await mkdtemp(path.join(tmpdir(),'solarops-setup-test-'));const server=createApp({sessionDirectory:directory}).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const port=(server.address() as any).port;
 let cookie='';const call=async(path:string,method='GET',data?:unknown)=>{const r=await originalFetch(`http://127.0.0.1:${port}${path}`,{method,headers:{origin:settings().origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return r;};
 try{
  assert.equal((await call('/api/setup/sites')).status,401);assert.equal((await call('/api/session/user')).status,401);
  assert.equal((await call('/api/setup/connect','POST',{url:'https://untrusted.example',username:'operator@example.test',password:'test-password-only'})).status,400);
  assert.deepEqual(writes,[]);
  const connected=await call('/api/setup/connect','POST',{username:'operator@example.test',password:'test-password-only'});assert.equal(connected.status,200);assert.ok(cookie);
  const candidateStatus=await (await call('/api/setup/status')).json();assert.equal(candidateStatus.authenticated,true);assert.equal(candidateStatus.url,'https://another-thingsboard.example');assert.equal(candidateStatus.selectedSiteId,'');assert.equal((await call('/api/plants/main')).status,401);assert.equal((await call('/api/session/user')).status,401);
  const before=await (await call('/config.json')).json();assert.equal(before.thingsboardUrl,'https://another-thingsboard.example');
  assert.equal((await call('/api/setup/candidate','DELETE')).status,204);assert.equal((await (await call('/api/setup/status')).json()).authenticated,false);assert.equal((await call('/api/setup/sites')).status,401);await call('/api/setup/connect','POST',{username:'operator@example.test',password:'test-password-only'});
  const sites=await (await call('/api/setup/sites')).json();assert.equal(sites.sites.length,1);
  const report=await (await call('/api/setup/inspect','POST',{assetId:siteId})).json();assert.equal(report.compatible,true);assert.equal(report.capabilities.energy,false);
  const oldCookie=cookie;const activated=await call('/api/setup/activate','POST',{assetId:siteId});assert.equal(activated.status,200);assert.notEqual(cookie,oldCookie);const profile=await call('/api/session/user');assert.equal(profile.status,200);assert.deepEqual(await profile.json(),{name:'Ada Solar',email:'ada@example.test'});
  const config=await (await call('/config.json')).json();assert.equal(config.thingsboardUrl,'https://another-thingsboard.example');assert.equal(config.timezone,'America/Denver');assert.equal(config.discoveryMode,'standard');assert.equal(config.simulatedSource,false);
  assert.deepEqual(writes,['/api/auth/login','/api/auth/login']);
  const loggedInCookie=cookie;assert.equal((await call('/api/session','DELETE')).status,204);assert.notEqual(cookie,loggedInCookie);assert.equal((await call('/api/plants/main')).status,401);assert.equal((await call('/api/session/user')).status,401);
  const remembered=await (await call('/config.json')).json();assert.equal(remembered.thingsboardUrl,'https://another-thingsboard.example');assert.equal(remembered.configured,true);
  assert.equal((await call('/api/session','POST',{username:'operator@example.test',password:'test-password-only'})).status,200);
  assert.equal((await (await call('/config.json')).json()).thingsboardUrl,'https://another-thingsboard.example');
  const connectedCookie=cookie;assert.equal((await call('/api/setup/reset','POST',{})).status,200);assert.notEqual(cookie,connectedCookie);
  const resetConfig=await (await call('/config.json')).json();assert.equal(resetConfig.configured,false);assert.equal(resetConfig.thingsboardUrl,'https://another-thingsboard.example');assert.equal(resetConfig.plantName,'SolarOps');
  const status=await (await call('/api/setup/status')).json();assert.equal(status.authenticated,false);assert.equal(status.url,'https://another-thingsboard.example');assert.equal(status.selectedSiteId,'');assert.equal((await call('/api/setup/sites')).status,401);assert.equal((await call('/api/plants/main')).status,401);
  assert.deepEqual(writes,['/api/auth/login','/api/auth/login','/api/auth/login']);
  assert.equal((await originalFetch(`http://127.0.0.1:${port}/api/setup/reset`,{method:'POST',headers:{origin:'https://untrusted.test','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await call('/api/session','DELETE')).status,204);
 }finally{for(const key of environmentKeys){if(originalEnvironment[key]===undefined)delete process.env[key];else process.env[key]=originalEnvironment[key];}globalThis.fetch=originalFetch;await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});


test('first-time login requires a server endpoint and cannot accept one from the browser',async()=>{
 const previous=process.env.TB_URL;process.env.TB_URL='';
 const directory=await mkdtemp(path.join(tmpdir(),'solarops-missing-endpoint-'));
 const server=createApp({sessionDirectory:directory}).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/setup/connect',{method:'POST',headers:{origin:settings().origin,'Content-Type':'application/json'},body:JSON.stringify({url:'https://browser-supplied.example',username:'operator',password:'test-only'})});
  assert.equal(response.status,400);const result=await response.json();assert.equal(result.code,'TB_URL_MISSING');assert.match(result.error,/Set TB_URL in \.env/);
  const probe=await fetch('http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/setup/test-connection',{method:'POST',headers:{origin:settings().origin,'Content-Type':'application/json'},body:'{}'});assert.equal(probe.status,400);assert.equal((await probe.json()).code,'TB_URL_MISSING');
  const config=await (await fetch('http://127.0.0.1:'+(server.address() as {port:number}).port+'/config.json')).json();assert.equal(config.endpointConfigured,false);
 }finally{if(previous===undefined)delete process.env.TB_URL;else process.env.TB_URL=previous;await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});
