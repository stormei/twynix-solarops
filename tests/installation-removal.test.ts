import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planEquipmentRemoval} from '../src/app/domain/installation-removal.ts';
import type {InstallationDraft,InstallationNode} from '../src/app/domain/installation.ts';
const n=(id:string,role:string,parentId:string|null='site',feedsTo:string|null=null):InstallationNode=>({id,role,parentId,feedsTo,entityType:role==='inverter'?'DEVICE':'ASSET',name:id,label:'',equipmentKey:id,mapping:{}});
const draft=():InstallationDraft=>({assetId:'site',baseline:'b',timezone:'UTC',nodes:[n('site','site',null),n('zone','zone'),n('inv-a','inverter','zone'),n('inv-b','inverter'),n('array','pvArray','site','inv-a'),n('string','pvString','array','inv-a')],layout:{version:1,positions:{site:{x:0,y:0},zone:{x:100,y:0},'inv-a':{x:300,y:0},'inv-b':{x:300,y:200},array:{x:100,y:200},string:{x:100,y:400}}}});
test('removal includes descendants and inverter-dependent strings while detaching retained PV arrays',()=>{
 const d=draft(),before=structuredClone(d),p=planEquipmentRemoval(d,['zone']);assert.deepEqual(p.removed.map(n=>n.id),['zone','inv-a','string']);assert.deepEqual(p.disconnected.map(n=>n.id),['array']);assert.equal(p.draft.nodes.find(n=>n.id==='array')!.feedsTo,null);assert.deepEqual(p.draft.nodes.map(n=>n.id),['site','inv-b','array']);assert.equal(p.error,'');assert.deepEqual(d,before);assert.equal(p.draft.layout!.positions['inv-a'],undefined);assert.deepEqual(p.draft.layout!.positions['inv-b'],d.layout!.positions['inv-b']);
});
test('multi-selection is deduplicated and the installation root is never removed',()=>{
 const p=planEquipmentRemoval(draft(),['site','zone','inv-a']);assert.equal(p.rootSelected,true);assert.equal(p.draft.nodes[0].id,'site');assert.equal(new Set(p.removed.map(n=>n.id)).size,p.removed.length);
});
test('the last inverter and empty selections cannot be confirmed',()=>{
 assert.match(planEquipmentRemoval(draft(),['inv-a','inv-b']).error,/inverter/);assert.match(planEquipmentRemoval(draft(),['site']).error,/Velg/);
});
