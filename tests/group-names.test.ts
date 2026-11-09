import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupNameIssue,renameDrawingGroup} from '../src/app/domain/group-names.ts';
import type {DiagramLayout} from '../src/app/domain/diagram.ts';
const layout:DiagramLayout={version:1,positions:{a:{x:0,y:0},b:{x:200,y:0},c:{x:0,y:200},d:{x:200,y:200}},groups:[{id:'south',name:'South roof',members:['a','b']},{id:'north',name:'North roof',members:['c','d']}]};
test('renaming trims names and preserves identity, members and equipment positions',()=>{
 const renamed=renameDrawingGroup(layout,'south','  South PV / INV-101  ');
 assert.equal(renamed.groups![0].name,'South PV / INV-101');assert.equal(renamed.groups![0].id,'south');assert.deepEqual(renamed.groups![0].members,['a','b']);assert.equal(renamed.positions,layout.positions);assert.equal(layout.groups![0].name,'South roof');assert.equal(renameDrawingGroup(layout,'south',' South roof '),layout);
});
test('blank, overlong, duplicate and missing group names are rejected',()=>{
 for(const value of ['','   ','x'.repeat(81),' NORTH ROOF '])assert.ok(groupNameIssue(layout.groups!,'south',value));
 assert.equal(groupNameIssue(layout.groups!,'south','x'.repeat(80)),'');assert.ok(groupNameIssue(layout.groups!,'missing','Roof'));assert.throws(()=>renameDrawingGroup(layout,'south','North roof'));
});
