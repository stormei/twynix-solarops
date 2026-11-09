import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fakeInstallation} from './helpers/commission-fixture.ts';
import {prepareCommission,saveCommission} from '../server/commission.ts';
import {createApp} from '../server/index.ts';
import {settings} from '../server/config.ts';

test('management API uses the active installation, enforces reviewed saves, updates labels and rejects stale edits',async()=>{
 const f=fakeInstallation(),directory=await mkdtemp(path.join(tmpdir(),'solarops-manage-api-')),original=globalThis.fetch;
 const p=await prepareCommission(f.tb,f.draft,directory),site=await saveCommission(f.tb,p,p.review.id,directory);f.writes.length=0;
 globalThis.fetch=((input:any,options:any)=>String(input).startsWith('https://commission.test')?f.transport(input,options):original(input,options)) as typeof fetch;
 const previousUrl=process.env.TB_URL;process.env.TB_URL='https://commission.test';
 const server=createApp({sessionDirectory:path.join(directory,'sessions'),managementDirectory:path.join(directory,'management')}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as any).port;let cookie='';
 const call=async(p:string,method='GET',body?:unknown)=>{const response=await original(`http://127.0.0.1:${port}${p}`,{method,headers:{Origin:settings().origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0];const text=await response.text();return {status:response.status,body:text?JSON.parse(text):null};};
 try{
  assert.equal((await call('/api/installation')).status,401);assert.equal((await call('/api/installation/devices/'+f.invId)).status,401);await call('/api/setup/connect','POST',{username:'test@example.invalid',password:'fake-password-only'});assert.equal((await call('/api/installation')).status,401);
  assert.equal((await call('/api/setup/activate','POST',{assetId:site.siteId})).status,200);
  const context=await call('/api/installation');assert.equal(context.status,200);assert.equal(context.body.draft.assetId,site.siteId);
  const details=await call('/api/installation/devices/'+f.invId+'?keys=ACPower');assert.equal(details.status,200);assert.equal(details.body.latest.ACPower[0].value,12);assert.ok(details.body.latest.ACPower[0].ts>0);
  const draft=context.body.draft;draft.nodes.find((n:any)=>n.id===site.siteId).label='Managed roof';let reviewed=await call('/api/installation/preview','POST',draft);assert.equal(reviewed.status,200);assert.equal(reviewed.body.canSave,true);
  assert.equal((await call('/api/installation/save','POST',{planId:'forged'})).status,409);
  const saved=await call('/api/installation/save','POST',{planId:reviewed.body.id});assert.equal(saved.status,200);assert.equal(saved.body.siteName,'Managed roof');const count=f.writes.length;assert.equal((await call('/api/installation/save','POST',{planId:reviewed.body.id})).status,200);assert.equal(f.writes.length,count);
  assert.equal((await call('/config.json')).body.plantName,'Managed roof');
  const fresh=(await call('/api/installation')).body.draft;fresh.nodes.find((n:any)=>n.id===f.invId).label='Changed inverter';reviewed=await call('/api/installation/preview','POST',fresh);f.attributes.get(f.invId).staleAfterMs=44444;assert.equal((await call('/api/installation/save','POST',{planId:reviewed.body.id})).status,409);assert.equal(f.writes.length,count);
  f.setAuthority('CUSTOMER_USER');assert.equal((await call('/api/installation')).body.canEdit,false);assert.equal((await call('/api/installation/preview','POST',fresh)).status,403);
  assert.equal((await call('/api/installation/archive/preview','POST',{assetId:site.siteId})).status,403);f.setAuthority('TENANT_ADMIN');
  let archive=await call('/api/installation/archive/preview','POST',{assetId:site.siteId});assert.equal(archive.status,200);assert.equal((await call('/api/installation/archive/save','POST',{planId:'forged',confirmation:'New roof'})).status,409);assert.equal((await call('/api/installation/archive/save','POST',{planId:archive.body.id,confirmation:'wrong name'})).status,400);
  f.attributes.get(f.invId).staleAfterMs=55555;assert.equal((await call('/api/installation/archive/save','POST',{planId:archive.body.id,confirmation:'New roof'})).status,409);archive=await call('/api/installation/archive/preview','POST',{assetId:site.siteId});const archived=await call('/api/installation/archive/save','POST',{planId:archive.body.id,confirmation:'New roof'});assert.equal(archived.status,200);assert.equal(archived.body.backup.status,'succeeded');assert.ok(f.entities.has(f.invId));const archivedWrites=f.writes.length;assert.equal((await call('/api/installation/archive/save','POST',{planId:archive.body.id,confirmation:'New roof'})).status,200);assert.equal(f.writes.length,archivedWrites);assert.equal((await call('/api/setup/sites')).body.sites.length,0);
  await call('/api/session','DELETE');
 }finally{if(previousUrl===undefined)delete process.env.TB_URL;else process.env.TB_URL=previousUrl;globalThis.fetch=original;await new Promise<void>(r=>server.close(()=>r()));await rm(directory,{recursive:true,force:true});}
});
