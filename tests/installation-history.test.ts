import {planEquipmentRemoval} from '../src/app/domain/installation-removal.ts';
import '@angular/compiler';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signal} from '@angular/core';
import {InstallationManagement} from '../src/app/features/installation.ts';
import type {InstallationDraft} from '../src/app/domain/installation.ts';
function editor(){
 const d=Object.create(InstallationManagement.prototype) as InstallationManagement;
 const original={assetId:'site',nodes:[{id:'site'},{id:'pv',feedsTo:'inv-a'},{id:'inv-a'},{id:'inv-b'}],layout:{version:1,positions:{pv:{x:20,y:40},'inv-a':{x:200,y:40}}}} as unknown as InstallationDraft;
 Object.assign(d,{draft:signal(structuredClone(original)),history:signal([]),future:signal([]),selected:signal('pv'),multiSelection:signal(['pv','inv-a']),review:signal(null),success:signal(''),error:signal(''),canEdit:()=>true,wizard:signal(false),adding:signal(false),reviewing:signal(false),discardPrompt:signal(false),groupNameDrafts:signal({}),renameGroupId:signal(''),deleteIds:signal([]),pasteDialog:signal(null),resizing:signal(null)});
 return {d,original};
}
test('undo and redo restore a layout move and a connection change in order',()=>{
 const {d,original}=editor();d.remember();d.draft.update(v=>({...v!,layout:{version:1,positions:{pv:{x:60,y:80},'inv-a':{x:240,y:80}}}}));const moved=structuredClone(d.draft());d.remember();d.draft.update(v=>({...v!,nodes:v!.nodes.map(n=>n.id==='pv'?{...n,feedsTo:'inv-b'}:n)}));const connected=structuredClone(d.draft());
 d.undo();assert.deepEqual(d.draft(),moved);d.undo();assert.deepEqual(d.draft(),original);assert.equal(d.future().length,2);d.redo();assert.deepEqual(d.draft(),moved);d.redo();assert.deepEqual(d.draft(),connected);assert.equal(d.future().length,0);
});
test('a new edit after undo discards the previous redo branch',()=>{
 const {d}=editor();d.remember();d.draft.update(v=>({...v!,timezone:'UTC'}));d.undo();assert.equal(d.future().length,1);d.remember();d.draft.update(v=>({...v!,timezone:'Europe/Oslo'}));assert.equal(d.future().length,0);d.redo();assert.equal(d.draft()!.timezone,'Europe/Oslo');
});
test('shortcuts respect text fields, dialogs and active drawing gestures',()=>{
 const {d}=editor();let prevented=0;const event=(shift=false,text=false)=>({key:'z',ctrlKey:true,metaKey:false,shiftKey:shift,altKey:false,defaultPrevented:false,target:{closest:()=>text?{}:null},preventDefault:()=>prevented++}) as unknown as KeyboardEvent;
 d.remember();d.draft.update(v=>({...v!,timezone:'UTC'}));d.historyKey(event(false,true));assert.equal(d.history().length,1);d.wizard.set(true);d.historyKey(event());assert.equal(d.history().length,1);d.wizard.set(false);(d as any).diagram={interacting:()=>true};d.historyKey(event());assert.equal(d.history().length,1);(d as any).diagram={interacting:()=>false};d.historyKey(event());assert.equal(d.future().length,1);d.historyKey(event(true));assert.equal(d.draft()!.timezone,'UTC');assert.equal(prevented,2);
});
test('restoring a draft removes selection references to equipment that no longer exists',()=>{
 const {d}=editor();d.remember();d.draft.update(v=>({...v!,nodes:[...v!.nodes,{id:'new-equipment'} as any]}));d.selected.set('new-equipment');d.multiSelection.set(['new-equipment','pv']);d.undo();assert.equal(d.selected(),'site');assert.deepEqual(d.multiSelection(),['pv']);
});

test('clipboard shortcuts handle Ctrl/Cmd+C, V and D without intercepting text editing',()=>{
 const {d}=editor();const calls:string[]=[];d.copySelection=()=>calls.push('copy');d.pasteSelection=()=>calls.push('paste');d.duplicateSelection=()=>calls.push('duplicate');let prevented=0;
 for(const key of ['c','v','d'])d.clipboardKey({key,ctrlKey:true,metaKey:false,shiftKey:false,altKey:false,defaultPrevented:false,target:{closest:()=>null},preventDefault:()=>prevented++} as unknown as KeyboardEvent);
 d.clipboardKey({key:'c',ctrlKey:false,metaKey:true,target:{closest:()=>null},preventDefault:()=>prevented++} as unknown as KeyboardEvent);
 d.clipboardKey({key:'v',ctrlKey:true,target:{closest:()=>({})},preventDefault:()=>prevented++} as unknown as KeyboardEvent);
 assert.deepEqual(calls,['copy','paste','duplicate','copy']);assert.equal(prevented,4);
});

