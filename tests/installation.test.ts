import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fakeInstallation} from './helpers/commission-fixture.ts';
import {prepareCommission,saveCommission} from '../server/commission.ts';
import {installationSnapshot,installationContext,prepareInstallation,saveInstallation} from '../server/installation.ts';
import type {InstallationNode} from '../src/app/domain/installation.ts';
import {renameDrawingGroup} from '../src/app/domain/group-names.ts';
async function seeded(){const f=fakeInstallation(),directory=await mkdtemp(path.join(tmpdir(),'solarops-manage-'));const p=await prepareCommission(f.tb,f.draft,directory),result=await saveCommission(f.tb,p,p.review.id,directory);f.writes.length=0;return {...f,directory,siteId:result.siteId};}
const zone=(parentId:string):InstallationNode=>({id:'new_'+randomUUID(),entityType:'ASSET',name:'Roof zone',label:'',role:'zone',equipmentKey:'zone-1',parentId,mapping:{},feedsTo:null});
test('management no-op review is read-only and equivalent save makes no ThingsBoard writes',async()=>{const f=await seeded();try{const c=await installationContext(f.tb,f.siteId);assert.equal(c.canEdit,true);assert.equal(c.draft.nodes.length,3);const p=await prepareInstallation(f.tb,c.draft);assert.equal(p.review.canSave,true);assert.equal(p.review.changes.length,0);assert.equal(f.writes.length,0);await saveInstallation(f.tb,p,p.review.id,f.directory);assert.equal(f.writes.length,0);}finally{await rm(f.directory,{recursive:true,force:true});}});
test('management creates a zone, reparents equipment, adds an existing inverter and saves labels without losing device configuration',async()=>{
 const f=await seeded();try{const old=f.entities.get(f.invId) as any;old.deviceProfileId={id:'profile',entityType:'DEVICE_PROFILE'};old.deviceData={configuration:{type:'DEFAULT',customValue:42},transportConfiguration:{type:'DEFAULT'}};old.additionalInfo={custom:'retained'};
  const second=randomUUID();f.entities.set(second,{id:{id:second,entityType:'DEVICE'},name:'Second existing inverter',ownerId:{id:'tenant',entityType:'TENANT'}});
  const d=(await installationSnapshot(f.tb,f.siteId)).draft,z=zone(f.siteId);d.nodes.push(z);const inv=d.nodes.find(n=>n.id===f.invId)!;inv.parentId=z.id;inv.label='Roof inverter';const pv=d.nodes.find(n=>n.role==='pvArray')!;pv.parentId=z.id;pv.name='South-facing array';pv.feedsTo=second;
  d.nodes.push({id:second,entityType:'DEVICE',name:'Second existing inverter',label:'',role:'inverter',equipmentKey:'inv-002',parentId:f.siteId,mapping:{acPower:{key:'ACPower',unit:'kW'}},feedsTo:null});
  const p=await prepareInstallation(f.tb,d);assert.equal(p.review.canSave,true);assert.equal(p.review.counts.assets,1);assert.equal(p.review.counts.devicesAdded,1);assert.equal(f.writes.length,0);
  const r=await saveInstallation(f.tb,p,p.review.id,f.directory);const saved=r.draft.nodes.find(n=>n.id===f.invId)!;assert.equal(saved.label,'Roof inverter');assert.equal(r.draft.nodes.find(n=>n.id===saved.parentId)?.role,'zone');assert.equal(r.draft.nodes.find(n=>n.role==='pvArray')?.feedsTo,second);
  const after=f.entities.get(f.invId) as any;assert.equal(after.name,old.name);assert.deepEqual(after.deviceProfileId,old.deviceProfileId);assert.deepEqual(after.deviceData,old.deviceData);assert.deepEqual(after.additionalInfo,old.additionalInfo);
  assert.ok(f.writes.filter(w=>w.method==='DELETE').every(w=>w.path==='/api/v2/relation'));assert.ok(!f.writes.some(w=>w.path.includes('timeseries')));
  const repeated=await prepareInstallation(f.tb,r.draft);assert.equal(repeated.review.changes.length,0);
 }finally{await rm(f.directory,{recursive:true,force:true});}
});
test('detaching a group keeps its entity records and internal hierarchy while removing site membership and crossing feeds',async()=>{
 const f=await seeded();try{let d=(await installationSnapshot(f.tb,f.siteId)).draft,z=zone(f.siteId);d.nodes.push(z);for(const n of d.nodes)if(n.id===f.invId||n.role==='pvArray')n.parentId=z.id;
  const second=randomUUID();f.entities.set(second,{id:{id:second,entityType:'DEVICE'},name:'Second inverter',ownerId:{id:'tenant',entityType:'TENANT'}});d.nodes.push({id:second,entityType:'DEVICE',name:'Second inverter',label:'',role:'inverter',equipmentKey:'inv-002',parentId:f.siteId,mapping:{acPower:{key:'ACPower',unit:'kW'}},feedsTo:null});d.nodes.find(n=>n.role==='pvArray')!.feedsTo=second;
  let p=await prepareInstallation(f.tb,d),r=await saveInstallation(f.tb,p,p.review.id,f.directory);const group=r.draft.nodes.find(n=>n.role==='zone')!,array=r.draft.nodes.find(n=>n.role==='pvArray')!;const count=f.entities.size;d=r.draft;d.nodes=d.nodes.filter(n=>![group.id,f.invId,array.id].includes(n.id));p=await prepareInstallation(f.tb,d);assert.equal(p.review.canSave,true);await saveInstallation(f.tb,p,p.review.id,f.directory);assert.equal(f.entities.size,count);assert.ok(f.relations.some(l=>l.from.id===group.id&&l.to.id===f.invId));assert.ok(!f.relations.some(l=>l.from.id===f.siteId&&l.to.id===group.id));assert.ok(!f.relations.some(l=>l.from.id===array.id&&l.to.id===second));
 }finally{await rm(f.directory,{recursive:true,force:true});}
});
test('cycles, altered entity types, stale snapshots, last-inverter removal and foreign site devices are rejected before writes',async()=>{
 const f=await seeded();try{const base=(await installationSnapshot(f.tb,f.siteId)).draft;
  let d=structuredClone(base),z=zone(f.siteId);d.nodes.push(z);d.nodes.find(n=>n.id===f.invId)!.parentId=z.id;z.parentId=z.id;await assert.rejects(()=>prepareInstallation(f.tb,d),(e:any)=>e.status===422);
  d=structuredClone(base);d.nodes.find(n=>n.id===f.invId)!.entityType='ASSET';d.nodes.find(n=>n.id===f.invId)!.role='zone';await assert.rejects(()=>prepareInstallation(f.tb,d));
  d=structuredClone(base);d.nodes=d.nodes.filter(n=>n.id!==f.invId);d.nodes.find(n=>n.role==='pvArray')!.feedsTo=null;await assert.rejects(()=>prepareInstallation(f.tb,d));
  const foreign=randomUUID(),other=randomUUID();f.entities.set(other,{id:{id:other,entityType:'ASSET'},name:'Other site'});f.attributes.set(other,{solaropsRole:'site',solaropsSchemaVersion:'1.0.0',siteKey:'other',timezone:'Europe/Oslo',dataSourceKind:'physical'});f.entities.set(foreign,{id:{id:foreign,entityType:'DEVICE'},name:'Foreign inverter'});f.relations.push({from:{id:other,entityType:'ASSET'},to:{id:foreign,entityType:'DEVICE'},type:'Contains'});d=structuredClone(base);d.nodes.push({id:foreign,entityType:'DEVICE',name:'Foreign inverter',label:'',role:'inverter',equipmentKey:'inv-002',parentId:f.siteId,mapping:{acPower:{key:'ACPower',unit:'kW'}},feedsTo:null});assert.equal((await prepareInstallation(f.tb,d)).review.canSave,false);
  f.attributes.get(f.invId).staleAfterMs=99999;await assert.rejects(()=>prepareInstallation(f.tb,base),(e:any)=>e.status===409);assert.equal(f.writes.length,0);
 }finally{await rm(f.directory,{recursive:true,force:true});}
});
test('read-only users can view the hierarchy but cannot prepare writes',async()=>{const f=await seeded();try{f.setAuthority('CUSTOMER_USER');assert.equal((await installationContext(f.tb,f.siteId)).canEdit,false);const d=(await installationSnapshot(f.tb,f.siteId)).draft;await assert.rejects(()=>prepareInstallation(f.tb,d),(e:any)=>e.status===403);assert.equal(f.writes.length,0);}finally{await rm(f.directory,{recursive:true,force:true});}});
test('diagram layout saves as a root attribute, remaps new asset IDs and preserves history and relations',async()=>{
 const f=await seeded();try{const d=(await installationSnapshot(f.tb,f.siteId)).draft,z=zone(f.siteId);d.nodes.push(z);d.layout={version:1,positions:Object.fromEntries(d.nodes.map((n,i)=>[n.id,{x:i*260,y:80}]))};const p=await prepareInstallation(f.tb,d);assert.equal(f.writes.length,0);assert.ok(p.review.changes.some(c=>c.kind==='layout'));const saved=await saveInstallation(f.tb,p,p.review.id,f.directory);const id=saved.draft.nodes.find(n=>n.role==='zone')!.id;assert.ok(!id.startsWith('new_'));assert.deepEqual(saved.draft.layout?.positions[id],d.layout.positions[z.id]);assert.equal((await prepareInstallation(f.tb,saved.draft)).review.changes.length,0);assert.ok(!f.writes.some(w=>w.path.includes('timeseries')));
 const stale=structuredClone(saved.draft);f.attributes.get(f.siteId).solaropsDiagramLayout.positions[id].x=500;await assert.rejects(()=>prepareInstallation(f.tb,stale),(e:any)=>e.status===409);
 }finally{await rm(f.directory,{recursive:true,force:true});}
});
test('diagram layout rejects invalid positions before writes and pruning a detached node retains a valid layout',async()=>{
 const f=await seeded();try{let d=(await installationSnapshot(f.tb,f.siteId)).draft;d.layout={version:1,positions:{[f.invId]:{x:Infinity,y:0}}};await assert.rejects(()=>prepareInstallation(f.tb,d),(e:any)=>e.status===400);assert.equal(f.writes.length,0);
 d.layout={version:1,positions:{[f.invId]:{x:300,y:100}}};let p=await prepareInstallation(f.tb,d);let r=await saveInstallation(f.tb,p,p.review.id,f.directory);d=r.draft;const pv=d.nodes.find(n=>n.role==='pvArray')!;d.nodes=d.nodes.filter(n=>n.id!==pv.id);p=await prepareInstallation(f.tb,d);r=await saveInstallation(f.tb,p,p.review.id,f.directory);assert.equal(r.draft.layout?.positions[f.invId].x,300);
 }finally{await rm(f.directory,{recursive:true,force:true});}
});

