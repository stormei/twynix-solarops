import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zoomAt,wheelZoom,MIN_ZOOM,MAX_ZOOM} from '../src/app/domain/diagram-viewport.ts';
test('zoom keeps the world point under an off-center cursor at the same screen position',()=>{
 const pan={x:135,y:-73},anchor={x:530,y:210},old=1.3;
 for(const requested of [2,.8,100,.001]){const next=zoomAt(pan,old,requested,anchor);assert.ok(Math.abs((anchor.x-pan.x)*old-(anchor.x-next.pan.x)*next.zoom)<1e-9);assert.ok(Math.abs((anchor.y-pan.y)*old-(anchor.y-next.pan.y)*next.zoom)<1e-9);}
});
test('reaching zoom limits does not drift the pan',()=>{
 const pan={x:38,y:-22};assert.deepEqual(zoomAt(pan,MAX_ZOOM,100,{x:420,y:370}),{pan,zoom:MAX_ZOOM});assert.deepEqual(zoomAt(pan,MIN_ZOOM,.001,{x:420,y:370}),{pan,zoom:MIN_ZOOM});
});
test('wheel deltas normalize pixels, lines and pages and cap unusually large wheel steps',()=>{
 assert.equal(wheelZoom(1,16,0,640),wheelZoom(1,1,1,640));assert.equal(wheelZoom(1,64,0,640),wheelZoom(1,.1,2,640));assert.ok(wheelZoom(1,-50,0,640)>1);assert.ok(wheelZoom(1,50,0,640)<1);assert.equal(wheelZoom(1,99999,0,640),wheelZoom(1,120,0,640));
});
