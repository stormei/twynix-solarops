import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapSelection,readSnapPreferences} from '../src/app/domain/diagram-snapping.ts';
test('grid snaps the dragged item to absolute grid coordinates, preserving group offsets',()=>{
 const p={a:{x:13,y:27},b:{x:93,y:77}};const result=snapSelection(p,['a','b'],'a',{x:14,y:16},{grid:true,guides:false,tolerance:6});
 assert.deepEqual(result.positions,{a:{x:20,y:40},b:{x:100,y:90}});assert.deepEqual(result.guides,[]);
});
test('turning off both snapping options allows precise unsnapped movement',()=>{
 const p={a:{x:13,y:27}};assert.deepEqual(snapSelection(p,['a'],'a',{x:4.5,y:7.2},{grid:false,guides:false,tolerance:6}).positions,{a:{x:17.5,y:34.2}});
});
test('guides magnetically align to stationary edges and centers and override grid on that axis',()=>{
 const p={a:{x:10,y:10},target:{x:103,y:220}};
 const r=snapSelection(p,['a'],'a',{x:90,y:20},{grid:true,guides:true,tolerance:6});
 assert.equal(r.positions.a.x,103);assert.equal(r.positions.a.y,40);assert.equal(r.guides.length,1);assert.equal(r.guides[0].x1,103);
});
test('guide tolerance is supplied in drawing units and selected items cannot snap to themselves',()=>{
 const p={a:{x:10,y:10},target:{x:103,y:220}};
 assert.equal(snapSelection(p,['a'],'a',{x:90,y:20},{grid:false,guides:true,tolerance:2}).positions.a.x,100);
 assert.equal(snapSelection(p,['a'],'a',{x:90,y:20},{grid:false,guides:true,tolerance:6}).positions.a.x,103);
 assert.deepEqual(snapSelection(p,['a','target'],'a',{x:7,y:9},{grid:false,guides:true,tolerance:6}).guides,[]);
});
test('snapping keeps all selected items inside the supported drawing bounds',()=>{
 const r=snapSelection({a:{x:13,y:10},b:{x:83,y:50}},['a','b'],'a',{x:-100,y:-100},{grid:true,guides:true,tolerance:6});assert.deepEqual(r.positions,{a:{x:0,y:0},b:{x:70,y:40}});
});
test('snapping preferences restore independently and safely handle invalid storage',()=>{
 assert.deepEqual(readSnapPreferences('{"version":1,"grid":false,"guides":true}'),{grid:false,guides:true});assert.deepEqual(readSnapPreferences('bad'),{grid:true,guides:true});assert.deepEqual(readSnapPreferences('{"version":1,"grid":"off","guides":false}'),{grid:true,guides:false});
});
