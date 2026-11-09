import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {localSession} from './local-tb-session.ts';
import {ThingsBoard,Entity} from '../server/thingsboard.ts';
import {settings} from '../server/config.ts';
import {listSites,inspectSite,metadata,validateMetadata,Issue} from '../server/standard.ts';
const apply=process.argv.includes('--apply');
const templatePath=process.argv.find(a=>a.startsWith('--template='))?.slice(11)??'templates/solarops-v1/twynix-solar.json';
const template=JSON.parse(await readFile(templatePath,'utf8'));if(template.schemaVersion!=='1.0.0')throw Error('Unsupported template version');
const targetUrl=process.argv.find(a=>a.startsWith('--url='))?.slice(6)??settings().url;
const session=await localSession(targetUrl),cfg={...settings(),...session.connection,discoveryMode:'legacy' as const},tb=new ThingsBoard(cfg,session.token);
const user=await tb.request<{authority:string}>('/api/auth/user');if(user.authority!=='TENANT_ADMIN')throw Error('Commissioning requires an authorized tenant administrator');
// Resolve every existing device before the first mutation. No devices are created,
// renamed, reprofiled, or deleted. Telemetry APIs are GET-only in this migration.
const all:Entity[]=[];for(let page=0;page<100;page++){const p=await tb.request<{data:Entity[];hasNext:boolean}>(`/api/user/devices?pageSize=100&page=${page}`);all.push(...p.data);if(!p.hasNext)break;if(page===99)throw Error('Too many devices');}
const bindings=await Promise.all(template.devices.map(async(binding:any)=>{
 const matches=all.filter(d=>d.name===binding.name);if(matches.length!==1)throw Error('Expected exactly one existing device: '+binding.name);
 const entity=matches[0],before=await metadata(tb,entity),mapping=template.adapters[binding.adapter];
 if(before.solaropsRole&&before.solaropsRole!==binding.role)throw Error('Conflicting existing role for '+entity.name);
 if(before.equipmentKey&&before.equipmentKey!==binding.equipmentKey)throw Error('Conflicting equipment key for '+entity.name);
 const keys=await tb.keys(entity.id.id);for(const m of Object.values(mapping) as any[])if(!keys.includes(m.key))throw Error('Template key does not exist on '+entity.name+': '+m.key);
 const attrs={solaropsSchemaVersion:'1.0.0',solaropsRole:binding.role,equipmentKey:binding.equipmentKey,dataSourceKind:template.site.dataSourceKind,solaropsIntegrationProfile:template.templateId,solaropsTelemetryMapping:mapping,solaropsStateMapping:{},expectedIntervalMs:1000,staleAfterMs:120000,...(binding.role==='siteController'||binding.role==='gridMeter'?{gridPowerSign:'exportPositive'}:{}),...(binding.role==='inverter'&&template.templateId==='twynix-solar-v1'?{energyCounterKind:'resettable',model:'KACO blueplanet NX3 · simulator'}:{}),...(binding.attributes??{})};
 const issues:Issue[]=[];validateMetadata({...entity,solarops:attrs},issues);if(issues.some(i=>i.severity==='error'))throw Error('Invalid manifest metadata for '+entity.name+': '+JSON.stringify(issues));
 return {binding,entity,before,attrs};
}));
const sites=await listSites(tb),existing=sites.filter(s=>s.metadata.siteKey===template.site.siteKey);if(existing.length>1)throw Error('Duplicate site key');
const end=Date.now()-300000,start=end-600000;
const fingerprint=async()=>Promise.all(bindings.filter(b=>b.binding.role==='inverter').map(async b=>{const mapping=template.adapters[b.binding.adapter],keys=['acPower','lifetimeEnergy'].map(k=>mapping[k]?.key).filter(Boolean);const data=await tb.history(b.entity.id.id,keys,start,end,'NONE',10000);return {id:b.entity.id.id,samples:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),hash:createHash('sha256').update(JSON.stringify(data)).digest('hex')};}));
const historyBefore=await fingerprint();
console.log(JSON.stringify({mode:apply?'apply':'preview',site:template.site.name,existingSiteId:existing[0]?.entity.id.id??null,preserveDeviceIds:bindings.map(b=>({name:b.entity.name,id:b.entity.id.id})),addContains:bindings.length,addFeeds:template.feeds.length,telemetryWrites:0}));
if(!apply)process.exit(0);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');await mkdir('.runtime/migrations',{recursive:true,mode:0o700});
const backup={templateId:template.templateId,siteBefore:existing[0]??null,devices:bindings.map(b=>({entity:b.entity,solaropsAttributesBefore:b.before})),historyWindow:{start,end},historyBefore};
const backupPath=`.runtime/migrations/${stamp}.json`;await writeFile(backupPath,JSON.stringify(backup,null,2),{mode:0o600});
const profiles:Entity[]=[];for(let page=0;page<100;page++){const p=await tb.request<{data:Entity[];hasNext:boolean}>(`/api/assetProfiles?pageSize=100&page=${page}`);profiles.push(...p.data);if(!p.hasNext)break;}
for(const name of template.profiles)if(!profiles.some(p=>p.name===name))profiles.push(await tb.request<Entity>('/api/assetProfile','POST',{name,description:'SolarOps Installation Contract 1.0',default:false}));
const site=existing[0]?.entity??await tb.request<Entity>('/api/asset','POST',{name:template.site.name,type:'SolarOps Site v1',assetProfileId:profiles.find(p=>p.name==='SolarOps Site v1')!.id});
const saveAttrs=(entity:Entity,attrs:unknown)=>tb.request(`/api/plugins/telemetry/${entity.id.entityType}/${entity.id.id}/attributes/SERVER_SCOPE`,'POST',attrs);
await saveAttrs(site,{solaropsSchemaVersion:'1.0.0',solaropsRole:'site',siteKey:template.site.siteKey,timezone:template.site.timezone,dataSourceKind:template.site.dataSourceKind,solaropsIntegrationProfile:template.templateId});
for(const b of bindings){await saveAttrs(b.entity,b.attrs);await tb.request('/api/v2/relation','POST',{from:site.id,to:b.entity.id,type:'Contains',typeGroup:'COMMON'});}
for(const [from,to] of template.feeds){const a=bindings.find(b=>b.binding.equipmentKey===from),b=bindings.find(b=>b.binding.equipmentKey===to);if(!a||!b)throw Error('Invalid Feeds binding');await tb.request('/api/v2/relation','POST',{from:a.entity.id,to:b.entity.id,type:'Feeds',typeGroup:'COMMON'});}
const report=await inspectSite(tb,site.id.id),historyAfter=await fingerprint();
if(JSON.stringify(historyBefore)!==JSON.stringify(historyAfter))throw Error('Historical readback differs; inspect backup before enabling site');
await writeFile(backupPath,JSON.stringify({...backup,siteAfter:site,historyAfter,verified:report.compatible,issues:report.issues},null,2),{mode:0o600});
if(!report.compatible)throw Error('Commissioning validation failed: '+JSON.stringify(report.issues));
// Select the installation locally; prefix matching is disabled explicitly.
if(cfg.url===settings().url){let env=await readFile('.env','utf8');for(const [key,value] of Object.entries({TB_PLANT_ASSET_ID:site.id.id,TB_DISCOVERY_MODE:'standard'})){const line=`${key}='${value}'`;env=new RegExp('^'+key+'=.*$','m').test(env)?env.replace(new RegExp('^'+key+'=.*$','m'),line):env+'\n'+line+'\n';}await writeFile('.env',env,{mode:0o600});}
console.log(JSON.stringify({siteId:site.id.id,compatible:report.compatible,entities:report.entities.length,capabilities:report.capabilities,historyPreserved:true,deviceIdsPreserved:true,backup:backupPath,issues:report.issues}));
