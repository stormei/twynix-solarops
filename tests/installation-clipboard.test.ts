import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyEquipment,pasteEquipment,type DeviceBinding} from '../src/app/domain/installation-clipboard.ts';
import type {InstallationDraft,InstallationNode} from '../src/app/domain/installation.ts';
const node=(id:string,role:string,type:'ASSET'|'DEVICE'='ASSET',parentId:string|null='site'):InstallationNode=>({id,role,entityType:type,parentId,name:id,label:'',equipmentKey:id,mapping:{},feedsTo:null});
const original=():InstallationDraft=>({assetId:'site',baseline:'baseline',timezone:'Europe/Oslo',nodes:[node('site','site','ASSET',null),node('zone','zone'),{...node('pv','pvArray','ASSET','zone'),feedsTo:'inv'}, {...node('inv','inverter','DEVICE'),mapping:{acPower:{key:'ACPower',unit:'kW'}},inverterConfig:{version:1,manufacturer:'Maker',model:'Model',energyCounterKind:'lifetime',mppts:[{id:'m1',name:'MPPT 1',mapping:{},inputs:[{id:'i1',name:'DC 1'},{id:'i2',name:'DC 2'}]}]}}],layout:{version:1,positions:{site:{x:20,y:20},zone:{x:100,y:100},pv:{x:400,y:100},inv:{x:700,y:100}}}});
const binding:DeviceBinding={id:'other-inv',name:'Other inverter',keys:['ACPower'],siteIds:[]};
test('copy snapshots only selected non-root items and paste remaps copied parents and internal DC links',()=>{
 const d=original(),c=copyEquipment(d,['site','zone','pv','inv'])!;let id=0;const result=pasteEquipment(d,c,{inv:binding},{},40,()=>`new-${++id}`);
 assert.equal(c.nodes.length,3);assert.equal(d.nodes.length,4);assert.equal(result.draft.nodes.length,7);assert.equal(result.draft.nodes[5].parentId,'new-1');assert.equal(result.draft.nodes[5].feedsTo,'other-inv');assert.equal(result.draft.nodes[6].id,'other-inv');assert.equal(result.draft.nodes[6].name,'Other inverter');assert.equal(result.draft.layout!.positions['new-1'].x,140);
 d.nodes[1].name='changed later';assert.equal(c.nodes[0].name,'zone');assert.equal(copyEquipment(d,['site']),null);
});
test('repeated asset pastes allocate unique names, keys and IDs while preserving external links',()=>{
 const d=original(),c=copyEquipment(d,['pv'])!;let id=0;const first=pasteEquipment(d,c,{}, {},40,()=>`copy-${++id}`),second=pasteEquipment(first.draft,c,{}, {},80,()=>`copy-${++id}`);
 const copies=second.draft.nodes.slice(4);assert.equal(new Set(copies.map(n=>n.name)).size,2);assert.equal(new Set(copies.map(n=>n.equipmentKey)).size,2);assert.ok(copies.every(n=>n.feedsTo==='inv'&&n.parentId==='zone'&&n.isNew));
});
test('device copies require a distinct unassigned device and compatible telemetry',()=>{
 const d=original(),c=copyEquipment(d,['inv'])!;assert.throws(()=>pasteEquipment(d,c),/ThingsBoard/);assert.throws(()=>pasteEquipment(d,c,{inv:{...binding,id:'inv'}}),/ThingsBoard/);assert.throws(()=>pasteEquipment(d,c,{inv:{...binding,siteIds:['another-site']}}),/ThingsBoard/);assert.throws(()=>pasteEquipment(d,c,{inv:{...binding,keys:[]}}),/målenøkler/);
});
test('string copies use an available input and clear source-specific telemetry mappings',()=>{
 const d=original();d.nodes.push({...node('string','pvString'),feedsTo:'inv',mapping:{dcPower:{key:'String1Power',unit:'W'}},stringConfig:{version:1,mpptId:'m1',inputId:'i1',moduleManufacturer:'M',moduleModel:'P',moduleCount:10,modulePowerW:400,azimuth:null,tilt:null}});
 const c=copyEquipment(d,['string'])!;assert.throws(()=>pasteEquipment(d,c,{}, {string:{inverterId:'inv',mpptId:'m1',inputId:'i1'}}),/strengtilkoblingene/);
 const r=pasteEquipment(d,c,{}, {string:{inverterId:'inv',mpptId:'m1',inputId:'i2'}});const n=r.draft.nodes.at(-1)!;assert.equal(n.stringConfig!.inputId,'i2');assert.deepEqual(n.mapping,{});assert.equal(n.stringConfig!.moduleCount,10);
});
test('pasting into a different installation or beyond the node limit fails without changing the draft',()=>{
 const d=original(),c=copyEquipment(d,['zone'])!;assert.throws(()=>pasteEquipment({...d,assetId:'other'},c),/installasjonen/);assert.throws(()=>pasteEquipment({...d,nodes:Array.from({length:128},(_,i)=>node('n'+i,'zone'))},c),/128/);assert.equal(d.nodes.length,4);
});

test('copying a complete drawing group remaps its members without changing the original group',()=>{
 const d=original();d.layout!.groups=[{id:'source-group',name:'PV block',members:['zone','pv']}];const c=copyEquipment(d,['zone','pv'])!,r=pasteEquipment(d,c);assert.equal(r.draft.layout!.groups!.length,2);assert.deepEqual(r.draft.layout!.groups![0].members,['zone','pv']);assert.deepEqual(new Set(r.draft.layout!.groups![1].members),new Set(r.ids));assert.notEqual(r.draft.layout!.groups![1].id,'source-group');
});
