import {configurationIssues,stringIssues,topologyIssues} from '../src/app/domain/inverter.ts';
import type {InverterConfiguration,StringConfiguration} from '../src/app/domain/inverter.ts';
import type {ThingsBoard,Entity,Discovery} from './thingsboard.ts';
import type {Mapping} from './config.ts';
import type {State} from '../src/app/domain/solar.ts';
import {convert} from '../src/app/domain/solar.ts';
export const schemaVersion='1.0.0';
export const roles=['site','zone','pvArray','pvString','inverter','gridMeter','productionMeter','weatherStation','gateway','siteController','battery'] as const;
export interface Metadata {
 solaropsSchemaVersion:string;solaropsRole:string;solaropsMeasurementDeviceId?:string;solaropsArchived?:boolean;siteKey?:string;equipmentKey?:string;timezone?:string;dataSourceKind?:string;
 solaropsIntegrationProfile?:string;solaropsTelemetryMapping?:Record<string,Mapping>;solaropsStateMapping?:Record<string,State>;
 solaropsInverterConfiguration?:InverterConfiguration;solaropsStringConfiguration?:StringConfiguration;expectedIntervalMs?:number;staleAfterMs?:number;gridPowerSign?:string;energyCounterKind?:string;model?:string;
}
export interface Issue {severity:'error'|'warning';code:string;entity:string;message:string}
export interface Compatibility {site:Entity;metadata:Metadata;entities:Entity[];relations:{from:Entity['id'];to:Entity['id'];type:string}[];issues:Issue[];compatible:boolean;capabilities:{livePower:boolean;energy:boolean;grid:boolean;weather:boolean}}
export const metadataKeys=['solaropsSchemaVersion','solaropsRole','siteKey','equipmentKey','timezone','dataSourceKind','solaropsIntegrationProfile','solaropsTelemetryMapping','solaropsStateMapping','expectedIntervalMs','staleAfterMs','gridPowerSign','energyCounterKind','model','solaropsInverterConfiguration','solaropsStringConfiguration','solaropsMeasurementDeviceId','solaropsArchived'];
export async function metadata(tb:ThingsBoard,entity:Entity):Promise<Metadata>{
 const values=await tb.request<{key:string;value:unknown}[]>(`/api/plugins/telemetry/${entity.id.entityType}/${encodeURIComponent(entity.id.id)}/values/attributes/SERVER_SCOPE?keys=${metadataKeys.join(',')}`);
 return Object.fromEntries(values.map(p=>[p.key,p.value])) as unknown as Metadata;
}
export async function listSites(tb:ThingsBoard){
 const sites:{entity:Entity;metadata:Metadata}[]=[];
 for(let page=0;page<100;page++){
  const result=await tb.request<{data:Entity[];hasNext:boolean}>(`/api/user/assets?pageSize=100&page=${page}&sortProperty=name&sortOrder=ASC`);
  for(let i=0;i<result.data.length;i+=8){const group=await Promise.all(result.data.slice(i,i+8).map(async entity=>({entity,metadata:await metadata(tb,entity)})));sites.push(...group.filter(s=>s.metadata.solaropsRole==='site'&&!s.metadata.solaropsArchived));}
  if(!result.hasNext)return sites;
 }
 throw Error('Asset discovery exceeds supported size');
}
const units:Record<string,string>={acPower:'kW',dcPower:'kW',dcVoltage:'V',dcCurrent:'A',lifetimeEnergy:'kWh',cabinetTemperature:'°C',acVoltage:'V',acCurrent:'A',frequency:'Hz',ratedAcPower:'kW',energy:'kWh',gridExport:'kW',irradiance:'W/m²',airTemperature:'°C',cloudCover:'%'};
export function validateMetadata(entity:Entity,issues:Issue[]){
 const m=entity.solarops!,add=(code:string,message:string,severity:Issue['severity']='error')=>issues.push({code,message,severity,entity:entity.name});
 if(m.solaropsSchemaVersion!==schemaVersion)add('schema','Unsupported or missing SolarOps schema version');
 if(!roles.includes(m.solaropsRole as any))add('role','Unknown or missing equipment role');
 if(m.solaropsRole!=='site'&&!m.equipmentKey&&m.solaropsRole!=='zone')add('identity','Stable equipment key is required');
 if(m.solaropsRole==='site'){
  if(!m.siteKey)add('site-key','Site key is required');
  try{if(!m.timezone)throw Error();new Intl.DateTimeFormat('en',{timeZone:m.timezone});}catch{add('timezone','A valid site timezone is required');}
  if(!['physical','simulation'].includes(m.dataSourceKind??''))add('provenance','Declare physical or simulation data');
 }
 if(m.expectedIntervalMs!==undefined&&(!Number.isFinite(m.expectedIntervalMs)||m.expectedIntervalMs<100))add('interval','Reporting interval must be at least 100 ms');
 if(m.staleAfterMs!==undefined&&(!Number.isFinite(m.staleAfterMs)||m.staleAfterMs<1000))add('freshness','Freshness threshold must be at least 1000 ms');
 for(const [field,map] of Object.entries(m.solaropsTelemetryMapping??{})){
  if(!map||typeof map.key!=='string'||!map.key||typeof map.unit!=='string'){add('mapping',`Invalid telemetry mapping: ${field}`);continue;}
  if(units[field])try{convert(1,map.unit,units[field] as any);}catch{add('unit',`Unsupported unit for ${field}: ${map.unit}`);}
 }
 if(Object.values(m.solaropsStateMapping??{}).some(s=>!['mppt','sleep','standby','startup','throttled','fault','unknown','running','stopped'].includes(s)))add('state','Invalid operating state mapping');
 if(m.solaropsInverterConfiguration){if(m.solaropsRole!=='inverter')add('inverter-config','Only inverters can define MPPTs');for(const message of configurationIssues(m.solaropsInverterConfiguration))add('inverter-config',message);}
 if(m.solaropsStringConfiguration&&m.solaropsRole!=='pvString')add('string-role','Only PV strings can define module groups');
 if(m.solaropsRole==='pvString'){if(entity.id.entityType!=='ASSET')add('string-type','PV strings must be assets');for(const message of stringIssues(m.solaropsStringConfiguration))add('string-config',message);}
 if(m.solaropsRole==='inverter'){
  if(entity.id.entityType!=='DEVICE')add('inverter-type','Inverters must reference existing telemetry devices');
  if(!m.solaropsTelemetryMapping?.['acPower'])add('ac-power','Inverter AC power mapping is required');
  if(!m.solaropsTelemetryMapping?.['lifetimeEnergy'])add('energy','Energy reporting is unavailable without an energy counter','warning');
 }
}
export async function inspectSite(tb:ThingsBoard,assetId:string,checkTelemetry=true):Promise<Compatibility>{
 const site=await tb.request<Entity>(`/api/asset/${encodeURIComponent(assetId)}`);site.solarops=await metadata(tb,site);
 const entities:Entity[]=[],relations:Compatibility['relations']=[],issues:Issue[]=[];
 const seen=new Set([assetId]),equipment=new Set<string>();let queue:{entity:Entity;depth:number}[]=[{entity:site,depth:0}];
 while(queue.length){
  const {entity,depth}=queue.shift()!;validateMetadata(entity,issues);
  if(entity.solarops?.equipmentKey){if(equipment.has(entity.solarops.equipmentKey))issues.push({severity:'error',code:'duplicate-key',entity:entity.name,message:'Duplicate equipment key in site'});equipment.add(entity.solarops.equipmentKey);}
  const links=await tb.request<{from:Entity['id'];to:Entity['id'];type:string}[]>(`/api/relations/info/from/${entity.id.entityType}/${entity.id.id}?relationTypeGroup=COMMON`);
  relations.push(...links);
  if(entity.id.entityType!=='ASSET')continue;
  for(const link of links.filter(r=>r.type==='Contains'&&['ASSET','DEVICE'].includes(r.to.entityType))){
   if(seen.has(link.to.id)){issues.push({severity:'error',code:'hierarchy',entity:entity.name,message:'Contains hierarchy has a cycle or multiple parents'});continue;}
   if(depth>=12||seen.size>=2000)throw Error('Site hierarchy exceeds bounded size');seen.add(link.to.id);
   const child=await tb.request<Entity>(`/api/${link.to.entityType.toLowerCase()}/${link.to.id}`);child.solarops=await metadata(tb,child);if(child.solarops.solaropsRole==='site')issues.push({severity:'error',code:'nested-site',entity:child.name,message:'A site cannot contain another site'});entities.push(child);queue.push({entity:child,depth:depth+1});
  }
 }
 if(site.solarops.solaropsRole!=='site')issues.push({severity:'error',code:'site-role',entity:site.name,message:'Selected asset is not a SolarOps site'});
 for(const link of relations.filter(r=>r.type==='Feeds'))if(!seen.has(link.to.id)||!seen.has(link.from.id))issues.push({severity:'error',code:'electrical-boundary',entity:site.name,message:'Feeds relation crosses the selected site boundary'});
 const bound=new Set(entities.map(e=>e.solarops?.solaropsMeasurementDeviceId).filter(Boolean));
 for(const e of entities.filter(e=>e.solarops?.solaropsMeasurementDeviceId)){const source=entities.find(d=>d.id.id===e.solarops!.solaropsMeasurementDeviceId);if(e.id.entityType!=='ASSET'||e.solarops!.solaropsRole!=='pvArray'||!source||source.id.entityType!=='DEVICE'||source.solarops?.solaropsRole!=='pvArray'||!relations.some(r=>r.type==='Contains'&&r.from.id===e.id.id&&r.to.id===source.id.id)||!relations.some(r=>r.type==='MeasuredBy'&&r.from.id===e.id.id&&r.to.id===source.id.id))issues.push({severity:'error',code:'measurement-binding',entity:e.name,message:'An array measurement device must be contained by and bound to its physical PV array'});}
 if(entities.filter(e=>e.solarops?.solaropsMeasurementDeviceId).length!==bound.size)issues.push({severity:'error',code:'measurement-binding',entity:site.name,message:'Each array measurement device can serve only one physical array'});
 const inverters=entities.filter(e=>e.solarops?.solaropsRole==='inverter');
 if(!inverters.length)issues.push({severity:'error',code:'inverters',entity:site.name,message:'No inverter devices found under this site'});
 for(const role of ['siteController','gridMeter'])if(entities.filter(e=>e.solarops?.solaropsRole===role).length>1)issues.push({severity:'error',code:'ambiguous-role',entity:site.name,message:`More than one ${role}; select a single source in v1`});
 const controller=entities.find(e=>e.solarops?.solaropsRole==='siteController');
 if(controller?.solarops?.solaropsTelemetryMapping?.['gridExport']&&controller.solarops.gridPowerSign!=='exportPositive')issues.push({severity:'error',code:'grid-sign',entity:controller.name,message:'v1 requires grid power to be export-positive'});
 const topology=[site,...entities].map(e=>({id:e.id.id,entityType:e.id.entityType as 'ASSET'|'DEVICE',name:e.name,label:e.label??'',role:e.solarops!.solaropsRole,equipmentKey:e.solarops!.equipmentKey??'',parentId:relations.find(r=>r.type==='Contains'&&r.to.id===e.id.id)?.from.id??null,feedsTo:relations.find(r=>r.type==='Feeds'&&r.from.id===e.id.id)?.to.id??null,mapping:e.solarops!.solaropsTelemetryMapping??{},inverterConfig:e.solarops!.solaropsInverterConfiguration,stringConfig:e.solarops!.solaropsStringConfiguration}));
 for(const issue of topologyIssues(topology))issues.push({...issue,code:'dc-topology'});
 if(checkTelemetry){
  for(const e of entities.filter(e=>e.id.entityType==='DEVICE'&&e.solarops?.solaropsRole==='inverter')){
   const map=e.solarops!.solaropsTelemetryMapping??{},keys=await tb.keys(e.id.id),ac=map['acPower'];
   if(ac&&!keys.includes(ac.key))issues.push({severity:'error',code:'missing-key',entity:e.name,message:`AC power telemetry key not found: ${ac.key}`});
   const latest=await tb.latest(e.id.id,map),p=ac?latest[ac.key]?.at(-1):undefined;
   if(!p||!Number.isFinite(p.ts)||p.value===null||p.value===''||typeof p.value==='boolean'||!Number.isFinite(Number(p.value)))issues.push({severity:'error',code:'sample',entity:e.name,message:'AC power needs a numeric measurement with a timestamp'});
   else if(Date.now()-p.ts>(e.solarops?.staleAfterMs??120000))issues.push({severity:'warning',code:'stale',entity:e.name,message:'Source telemetry is stale; live monitoring will resume when publishing resumes'});
   for(const [field,m] of Object.entries(map))if(field!=='acPower'&&!keys.includes(m.key))issues.push({severity:'warning',code:'optional-key',entity:e.name,message:`Optional telemetry unavailable: ${field}`});
  }
 }
 return {site,metadata:site.solarops,entities,relations,issues,compatible:!issues.some(i=>i.severity==='error'),capabilities:{livePower:!!inverters.length,energy:inverters.length>0&&inverters.every(e=>!!e.solarops?.solaropsTelemetryMapping?.['lifetimeEnergy']),grid:!!controller?.solarops?.solaropsTelemetryMapping?.['gridExport'],weather:!!controller?.solarops?.solaropsTelemetryMapping?.['irradiance']}};
}
export async function discoverStandard(tb:ThingsBoard):Promise<Discovery>{
 const report=await inspectSite(tb,tb.config.assetId,false);
 if(!report.compatible)throw Error('SolarOps installation is incompatible: '+report.issues.filter(i=>i.severity==='error').map(i=>i.message).join('; '));
 const all=report.entities.filter(e=>e.id.entityType==='DEVICE'),role=(r:string)=>report.entities.filter(e=>e.solarops?.solaropsRole===r);
 return {relations:report.relations,asset:report.site,devices:role('inverter'),arrays:role('pvArray').filter(e=>!report.entities.some(a=>a.solarops?.solaropsMeasurementDeviceId===e.id.id)),meter:role('gridMeter')[0],controller:role('siteController')[0],all};
}
