import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveSelection,alignSelection,distributeSelection,boxedSelection} from '../src/app/domain/diagram-selection.ts';
const p={a:{x:40,y:70},b:{x:140,y:150},c:{x:600,y:410},other:{x:950,y:620}};
test('group movement snaps one shared delta and preserves relative offsets at both drawing boundaries',()=>{
 assert.deepEqual(moveSelection(p,['a','b'],{x:-200,y:31}),{a:{x:0,y:110},b:{x:100,y:190}});
 const far={a:{x:19980,y:100},b:{x:19920,y:180}};assert.deepEqual(moveSelection(far,['a','b'],{x:500,y:0}),{a:{x:20000,y:100},b:{x:19940,y:180}});assert.deepEqual(p.other,{x:950,y:620});
});
test('alignment affects only selected coordinates and supports edges and centers',()=>{
 assert.deepEqual(alignSelection(p,['a','b'],'left'),{a:{x:40,y:70},b:{x:40,y:150}});
 assert.deepEqual(alignSelection(p,['a','b'],'right'),{a:{x:140,y:70},b:{x:140,y:150}});
 assert.equal(alignSelection(p,['a','b'],'center').a.x,90);
 assert.equal(alignSelection(p,['a','b'],'top').b.y,70);
 assert.equal(alignSelection(p,['a','b'],'bottom').a.y,150);
 assert.equal(alignSelection(p,['a','b'],'middle').a.y,110);
});
test('distribution preserves end items, spaces the middle items evenly, and ignores selection order',()=>{
 const result=distributeSelection(p,['c','a','b'],'x');assert.deepEqual(result,{a:p.a,b:{x:320,y:150},c:p.c});assert.deepEqual(distributeSelection(p,['a','b'],'x'),{});
});
test('box selection works in either drag direction and intersects whole equipment cards',()=>{
 assert.deepEqual(boxedSelection(p,{x:0,y:0},{x:300,y:250}),['a','b']);assert.deepEqual(boxedSelection(p,{x:300,y:250},{x:0,y:0}),['a','b']);assert.deepEqual(boxedSelection(p,{x:500,y:0},{x:550,y:10}),[]);
});
