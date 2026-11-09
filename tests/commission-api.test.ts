import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fakeInstallation} from './helpers/commission-fixture.ts';
import {createApp} from '../server/index.ts';
import {settings} from '../server/config.ts';

test('commissioning API requires authentication, rejects changed review plans, saves once and returns a duplicate receipt',async()=>{
 const f=fakeInstallation(),original=globalThis.fetch,directory=await mkdtemp(path.join(tmpdir(),'solarops-create-api-'));
 globalThis.fetch=((input:any,options:any)=>String(input).startsWith('https://commission.test')?f.transport(input,options):original(input,options)) as typeof fetch;
 const previousUrl=process.env.TB_URL;process.env.TB_URL='https://commission.test';
 const server=createApp({sessionDirectory:path.join(directory,'sessions'),commissionDirectory:path.join(directory,'audit')}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as any).port;let cookie='';
 const call=async(p:string,method='GET',body?:unknown)=>{const r=await original(`http://127.0.0.1:${port}/api/setup/${p}`,{method,headers:{Origin:settings().origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0];const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null};};
 try{
  assert.equal((await call('create/options')).status,401);assert.equal((await call('create/save','POST',{planId:'forged'})).status,401);
  assert.equal((await call('connect','POST',{username:'test@example.invalid',password:'fake-password-only'})).status,200);
  f.attributes.set(f.invId,{solaropsSchemaVersion:'1.0.0',solaropsRole:'inverter',equipmentKey:'inv-001',dataSourceKind:'physical',solaropsTelemetryMapping:f.draft.equipment[0].mapping});
  const options=await call('create/options');assert.equal(options.body.canCreate,true);assert.equal(options.body.templates.length,2);assert.equal(options.body.devices[0].identification,'inverter');assert.deepEqual(options.body.devices[0].savedMappings.acPower,{key:'ACPower',unit:'kW'});
  const before=f.writes.length;const plan=await call('create/preview','POST',f.draft);assert.equal(plan.status,200);assert.equal(plan.body.canSave,true);assert.equal(f.writes.length,before);
  f.attributes.set(f.invId,{staleAfterMs:150000});assert.equal((await call('create/save','POST',{planId:plan.body.id})).status,409);assert.equal(f.writes.length,before);
  const fresh=await call('create/preview','POST',f.draft);const saved=await call('create/save','POST',{planId:fresh.body.id,activate:true});assert.equal(saved.status,200);assert.equal(saved.body.report.compatible,true);assert.equal(saved.body.activated,true);assert.equal(saved.body.connection.plantName,f.draft.site.name);assert.equal((await call('status')).body.selectedSiteId,saved.body.siteId);
  const count=f.writes.length;const duplicate=await call('create/save','POST',{planId:fresh.body.id});assert.equal(duplicate.status,200);assert.equal(duplicate.body.siteId,saved.body.siteId);assert.equal(f.writes.length,count);
  await call('candidate','DELETE');assert.equal((await call('create/save','POST',{planId:fresh.body.id})).status,409);
 }finally{if(previousUrl===undefined)delete process.env.TB_URL;else process.env.TB_URL=previousUrl;globalThis.fetch=original;await new Promise<void>(r=>server.close(()=>r()));await rm(directory,{recursive:true,force:true});}
});