test('drawing groups save with layout, remap new asset members, and reload without relation changes',async()=>{
 const f=await seeded();try{const d=(await installationSnapshot(f.tb,f.siteId)).draft,z=zone(f.siteId);d.nodes.push(z);d.layout={version:1,positions:Object.fromEntries(d.nodes.map((n,i)=>[n.id,{x:100+i*260,y:80}])),groups:[{id:'group_test',name:'PV block',members:[z.id,f.invId]}]};let p=await prepareInstallation(f.tb,d);const result=await saveInstallation(f.tb,p,p.review.id,f.directory);const saved=result.draft.layout!;assert.equal(saved.groups!.length,1);assert.ok(saved.groups![0].members.includes(f.invId));assert.ok(saved.groups![0].members.every(id=>!id.startsWith('new_')));f.writes.length=0;result.draft.layout={...saved,groups:[]};p=await prepareInstallation(f.tb,result.draft);assert.deepEqual(p.review.changes.map(c=>c.kind),['layout']);await saveInstallation(f.tb,p,p.review.id,f.directory);assert.equal(f.writes.length,1);assert.ok(f.writes[0].path.includes('/attributes/'));assert.equal((await prepareInstallation(f.tb,(await installationSnapshot(f.tb,f.siteId)).draft)).review.changes.length,0);}finally{await rm(f.directory,{recursive:true,force:true});}
});

