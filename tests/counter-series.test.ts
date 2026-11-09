import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CounterSeries} from '../server/counter-series.ts';
import {ThingsBoard} from '../server/thingsboard.ts';
import {settings} from '../server/config.ts';
import {localMidnight,localMonthStart} from '../src/app/domain/time.ts';
import {recordedPeriod} from '../src/app/domain/energy-period.ts';
import {PlantService} from '../server/plant.ts';
const base=Date.parse('2026-11-08T10:00:00Z');
function fixture(points:{ts:number;value:number|null}[],unit='kWh'){
 let requests=0;const tb=new ThingsBoard({...settings(),url:'https://counter.test',timezone:'Europe/Oslo',historyPath:'/history'},'fake',async input=>{requests++;const u=new URL(String(input));return Response.json({Energy:points.filter(p=>p.ts>=Number(u.searchParams.get('startTs'))&&p.ts<=Number(u.searchParams.get('endTs')))});});
 return {cache:new CounterSeries(tb),mapping:{key:'Energy',unit},requests:()=>requests};
}
const sample=(ts:number,value:number|null)=>({timestamp:ts,value,quality:'good' as const});
test('inverter energy advances from live counters without another history fetch',async()=>{const f=fixture([{ts:base,value:100},{ts:base+1000,value:101}]);let result=await f.cache.read('i',f.mapping,sample(base+1000,101),base,base+1000);const calls=f.requests();assert.equal(result.today.value,1);result=await f.cache.read('i',f.mapping,sample(base+2000,103),base,base+2000);assert.equal(result.today.value,3);assert.equal(result.month.value,3);assert.equal(f.requests(),calls);await f.cache.read('i',f.mapping,sample(base+2000,103),base,base+3000);assert.equal(f.requests(),calls);});
test('live resets and long gaps are excluded while subsequent production remains visible',async()=>{const f=fixture([{ts:base,value:100},{ts:base+1000,value:101}]);await f.cache.read('i',f.mapping,sample(base+1000,101),base,base+1000);await f.cache.read('i',f.mapping,sample(base+2000,0),base,base+2000);let r=await f.cache.read('i',f.mapping,sample(base+3000,2),base,base+3000);assert.equal(r.today.value,3);assert.ok(r.today.issues.includes('counter reset'));r=await f.cache.read('i',f.mapping,sample(base+1000000,50),base,base+1000000);assert.equal(r.today.value,3);assert.ok(r.today.issues.includes('missing samples'));});
test('cache agrees with the reference calculation across midnight and a counter reset',async()=>{const midnight=localMidnight(Date.parse('2026-11-08T12:00:00Z'),'Europe/Oslo'),points=[{ts:midnight-60000,value:100},{ts:midnight+60000,value:102},{ts:midnight+120000,value:1},{ts:midnight+180000,value:3}],f=fixture(points),now=midnight+180000,r=await f.cache.read('i',f.mapping,sample(now,3),points[0].ts,now),expected=recordedPeriod(points,midnight,now);assert.equal(r.today.value,expected.value);assert.equal(r.today.coverage,expected.coverage);assert.deepEqual(new Set(r.today.issues),new Set(expected.issues));assert.equal(r.today.start,midnight);});
test('day and month calculations follow Oslo calendar boundaries including DST',()=>{assert.equal(new Date(localMonthStart(Date.parse('2026-03-31T20:00Z'),'Europe/Oslo')).toISOString(),'2026-02-28T23:00:00.000Z');assert.equal(new Date(localMonthStart(Date.parse('2026-10-31T20:00Z'),'Europe/Oslo')).toISOString(),'2026-09-30T22:00:00.000Z');});
test('empty or missing counters stay unavailable and Wh counters convert explicitly',async()=>{const empty=fixture([]);assert.equal((await empty.cache.read('i',undefined,sample(base,null),base,base)).today.value,null);const f=fixture([{ts:base,value:1000},{ts:base+1000,value:1500}],'Wh'),r=await f.cache.read('i',f.mapping,sample(base+1000,1.5),base,base+1000);assert.equal(r.today.value,.5);assert.equal(r.month.value,.5);});
test('cached current-day coverage decreases as samples stop and month rollover starts a new counter window',async()=>{const points=[{ts:base,value:1},{ts:base+1000,value:2}],f=fixture(points);const a=await f.cache.read('i',f.mapping,sample(base+1000,2),base,base+1000),b=await f.cache.read('i',f.mapping,sample(base+1000,2),base,base+5000);assert.equal(b.today.value,a.today.value);assert.ok(b.today.coverage<a.today.coverage);const next=Date.parse('2026-12-01T00:00Z'),r=await f.cache.read('i',f.mapping,sample(base+1000,2),base,next);assert.equal(r.month.value,null);});
test('plant energy without a site controller equals inverter deltas and advances on WebSocket snapshots',async()=>{
 const now=Date.now();let live=false,counterReads=0;
 const tb=new ThingsBoard({...settings(),url:'https://plant-counter.test',timezone:'Europe/Oslo',historyPath:'/history',discoveryMode:'legacy',devicePrefix:'Solar - ',mapping:{acPower:{key:'ACPower',unit:'kW'},lifetimeEnergy:{key:'Energy',unit:'kWh'},runFeedback:{key:'RunFeedback',unit:''}}},'fake',async input=>{
  const u=new URL(String(input));if(u.pathname==='/api/user/devices')return Response.json({data:[{id:{id:'i',entityType:'DEVICE'},name:'Solar - INV-1',createdTime:now-120000}],hasNext:false});if(u.pathname.includes('/values/attributes'))return Response.json([{key:'active',value:true}]);if(u.pathname.startsWith('/api/alarm/'))return Response.json({data:[],hasNext:false});
  const keys=u.searchParams.get('keys')!.split(',');if(u.pathname.endsWith('/history')){if(keys.includes('Energy'))counterReads++;return Response.json(Object.fromEntries(keys.map(key=>[key,key==='Energy'?[{ts:now-120000,value:100},{ts:now-1000,value:101}]:[]])));}
  return Response.json(Object.fromEntries(keys.map(key=>[key,[{ts:live?now-500:now-1000,value:key==='Energy'?(live?102:101):key==='RunFeedback'?true:10}]])));
 });
 const service=new PlantService(tb),first=await service.query();assert.equal(first.recordedEnergy!.value,1);assert.equal(first.monthEnergy!.value,1);assert.equal(first.energySource,'inverters');assert.equal(first.daily.length,1);const count=counterReads;live=true;const second=await service.query(undefined,undefined,first);assert.equal(second.inverters[0].energyPeriod!.value,2);assert.equal(second.recordedEnergy!.value,2);assert.equal(second.monthEnergy!.value,2);assert.equal(counterReads,count);
});
test('history failures preserve live inverter readings and retry energy at most once per minute',async()=>{
 const now=Date.now();let counterReads=0;
 const tb=new ThingsBoard({...settings(),url:'https://unavailable-counter.test',timezone:'Europe/Oslo',historyPath:'/history',mapping:{acPower:{key:'ACPower',unit:'kW'},lifetimeEnergy:{key:'Energy',unit:'kWh'},runFeedback:{key:'RunFeedback',unit:''}}},'fake',async input=>{
  const u=new URL(String(input));if(u.pathname.includes('/values/attributes'))return Response.json([{key:'active',value:true}]);
  const keys=u.searchParams.get('keys')!.split(',');if(u.pathname.endsWith('/history')){if(keys.includes('Energy'))counterReads++;throw new Error('History timed out');}
  return Response.json(Object.fromEntries(keys.map(key=>[key,[{ts:now-1000,value:key==='Energy'?100:key==='RunFeedback'?true:10}]])));
 });
 const service=new PlantService(tb),entity={id:{id:'i',entityType:'DEVICE' as const},name:'INV-1',createdTime:now-120000},first=await service.device(entity,now-120000,now);
 assert.equal(first.ac.value,10);assert.equal(first.state,'running');assert.equal(first.energyPeriod!.value,null);assert.ok(first.energyPeriod!.issues.includes('energy history unavailable'));assert.deepEqual(first.history,[]);
 await service.device(entity,now-120000,now,false,first);assert.equal(counterReads,1);
});
