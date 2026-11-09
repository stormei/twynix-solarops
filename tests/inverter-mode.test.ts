import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {operatingStateEvidence,operatingState} from '../src/app/domain/solar.ts';
import {inverterMode,inverterCommunication} from '../src/app/domain/operations.ts';
import {demoPlant} from '../src/app/core/demo.ts';
test('normalised modes and explicitly mapped codes preserve MPPT, sleep, startup and fault',()=>{
 for(const state of ['mppt','sleep','startup','fault'] as const){assert.deepEqual(operatingStateEvidence(state,{},null,false),{state,source:'canonical'});assert.deepEqual(operatingStateEvidence(42,{'42':state},null,false),{state,source:'mapped'});}
 assert.equal(operatingState(4,{},null,false),'unknown');assert.equal(operatingState(4,{},true,false),'running');assert.equal(operatingState('mppt',{},true,true),'fault');assert.equal(operatingState('sleep',{},true,false),'sleep');assert.equal(operatingState('vendor-sleep',{},null,false),'unknown');
});
test('device communication and mode age are independent of power freshness',()=>{
 const i=demoPlant().inverters[0];i.state='sleep';i.stateTimestamp=1000;i.staleAfterMs=2000;i.connected=true;i.ac={value:0,timestamp:5000,quality:'good'};
 assert.deepEqual(inverterMode(i,5000),{state:'sleep',quality:'stale',timestamp:1000});assert.equal(inverterCommunication(i),'Tilkoblet');i.connected=false;assert.equal(inverterMode(i,2000).state,'sleep');assert.equal(inverterCommunication(i),'Frakoblet');i.stateTimestamp=null;assert.equal(inverterMode(i,2000).quality,'missing');
});
test('ThingsBoard normalisation template preserves raw samples and only converts confirmed mappings',async()=>{
 const body=await readFile(new URL('../templates/solarops-v1/thingsboard/normalize-inverter-mode.js',import.meta.url),'utf8'),run=new Function('msg','metadata','msgType',body);
 const original={OperatingState:'4.0',ACPower:125},metadata={solaropsStateMapping:JSON.stringify({'4':'mppt'})};const result=run(original,metadata,'POST_TELEMETRY_REQUEST');
 assert.deepEqual(original,{OperatingState:'4.0',ACPower:125});assert.deepEqual(result.msg,{...original,solaropsOperatingMode:'mppt',solaropsOperatingModeRaw:'4.0'});assert.equal(result.metadata,metadata);
 assert.equal(run({OperatingState:99},{},'POST_TELEMETRY_REQUEST').msg.solaropsOperatingMode,'unknown');assert.deepEqual(run({ACPower:0},{},'POST_TELEMETRY_REQUEST').msg,{ACPower:0});
});

test('mode freshness uses its actual signal, not a newer power or fault-clear timestamp, and raw codes retain their timestamp',async()=>{
 const {inverterStateSample}=await import('../server/plant.ts');
 const keys={operatingState:{key:'Mode',unit:''},rawOperatingState:{key:'VendorCode',unit:''},runFeedback:{key:'Run',unit:''},faultActive:{key:'Fault',unit:''}};
 const data={Mode:[{ts:100,value:'mppt'}],VendorCode:[{ts:90,value:4}],Run:[{ts:500,value:true}],Fault:[{ts:600,value:false}],Power:[{ts:700,value:42}]};
 const state=inverterStateSample(data,keys,{});assert.equal(state.state,'mppt');assert.equal(state.stateTimestamp,100);assert.equal(state.stateCode,4);assert.equal(state.rawStateTimestamp,90);assert.equal(state.stateSource,'canonical');
 const fault=inverterStateSample({...data,Fault:[{ts:800,value:true}]},keys,{});assert.equal(fault.state,'fault');assert.equal(fault.stateTimestamp,800);assert.equal(fault.rawState,4);
});