test('group rename saves only diagram metadata and survives reload with identities and links intact',async()=>{
 const f=await seeded();try{
  const draft=(await installationSnapshot(f.tb,f.siteId)).draft;
  draft.layout={version:1,positions:Object.fromEntries(draft.nodes.map((n,i)=>[n.id,{x:i*260,y:80}])),groups:[{id:'group_101',name:'Group 1',members:draft.nodes.filter(n=>n.id!==f.siteId).map(n=>n.id)}]};
  let plan=await prepareInstallation(f.tb,draft);const initial=await saveInstallation(f.tb,plan,plan.review.id,f.directory),relations=structuredClone(f.relations),entities=structuredClone([...f.entities]);f.writes.length=0;
  initial.draft.layout=renameDrawingGroup(initial.draft.layout!,'group_101','South roof / INV-101');plan=await prepareInstallation(f.tb,initial.draft);
  assert.deepEqual(plan.review.changes.map(c=>c.kind),['layout']);assert.equal(f.writes.length,0);await saveInstallation(f.tb,plan,plan.review.id,f.directory);
  assert.equal(f.writes.length,1);assert.ok(f.writes[0].path.includes('/attributes/'));assert.deepEqual(f.relations,relations);assert.deepEqual([...f.entities],entities);
  const reloaded=(await installationSnapshot(f.tb,f.siteId)).draft;assert.equal(reloaded.layout!.groups![0].name,'South roof / INV-101');assert.deepEqual(reloaded.layout!.groups![0].members,initial.draft.layout.groups![0].members);assert.equal((await prepareInstallation(f.tb,reloaded)).review.changes.length,0);
 }finally{await rm(f.directory,{recursive:true,force:true});}
});