test('each asset paste and duplicate adds exactly one history entry and undo removes the new nodes',()=>{
 const {d}=editor();Object.assign(d,{clipboard:{value:signal(null)},pasteDevices:signal({}),pasteStrings:signal({}),pasteBusy:signal(false),pasteError:signal(''),pasteSequence:0,view:signal('visual'),drawingSelection:()=>['zone']});
 const original={assetId:'site',baseline:'b',timezone:'UTC',nodes:[{id:'site',entityType:'ASSET',role:'site',name:'Site',label:'',equipmentKey:'site',parentId:null,mapping:{},feedsTo:null},{id:'zone',entityType:'ASSET',role:'zone',name:'Zone',label:'',equipmentKey:'zone',parentId:'site',mapping:{},feedsTo:null}]} as InstallationDraft;d.draft.set(original);d.copySelection();d.pasteSelection();assert.equal(d.draft()!.nodes.length,3);assert.equal(d.history().length,1);d.duplicateSelection();assert.equal(d.draft()!.nodes.length,4);assert.equal(d.history().length,2);d.undo();assert.equal(d.draft()!.nodes.length,3);d.undo();assert.equal(d.draft()!.nodes.length,2);assert.equal(d.history().length,0);d.redo();assert.equal(d.draft()!.nodes.length,3);
});

test('confirmed removal is one undoable change that restores equipment, layout and DC links',()=>{
 const {d}=editor();const original={assetId:'site',baseline:'b',timezone:'UTC',nodes:[{id:'site',entityType:'ASSET',role:'site',parentId:null},{id:'inv-a',entityType:'DEVICE',role:'inverter',parentId:'site'},{id:'inv-b',entityType:'DEVICE',role:'inverter',parentId:'site'},{id:'pv',entityType:'ASSET',role:'pvArray',parentId:'site',feedsTo:'inv-a'}],layout:{version:1,positions:{'inv-a':{x:40,y:60},'inv-b':{x:40,y:200},pv:{x:300,y:60}}}} as InstallationDraft;
 d.draft.set(original);d.deletePlan=(()=>planEquipmentRemoval(d.draft()!,d.deleteIds())) as any;d.requestDelete(['inv-a']);assert.equal(d.draft()!.nodes.length,4);d.confirmDelete();assert.equal(d.draft()!.nodes.length,3);assert.equal(d.draft()!.nodes.find(n=>n.id==='pv')!.feedsTo,null);assert.equal(d.history().length,1);d.undo();assert.deepEqual(d.draft(),original);d.redo();assert.equal(d.draft()!.nodes.length,3);
});
test('Delete shortcut requests confirmation and ignores editing fields and modifiers',()=>{
 const {d}=editor();let requests=0,prevented=0;d.requestDelete=()=>requests++;
 const event=(text=false,ctrl=false)=>({key:'Delete',ctrlKey:ctrl,target:{closest:()=>text?{}:null},preventDefault:()=>prevented++}) as unknown as KeyboardEvent;
 d.deleteKey(event());d.deleteKey(event(true));d.deleteKey(event(false,true));d.deleteIds.set(['pv']);d.deleteKey(event());assert.equal(requests,1);assert.equal(prevented,1);
});

test('group shortcuts dispatch Group and Ungroup and preserve native text-field shortcuts',()=>{
 const {d}=editor();const actions:string[]=[];Object.assign(d,{view:()=> 'visual',diagram:{interacting:()=>false,group:()=>actions.push('group'),ungroup:()=>actions.push('ungroup')}});let prevented=0;
 for(const shiftKey of [false,true])d.groupKey({key:'g',ctrlKey:true,shiftKey,target:{closest:()=>null},preventDefault:()=>prevented++} as unknown as KeyboardEvent);
 d.groupKey({key:'g',metaKey:true,target:{closest:()=>({})},preventDefault:()=>prevented++} as unknown as KeyboardEvent);assert.deepEqual(actions,['group','ungroup']);assert.equal(prevented,2);
});

test('renaming through properties is one undoable edit and invalid names do not change the draft',()=>{
 const {d}=editor();d.draft.update(v=>({...v!,layout:{...v!.layout!,groups:[{id:'g1',name:'Group 1',members:['pv','inv-a']}]}}));
 d.setGroupNameDraft('g1',' South array / INV-101 ');d.applyGroupName('g1');assert.equal(d.draft()!.layout!.groups![0].name,'South array / INV-101');assert.equal(d.history().length,1);assert.deepEqual(d.groupNameDrafts(),{});
 d.undo();assert.equal(d.draft()!.layout!.groups![0].name,'Group 1');d.redo();assert.equal(d.draft()!.layout!.groups![0].name,'South array / INV-101');
 d.setGroupNameDraft('g1',' ');d.applyGroupName('g1');assert.equal(d.history().length,1);assert.equal(d.draft()!.layout!.groups![0].name,'South array / INV-101');d.cancelGroupName('g1');assert.equal(d.groupNameValue('g1'),'South array / INV-101');
});

test('rename dialog can cancel without edits and confirm as one undoable change',()=>{
 const {d}=editor();Object.assign(d,{renameGroupValue:signal(''),renameGroupIssue:()=>'',focusDrawing(){}});d.draft.update(v=>({...v!,layout:{...v!.layout!,groups:[{id:'g1',name:'Group 1',members:['pv','inv-a']}]}}));
 d.requestGroupRename('g1');assert.equal(d.renameGroupValue(),'Group 1');assert.equal(d.historyAvailable(),false);d.renameGroupValue.set('Cancelled');d.cancelGroupRename();assert.equal(d.history().length,0);assert.equal(d.draft()!.layout!.groups![0].name,'Group 1');
 d.requestGroupRename('g1');d.renameGroupValue.set('PV block 101');d.confirmGroupRename();assert.equal(d.renameGroupId(),'');assert.equal(d.history().length,1);d.undo();assert.equal(d.draft()!.layout!.groups![0].name,'Group 1');d.redo();assert.equal(d.draft()!.layout!.groups![0].name,'PV block 101');
});
