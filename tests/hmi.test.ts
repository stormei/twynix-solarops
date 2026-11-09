import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validLayout} from '../src/app/domain/diagram.ts';
import {pruneHmi,remapHmi,hmiReading,hmiTrend,hmiWirePath,type HmiDrawing} from '../src/app/domain/hmi.ts';
import {demoPlant} from '../src/app/core/demo.ts';
const h:HmiDrawing={elements:[{id:'hmi_bus',kind:'acBus',label:'AC',x:500,y:100,width:240,height:94},{id:'hmi_value',kind:'value',label:'Power',x:100,y:100,width:212,height:94,bindingId:'inverter',field:'acPower'}],connections:[{id:'hmi_wire',from:'inverter',to:'hmi_bus',circuit:'ac',bend:400}]};
test('HMI layout validates bindings, endpoint references, dimensions and bounded data without changing old layouts',()=>{
 const ids=new Set(['inverter']);assert.equal(validLayout({version:1,positions:{},hmi:h},ids),true);assert.equal(validLayout({version:1,positions:{}},ids),true);
 for(const patch of [{bindingId:'unknown'},{width:0},{x:Infinity},{field:'unverified'},{kind:'script'},{label:'x'.repeat(161)}])assert.equal(validLayout({version:1,positions:{},hmi:{...h,elements:[{...h.elements[0],...patch}]}},ids),false);
 assert.equal(validLayout({version:1,positions:{},hmi:{...h,connections:[{...h.connections[0],to:'unknown'}]}},ids),false);
});
test('removing equipment clears its display bindings and drawing wires without removing annotation symbols',()=>{
 const p=pruneHmi(h,new Set());assert.equal(p!.elements.length,2);assert.equal(p!.elements[1].bindingId,undefined);assert.equal(p!.connections.length,0);assert.equal(h.elements[1].bindingId,'inverter');
 const mapped=remapHmi(h,id=>id==='inverter'?'saved-inverter':id)!;assert.equal(mapped.elements[1].bindingId,'saved-inverter');assert.equal(mapped.connections[0].from,'saved-inverter');assert.equal(mapped.connections[0].to,'hmi_bus');
});
test('live labels retain measured zero, source quality and missing mappings',()=>{
 const p=demoPlant(),i=p.inverters[0],e={...h.elements[1],bindingId:i.id};i.ac={value:0,timestamp:p.timestamp,quality:'good'};
 assert.equal(hmiReading(e,p,[],p.timestamp).measurement.value,0);assert.equal(hmiReading(e,p,[],p.timestamp+200000).measurement.quality,'stale');assert.equal(hmiReading({...e,bindingId:'unknown'},p,[],p.timestamp).measurement.value,null);assert.equal(hmiReading({...e,field:'unknown'},p,[],p.timestamp).measurement.value,null);
});
test('mini trends keep discontinuities, and drawing routes use explicit orthogonal bends',()=>{
 const p=demoPlant(),i=p.inverters[0],e={...h.elements[1],bindingId:i.id,kind:'trend' as const,height:130};i.history=[{ts:0,value:1},{ts:100,value:null},{ts:200,value:3},{ts:2000000,value:5}];
 assert.equal((hmiTrend(e,p).match(/M/g)??[]).length,3);assert.equal(hmiTrend({...e,field:'cabinetTemperature'},p),'');assert.equal(hmiWirePath({x:0,y:20},{x:200,y:80},140),'M 0 20 H 140 V 80 H 200');
});