test('HMI-only save preserves devices and history and reloads drawing bindings and connections',async()=>{
 const f=await seeded();try{
  const d=(await installationSnapshot(f.tb,f.siteId)).draft;
  d.layout={version:1,positions:{},hmi:{elements:[{id:'hmi_bus',kind:'acBus',label:'AC bus',x:600,y:100,width:240,height:94},{id:'hmi_power',kind:'value',label:'AC power',x:300,y:100,width:212,height:94,bindingId:f.invId,field:'acPower'}],connections:[{id:'hmi_wire',from:f.invId,to:'hmi_bus',circuit:'ac',bend:560}]}};
  const entities=f.entities.size,plan=await prepareInstallation(f.tb,d);assert.equal(plan.review.canSave,true);assert.deepEqual(plan.review.changes.map(c=>c.kind),['layout']);
  const saved=await saveInstallation(f.tb,plan,plan.review.id,f.directory);assert.deepEqual(saved.draft.layout?.hmi,d.layout.hmi);assert.equal(f.entities.size,entities);assert.ok(f.writes.every(w=>w.path.includes('/attributes/SERVER_SCOPE')));
 }finally{await rm(f.directory,{recursive:true,force:true});}
});

test('verified inverter mode mappings save as device attributes and reject invalid values',async()=>{
 const f=await seeded();try{const d=(await installationSnapshot(f.tb,f.siteId)).draft;d.nodes.find(n=>n.id===f.invId)!.stateMapping={'4':'mppt','8':'sleep'};let plan=await prepareInstallation(f.tb,d);assert.equal(plan.review.canSave,true);const saved=await saveInstallation(f.tb,plan,plan.review.id,f.directory);assert.deepEqual(saved.draft.nodes.find(n=>n.id===f.invId)!.stateMapping,{'4':'mppt','8':'sleep'});assert.ok(f.entities.has(f.invId));const invalid=structuredClone(saved.draft);invalid.nodes.find(n=>n.id===f.invId)!.stateMapping={'4':'invented'} as any;await assert.rejects(()=>prepareInstallation(f.tb,invalid),/Invalid inverter state mapping/);}finally{await rm(f.directory,{recursive:true,force:true});}
});
