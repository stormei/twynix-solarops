import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arrange,canParent,canFeed,validLayout,snap,freePosition,dcTarget} from '../src/app/domain/diagram.ts';
import type {InstallationNode} from '../src/app/domain/installation.ts';
const node=(id:string,role:string,parentId:string|null,entityType:'ASSET'|'DEVICE'='ASSET'):InstallationNode=>({id,role,parentId,entityType,name:id,label:'',equipmentKey:id,mapping:{},feedsTo:null});
const nodes=[node('root','site',null),node('roof','zone','root'),node('pv','pvArray','roof','DEVICE'),node('inv','inverter','root','DEVICE')];
test('hierarchy drops reject devices, self, root moves and descendant cycles',()=>{assert.equal(canParent(nodes,'pv','root'),true);assert.equal(canParent(nodes,'roof','pv'),false);assert.equal(canParent(nodes,'roof','roof'),false);assert.equal(canParent(nodes,'root','roof'),false);const nested=[...nodes,node('child','zone','roof')];assert.equal(canParent(nested,'roof','child'),false);});
test('solar connection ports accept only array to physical inverter devices',()=>{assert.equal(canFeed(nodes,'pv','inv'),true);assert.equal(canFeed(nodes,'inv','pv'),false);assert.equal(canFeed(nodes,'roof','inv'),false);assert.equal(canFeed([...nodes,node('asset-inv','inverter','root')],'pv','asset-inv'),false);});
test('layout validation bounds positions and excludes unknown entities; auto layout includes all equipment',()=>{const layout=arrange(nodes),ids=new Set(nodes.map(n=>n.id));assert.equal(validLayout(layout,ids),true);assert.ok(layout.positions.pv.x<layout.positions.inv.x);assert.equal(validLayout({version:1,positions:{unknown:{x:0,y:0}}},ids),false);assert.equal(validLayout({version:2,positions:{}},ids),false);for(const x of [NaN,Infinity,-1,20001,'10'])assert.equal(validLayout({version:1,positions:{pv:{x,y:0}}},ids),false);assert.deepEqual(snap({x:-15,y:59}),{x:0,y:60});});

test('palette placement avoids covering existing equipment',()=>{const p=freePosition({x:40,y:60},{site:{x:40,y:60},pv:{x:40,y:200}});assert.deepEqual(p,{x:40,y:340});});

test('dragging to the outside edge of an inverter port still selects the DC receiver',()=>{const positions=arrange(nodes).positions,p=positions.inv;assert.equal(dcTarget(nodes,positions,{x:p.x-1,y:p.y+47})?.id,'inv');assert.equal(dcTarget(nodes,positions,{x:p.x-30,y:p.y+47}),undefined);});
