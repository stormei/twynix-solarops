import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ThingsBoard,Entity} from '../server/thingsboard.ts';
import {settings} from '../server/config.ts';
import {inspectSite,listSites,validateMetadata,Issue} from '../server/standard.ts';
import {installationUrl,selectedSettings} from '../server/setup.ts';
const siteId='11111111-1111-1111-1111-111111111111',invId='22222222-2222-2222-2222-222222222222';
function fixture(options:{unit?:string;key?:string;version?:string;cycle?:boolean;stale?:boolean;extra?:boolean}={}){
 const site={id:{id:siteId,entityType:'ASSET'},name:'A renamed site'},inv={id:{id:invId,entityType:'DEVICE'},name:'Vendor naming unrelated to SolarOps'};
 const meta:Record<string,any>={[siteId]:{solaropsSchemaVersion:'1.0.0',solaropsRole:'site',siteKey:'site-one',timezone:'Europe/Oslo',dataSourceKind:'physical'},[invId]:{solaropsSchemaVersion:options.version??'1.0.0',solaropsRole:'inverter',equipmentKey:'inverter-one',solaropsTelemetryMapping:{acPower:{key:options.key??'vendor_watts',unit:options.unit??'W'}}}};
 const urls:string[]=[];
 const tb=new ThingsBoard({...settings(),url:'http://tb.test',assetId:siteId,devicePrefix:'WRONG PREFIX',discoveryMode:'standard',mapping:{acPower:{key:'WRONG',unit:'kW'}}},'test-token',async input=>{
  const u=new URL(String(input));urls.push(u.pathname);
  if(u.pathname==='/api/user/assets')return Response.json({data:[site,...(options.extra?[{id:{id:'other',entityType:'ASSET'},name:'Unrelated'}]:[])],hasNext:false});
  if(u.pathname===`/api/asset/${siteId}`)return Response.json(site);
  if(u.pathname===`/api/device/${invId}`)return Response.json(inv);
  if(u.pathname.includes('values/attributes')){const id=u.pathname.split('/')[5];return Response.json(Object.entries(meta[id]??{}).map(([key,value])=>({key,value})));}
  if(u.pathname.includes('/relations/info/from/DEVICE/'))return Response.json([]);
  if(u.pathname.includes('/relations/info/from/'))return Response.json([{from:site.id,to:inv.id,type:'Contains'},...(options.cycle?[{from:site.id,to:site.id,type:'Contains'}]:[])]);
  if(u.pathname.endsWith('/keys/timeseries'))return Response.json(['vendor_watts']);
  if(u.pathname.endsWith('/values/timeseries'))return Response.json({vendor_watts:[{ts:Date.now()-(options.stale?600000:100),value:'12000'}]});
  throw Error('Unexpected request '+u.pathname);
 });return {tb,urls};
}
test('standard discovery follows roles and Contains relations despite renamed devices and wrong legacy prefix',async()=>{
 const {tb,urls}=fixture();const report=await inspectSite(tb,siteId);assert.equal(report.compatible,true);assert.equal(report.entities.length,1);assert.equal(report.capabilities.energy,false);assert.ok(report.issues.some(i=>i.code==='energy'&&i.severity==='warning'));
 const d=await tb.discover();assert.equal(d.devices[0].id.id,invId);assert.equal(d.devices[0].solarops?.solaropsTelemetryMapping?.acPower.key,'vendor_watts');assert.ok(!urls.includes('/api/user/devices'));
});
test('site picker excludes untagged assets',async()=>{const {tb}=fixture({extra:true});const sites=await listSites(tb);assert.equal(sites.length,1);assert.equal(sites[0].metadata.siteKey,'site-one');});
test('required missing keys and incompatible units block activation',async()=>{
 for(const options of [{key:'missing'}, {unit:'volts'}]){const r=await inspectSite(fixture(options).tb,siteId);assert.equal(r.compatible,false);assert.ok(r.issues.some(i=>i.severity==='error'));}
});
test('stale data is a warning and does not block an otherwise valid installation',async()=>{const r=await inspectSite(fixture({stale:true}).tb,siteId);assert.equal(r.compatible,true);assert.ok(r.issues.some(i=>i.code==='stale'));});
test('unknown schema versions and cyclic Contains trees are rejected without prefix fallback',async()=>{
 for(const options of [{version:'2.0.0'}, {cycle:true}]){const {tb,urls}=fixture(options);assert.equal((await inspectSite(tb,siteId)).compatible,false);await assert.rejects(()=>tb.discover());assert.ok(!urls.includes('/api/user/devices'));}
});
test('metadata validates timezone, provenance, state mapping and equipment identity',()=>{
 const e:Entity={id:{id:'test',entityType:'ASSET'},name:'Bad site',solarops:{solaropsSchemaVersion:'1.0.0',solaropsRole:'site',timezone:'invalid',dataSourceKind:'forecast'}};const issues:Issue[]=[];validateMetadata(e,issues);assert.deepEqual(issues.map(i=>i.code),['site-key','timezone','provenance']);
});
test('instance addresses allow private LAN servers and reject credentials, paths, unsafe schemes and metadata endpoints',()=>{
 // Synthetic address for parser coverage only; no network request is made.
 assert.equal(installationUrl('http://10.20.30.40:8080/'),'http://10.20.30.40:8080');assert.equal(installationUrl('https://tb.example.com'),'https://tb.example.com');
 for(const value of ['file:///tmp','http://user:secret@server','http://server/path','http://server?token=secret','http://169.254.169.254','http://127.0.0.1','http://[::1]'])assert.throws(()=>installationUrl(value));
});
test('site activation removes legacy mappings and selects metadata from the chosen instance',()=>{
 const c=selectedSettings({...settings(),url:'https://other.tb',devicePrefix:'OLD',mapping:{acPower:{key:'old',unit:'kW'}}},{timezone:'America/Denver',dataSourceKind:'physical'},siteId,'Second site');assert.equal(c.url,'https://other.tb');assert.equal(c.assetId,siteId);assert.equal(c.devicePrefix,'');assert.deepEqual(c.mapping,{});assert.equal(c.timezone,'America/Denver');assert.equal(c.simulated,false);assert.equal(c.discoveryMode,'standard');
});
