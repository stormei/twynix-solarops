import {fakeInstallation} from './helpers/commission-fixture.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ThingsBoard,Entity} from '../server/thingsboard.ts';
import {settings} from '../server/config.ts';
import {prepareCommission,saveCommission,canonical} from '../server/commission.ts';
import type {CommissionDraft} from '../src/app/domain/commission.ts';
test('review is read-only; save creates assets and links while preserving the existing device and produces a no-op repeat plan',async()=>{
 const f=fakeInstallation(),directory=await mkdtemp(path.join(tmpdir(),'solarops-commission-'));
 try{const p=await prepareCommission(f.tb,f.draft,directory);assert.equal(p.review.canSave,true);assert.equal(f.writes.length,0);assert.deepEqual(p.review.counts,{assets:2,profiles:2,devices:1,attributes:3,relations:3});const original=structuredClone(f.entities.get(f.invId));
  const result=await saveCommission(f.tb,p,p.review.id,directory);assert.equal(result.report.compatible,true);assert.deepEqual(f.entities.get(f.invId),original);assert.equal(f.relations.filter(r=>r.type==='Contains').length,2);assert.equal(f.relations.filter(r=>r.type==='Feeds').length,1);
  assert.ok(f.writes.every(w=>w.path==='/api/asset'||w.path==='/api/assetProfile'||w.path==='/api/v2/relation'||w.path.endsWith('/attributes/SERVER_SCOPE')));assert.ok(!f.writes.some(w=>w.path.includes('timeseries')||w.path==='/api/device'));
  const again=await prepareCommission(f.tb,f.draft,directory);assert.equal(again.review.canSave,true);assert.equal(again.review.changes.length,0);const count=f.writes.length;await saveCommission(f.tb,again,again.review.id,directory);assert.equal(f.writes.length,count);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('devices assigned to a different site cannot be silently reused',async()=>{
 const f=fakeInstallation(),siteId=randomUUID();f.entities.set(siteId,{id:{id:siteId,entityType:'ASSET'},name:'Other site'});f.attributes.set(siteId,{solaropsRole:'site',solaropsSchemaVersion:'1.0.0',siteKey:'other',timezone:'Europe/Oslo',dataSourceKind:'physical'});f.relations.push({from:{id:siteId,entityType:'ASSET'},to:{id:f.invId,entityType:'DEVICE'},type:'Contains'});
 const p=await prepareCommission(f.tb,f.draft);assert.equal(p.review.canSave,false);assert.ok(p.review.issues.some(i=>i.message.includes('another SolarOps installation')));assert.equal(f.writes.length,0);
});
test('duplicate device bindings, missing required measurements and bad units cannot be saved',async()=>{
 const f=fakeInstallation();const d=structuredClone(f.draft);d.equipment.push({...d.equipment[0],equipmentKey:'inv-002'});await assert.rejects(()=>prepareCommission(f.tb,d));
 d.equipment.pop();d.equipment[0].mapping.acPower.unit='V';assert.equal((await prepareCommission(f.tb,d)).review.canSave,false);
 d.equipment[0].mapping={};assert.equal((await prepareCommission(f.tb,d)).review.canSave,false);assert.equal(f.writes.length,0);
});
test('commissioning requires an administrator and preserves changed metadata in the review digest',async()=>{
 const f=fakeInstallation();f.setAuthority('CUSTOMER_USER');await assert.rejects(()=>prepareCommission(f.tb,f.draft),(e:any)=>e.status===403);f.setAuthority('TENANT_ADMIN');const before=await prepareCommission(f.tb,f.draft);f.attributes.set(f.invId,{staleAfterMs:150000});const after=await prepareCommission(f.tb,f.draft);assert.notEqual(before.review.digest,after.review.digest);assert.equal(f.writes.length,0);
});
test('a failed save records partial progress and can be completed after a new review without duplicate assets',async()=>{
 const f=fakeInstallation(),directory=await mkdtemp(path.join(tmpdir(),'solarops-partial-'));
 try{const p=await prepareCommission(f.tb,f.draft,directory);f.fail('/api/v2/relation');await assert.rejects(()=>saveCommission(f.tb,p,p.review.id,directory),(e:any)=>e.status===502);const record=JSON.parse(await readFile(path.join(directory,(await readdir(directory))[0]),'utf8'));assert.equal(record.status,'partial');assert.ok(!JSON.stringify(record).includes('fake-user-token'));
  const next=await prepareCommission(f.tb,f.draft,directory);assert.equal(next.review.canSave,true);await saveCommission(f.tb,next,next.review.id,directory);assert.equal([...f.entities.values()].filter(e=>e.id.entityType==='ASSET').length,2);assert.equal(f.entities.get(f.invId)?.name,'Existing inverter');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('reusing an inverter retains its verified integration profile',async()=>{const f=fakeInstallation();f.attributes.set(f.invId,{solaropsIntegrationProfile:'verified-vendor-v1'});const directory=await mkdtemp(path.join(tmpdir(),'solarops-profile-'));try{const p=await prepareCommission(f.tb,f.draft,directory);const attrs=p.review.changes.find(c=>c.kind==='attributes'&&c.target===f.invId);assert.equal(attrs?.after?.['solaropsIntegrationProfile'],undefined);assert.equal(p.rows.find(r=>r.entity.id.id===f.invId)?.attrs.solaropsIntegrationProfile,'verified-vendor-v1');}finally{await rm(directory,{recursive:true,force:true});}});
