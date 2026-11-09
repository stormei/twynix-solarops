import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateEnergyReport,getEnergyReport,reportWindow} from '../server/production-report.ts';
import {ThingsBoard,ApiError,type Entity} from '../server/thingsboard.ts';
import {recordedPeriod} from '../src/app/domain/energy-period.ts';
import {settings} from '../server/config.ts';
const midnight=Date.parse('2026-11-02T00:00:00Z'),now=midnight+180000;
const entity=(id:string,mapped=true):Entity=>({id:{id,entityType:'DEVICE'},name:id,solarops:{solaropsTelemetryMapping:mapped?{lifetimeEnergy:{key:'Energy',unit:'Wh'}}:{}} as Entity['solarops']});
function fixture(devices:Entity[],samples:Record<string,{ts:number;value:unknown}[]>,failure?:Error){
 let reads=0;const tb={config:{...settings(),timezone:'UTC'},discover:async()=>({asset:{id:{id:'site'},name:'Solar site'},devices}),rawHistory:async(id:string)=>{reads++;if(failure)throw failure;return {Energy:samples[id]??[]};}} as unknown as ThingsBoard;return {tb,reads:()=>reads};
}
test('report daily/month totals use verified interval rules, units, reset and gap handling',async()=>{
 const samples=[{ts:midnight-60000,value:1000},{ts:midnight+60000,value:3000},{ts:midnight+120000,value:100},{ts:midnight+180000,value:1100}],f=fixture([entity('i')],{i:samples}),r=await calculateEnergyReport(f.tb,'2026-11',now),reference=recordedPeriod(samples.map(p=>({ts:p.ts,value:p.value/1000})),r.start,r.end);
 assert.equal(r.site.value,3);assert.equal(r.inverters[0].period.value,reference.value);assert.equal(r.site.coverage,reference.coverage);assert.equal(r.days[0].site.value,1);assert.equal(r.days[1].site.value,2);assert.ok(r.days[1].site.issues.includes('counter reset'));assert.equal(r.ongoing,true);
});
test('missing device history is never zero or omitted from the site total',async()=>{
 const f=fixture([entity('i'),entity('missing')],{i:[{ts:midnight,value:1000},{ts:now,value:2000}]}),r=await calculateEnergyReport(f.tb,'2026-11',now);
 assert.equal(r.inverters[0].period.value,1);assert.equal(r.inverters[1].period.value,null);assert.equal(r.site.value,null);assert.ok(r.site.issues.includes('incomplete inverter coverage'));assert.equal(r.days.at(-1)!.site.value,null);
});
test('boolean and invalid counters cannot become invented production',async()=>{
 const f=fixture([entity('i')],{i:[{ts:midnight,value:true},{ts:midnight+60000,value:1000},{ts:midnight+120000,value:'bad'},{ts:now,value:2000}]}),r=await calculateEnergyReport(f.tb,'2026-11',now);assert.equal(r.site.value,null);assert.ok(r.site.issues.includes('invalid sample'));
});
test('history timeouts and unmapped counters remain visible; authorization failures propagate',async()=>{
 const f=fixture([entity('i')],{},new Error('timeout')),r=await calculateEnergyReport(f.tb,'2026-11',now);assert.equal(r.site.value,null);assert.ok(r.inverters[0].period.issues.includes('energy history unavailable'));
 const unmapped=await calculateEnergyReport(fixture([entity('x',false)],{}).tb,'2026-11',now);assert.ok(unmapped.site.issues.includes('energy counter not mapped'));
 await assert.rejects(()=>calculateEnergyReport(fixture([entity('i')],{},new ApiError(403,'Denied')).tb,'2026-11',now),(e:unknown)=>e instanceof ApiError&&e.status===403);
});
test('calendar report windows honor Oslo DST and reject future or malformed periods',()=>{
 const r=reportWindow('2026-10','Europe/Oslo',Date.parse('2026-11-03T12:00Z'));assert.equal(r.days.length,31);assert.equal(r.days[24].end-r.days[24].start,25*3600000);assert.equal(r.end-r.start,31*86400000+3600000);assert.equal(r.ongoing,false);
 assert.throws(()=>reportWindow('2026-13','UTC',now));assert.throws(()=>reportWindow('2026-12','UTC',now));
});
test('report snapshots coalesce reads and PDF requests reuse exactly the displayed data',async()=>{
 const date=new Date(),month=new Intl.DateTimeFormat('sv-SE',{timeZone:'UTC',year:'numeric',month:'2-digit'}).format(date),t=date.getTime(),f=fixture([entity('i')],{i:[{ts:t-120000,value:1000},{ts:t-60000,value:2000}]}),[a,b]=await Promise.all([getEnergyReport(f.tb,month),getEnergyReport(f.tb,month)]);assert.equal(a.id,b.id);assert.equal(f.reads(),1);assert.deepEqual(await getEnergyReport(f.tb,month,a.id),a);await assert.rejects(()=>getEnergyReport(f.tb,month,'unknown'),(e:unknown)=>e instanceof ApiError&&e.status===409);
});
test('genuine zero production stays zero when a complete valid counter interval exists',async()=>{
 const start=Date.parse('2026-11-01T00:00Z'),end=start+600000,f=fixture([entity('i')],{i:[{ts:start,value:1000},{ts:end,value:1000}]}),r=await calculateEnergyReport(f.tb,'2026-11',end);assert.equal(r.site.value,0);assert.equal(r.site.coverage,1);assert.deepEqual(r.site.issues,[]);assert.equal(r.days[0].site.value,0);
});
