import '@angular/compiler';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signal} from '@angular/core';
import {InstallationDiagram} from '../src/app/features/installation-diagram.ts';
function drawing(){
 const d=Object.create(InstallationDiagram.prototype) as InstallationDiagram;
 let edits=0;
 Object.assign(d,{editable:()=>true,layout:()=>undefined,contextPoint:signal(null),guides:signal([]),pan:signal({x:100,y:80}),panning:signal(false),source:signal('pv-101'),wireSelected:signal('pv-101'),pointer:signal(null),preview:signal({}),hover:signal(''),mode:signal('wire'),point:()=>({x:50,y:60}),selectNode:{emit:()=>edits++},feedChange:{emit:()=>edits++},layoutChange:{emit:()=>edits++}});
 return {d,edits:()=>edits};
}
test('middle-drag pans at the SVG scale while preserving an in-progress connection and avoiding edits',()=>{
 const {d,edits}=drawing();let captured=0,prevented=0;
 const start={button:1,pointerId:7,clientX:200,clientY:300,preventDefault:()=>prevented++,currentTarget:{getScreenCTM:()=>({a:2}),setPointerCapture:()=>captured++}} as unknown as PointerEvent;
 d.start(start,{} as any);d.portDown(start,'inv-101',false);d.selectWire(start,'other-wire');d.background(start);
 d.move({pointerId:7,clientX:260,clientY:280} as PointerEvent);
 assert.deepEqual(d.pan(),{x:70,y:90});assert.equal(d.panning(),true);
 d.end({pointerId:7} as PointerEvent);
 assert.equal(d.panning(),false);assert.equal(d.source(),'pv-101');assert.equal(d.wireSelected(),'pv-101');assert.equal(edits(),0);assert.equal(captured,1);assert.equal(prevented,1);
});
test('lost pointer capture ends panning without committing a layout change',()=>{
 const {d,edits}=drawing();d.background({button:1,pointerId:1,clientX:10,clientY:20,preventDefault(){},currentTarget:{getScreenCTM:()=>({a:1}),setPointerCapture(){}}} as unknown as PointerEvent);d.lostCapture();assert.equal(d.panning(),false);assert.equal(d.source(),'pv-101');assert.equal(edits(),0);
});

test('Shift-drag selects a box without moving equipment or creating installation edits',()=>{
 const {d,edits}=drawing();let selected:string[]=[];
 Object.assign(d,{source:signal(''),mode:signal('move'),marquee:signal(null),activeIds:()=>['existing'],positions:()=>({a:{x:20,y:20},b:{x:400,y:300}}),point:(e:PointerEvent)=>({x:e.clientX,y:e.clientY}),selectionChange:{emit:(ids:string[])=>selected=ids}});
 const target={setPointerCapture(){}};
 d.background({button:0,pointerId:3,shiftKey:true,clientX:0,clientY:0,preventDefault(){},currentTarget:target} as unknown as PointerEvent);
 d.move({pointerId:3,clientX:250,clientY:130} as PointerEvent);
 d.end({pointerId:3,clientX:250,clientY:130} as PointerEvent);
 assert.deepEqual(selected,['existing','a']);assert.equal(d.marquee(),null);assert.equal(edits(),0);
});
