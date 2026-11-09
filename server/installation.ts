import {operatingModes} from '../src/app/domain/solar.ts';
import {remapHmi} from '../src/app/domain/hmi.ts';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ThingsBoard,Entity,ApiError} from './thingsboard.ts';
import {administrator,canonical,inventory,memberships} from './commission.ts';
import {inspectSite,metadata,listSites,validateMetadata,Metadata,Issue,roles,schemaVersion} from './standard.ts';
import type {InstallationDraft,InstallationNode,InstallationReview,InstallationChange} from '../src/app/domain/installation.ts';
import {topologyIssues,configurationIssues} from '../src/app/domain/inverter.ts';
import {validLayout,pruneGroups} from '../src/app/domain/diagram.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Link={from:Entity['id'];to:Entity['id'];type:string};
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const ref=(n:InstallationNode)=>({id:n.id,entityType:n.entityType});
const linkKey=(r:Link)=>r.from.entityType+':'+r.from.id+'|'+r.type+'|'+r.to.entityType+':'+r.to.id;
export async function installationSnapshot(tb:ThingsBoard,assetId:string){
 if(!uuid.test(assetId))throw new ApiError(400,'Choose an installation');
 const report=await inspectSite(tb,assetId,false),entities=[report.site,...report.entities];
 if(report.metadata.solaropsRole!=='site'||report.metadata.solaropsSchemaVersion!==schemaVersion)throw new ApiError(422,'This installation does not use a supported SolarOps site schema');
 const ids=new Set(entities.map(e=>e.id.id));
 const links=report.relations.filter(r=>['Contains','Feeds','MeasuredBy'].includes(r.type));
 const nodes:InstallationNode[]=entities.map(e=>({id:e.id.id,entityType:e.id.entityType as any,name:e.name,label:e.label??'',role:e.solarops!.solaropsRole,equipmentKey:e.solarops!.equipmentKey??e.solarops!.siteKey??'',parentId:e.id.id===assetId?null:links.find(r=>r.type==='Contains'&&r.to.id===e.id.id&&ids.has(r.from.id))?.from.id??assetId,mapping:e.solarops!.solaropsTelemetryMapping??{},...(e.solarops!.solaropsStateMapping?{stateMapping:e.solarops!.solaropsStateMapping}:{}),...(e.solarops!.solaropsMeasurementDeviceId?{measurementDeviceId:e.solarops!.solaropsMeasurementDeviceId}:{}),gridSignConfirmed:e.solarops!.gridPowerSign==='exportPositive',...(e.solarops!.solaropsInverterConfiguration?{inverterConfig:e.solarops!.solaropsInverterConfiguration}:{}),...(e.solarops!.solaropsStringConfiguration?{stringConfig:e.solarops!.solaropsStringConfiguration}:{}),feedsTo:['pvArray','pvString'].includes(e.solarops!.solaropsRole)?links.find(r=>r.type==='Feeds'&&r.from.id===e.id.id)?.to.id??null:null}));
 const stored=await tb.request<{key:string;value:unknown}[]>(`/api/plugins/telemetry/ASSET/${assetId}/values/attributes/SERVER_SCOPE?keys=solaropsDiagramLayout`);
 const rawLayout=stored.find(a=>a.key==='solaropsDiagramLayout')?.value;
 const layout=validLayout(rawLayout,ids)?rawLayout:undefined;
 const baseline=hash({layout:rawLayout??null,entities:entities.map(e=>({id:e.id,name:e.name,label:e.label??'',version:(e as any).version,profile:(e as any).assetProfileId??(e as any).deviceProfileId,deviceData:(e as any).deviceData,additionalInfo:(e as any).additionalInfo,metadata:e.solarops})).sort((a,b)=>a.id.id.localeCompare(b.id.id)),links:[...links].sort((a,b)=>linkKey(a).localeCompare(linkKey(b)))});
 return {report,entities,links,draft:{assetId,baseline,timezone:report.metadata.timezone!,nodes,...(layout?{layout}:{})} satisfies InstallationDraft};
}
export async function installationContext(tb:ThingsBoard,assetId:string){
 const snapshot=await installationSnapshot(tb,assetId),user=await tb.request<{authority:string}>('/api/auth/user'),canEdit=user.authority==='TENANT_ADMIN';
 return {url:tb.config.url,canEdit,siteName:snapshot.report.site.label||snapshot.report.site.name,draft:snapshot.draft,sites:(await listSites(tb)).map(s=>({id:s.entity.id.id,name:s.entity.label||s.entity.name})),devices:canEdit?(await inventory(tb,'devices')).map(d=>({id:d.id,name:d.name,label:d.label})):[],issues:snapshot.report.issues};
}
interface InstallationPlan {draft:InstallationDraft;review:InstallationReview;snapshot:Awaited<ReturnType<typeof installationSnapshot>>;entities:Map<string,Entity>;attrs:Map<string,Metadata>;adds:Link[];removes:Link[];profiles:Entity[]}
function checkDraft(value:unknown):InstallationDraft{
 const d=structuredClone(value) as InstallationDraft;
 if(!d||!uuid.test(d.assetId??'')||typeof d.baseline!=='string'||!Array.isArray(d.nodes)||!d.nodes.length||d.nodes.length>128)throw new ApiError(400,'The editor supports between 1 and 128 hierarchy nodes');
 try{if(typeof d.timezone!=='string'||d.timezone.length>80)throw Error();new Intl.DateTimeFormat('en',{timeZone:d.timezone});}catch{throw new ApiError(400,'Choose a valid IANA timezone');}
 const ids=new Set<string>();
 for(const n of d.nodes){
  if(!n||typeof n.id!=='string'||(!uuid.test(n.id)&&!/^new_[0-9a-f-]{36}$/i.test(n.id))||ids.has(n.id)||!['ASSET','DEVICE'].includes(n.entityType))throw new ApiError(400,'Each hierarchy node needs a unique valid identifier');ids.add(n.id);
  if(typeof n.name!=='string'||!n.name.trim()||n.name.length>120||typeof n.label!=='string'||n.label.length>120||!roles.includes(n.role as any)||typeof n.equipmentKey!=='string'||!/^[-a-z0-9]{1,80}$/.test(n.equipmentKey))throw new ApiError(400,'Check the name, label, role and equipment key');
  if(!n.mapping||typeof n.mapping!=='object'||Array.isArray(n.mapping)||Object.keys(n.mapping).length>40)throw new ApiError(400,'Invalid telemetry mapping');
  for(const [field,m] of Object.entries(n.mapping))if(!/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(field)||!m||typeof m.key!=='string'||!m.key.trim()||m.key.length>128||typeof m.unit!=='string'||m.unit.length>16)throw new ApiError(400,'Check the telemetry key and unit');
  if(n.stateMapping!==undefined&&(!n.stateMapping||typeof n.stateMapping!=='object'||Array.isArray(n.stateMapping)||Object.keys(n.stateMapping).length>64||Object.entries(n.stateMapping).some(([key,mode])=>!key.trim()||key.length>64||!operatingModes.includes(mode))))throw new ApiError(400,'Invalid inverter state mapping');
  if(n.measurementDeviceId!==undefined&&(!uuid.test(n.measurementDeviceId)||n.entityType!=='ASSET'||n.role!=='pvArray'))throw new ApiError(400,'Only physical array assets can bind measurement devices');
  if(n.parentId!==null&&typeof n.parentId!=='string'||n.feedsTo!==null&&typeof n.feedsTo!=='string')throw new ApiError(400,'Invalid hierarchy relationship');
 }
 if(d.layout!==undefined&&!validLayout(d.layout,ids))throw new ApiError(400,'Invalid diagram layout: use finite positions inside the drawing area');
 const root=d.nodes.find(n=>n.id===d.assetId);if(!root||root.entityType!=='ASSET'||root.role!=='site'||root.parentId!==null||d.nodes.filter(n=>n.role==='site').length!==1)throw new ApiError(422,'Keep the site asset as the hierarchy root');
 for(const n of d.nodes){if(n.id!==d.assetId){const parent=d.nodes.find(p=>p.id===n.parentId);if(!parent||parent.entityType!=='ASSET')throw new ApiError(422,'Each node must have an asset parent inside this installation');}
  const seen=new Set<string>();let cursor:InstallationNode|undefined=n;while(cursor){if(seen.has(cursor.id)||seen.size>12)throw new ApiError(422,'The hierarchy contains a cycle or exceeds 12 levels');seen.add(cursor.id);cursor=cursor.parentId?d.nodes.find(p=>p.id===cursor!.parentId):undefined;}
  if(n.feedsTo&&(!['pvArray','pvString'].includes(n.role)||!d.nodes.some(t=>t.id===n.feedsTo&&t.role==='inverter')))throw new ApiError(422,'PV arrays must feed an inverter inside this installation');
 }
 const bindings=new Set<string>();for(const n of d.nodes.filter(n=>n.measurementDeviceId)){const source=d.nodes.find(s=>s.id===n.measurementDeviceId);if(!source||source.entityType!=='DEVICE'||source.role!=='pvArray'||source.parentId!==n.id||source.feedsTo||bindings.has(source.id))throw new ApiError(422,'Bind each measurement device to one physical array in this installation');bindings.add(source.id);}
 if(!d.nodes.some(n=>n.role==='inverter'&&n.entityType==='DEVICE'))throw new ApiError(422,'Keep at least one inverter in the installation');
 if(new Set(d.nodes.filter(n=>n.id!==d.assetId).map(n=>n.equipmentKey)).size!==d.nodes.length-1)throw new ApiError(422,'Equipment keys must be unique');
 for(const role of ['gridMeter','siteController'])if(d.nodes.filter(n=>n.role===role).length>1)throw new ApiError(422,'v1 supports only one '+role+' per installation');
 return d;
}
export async function prepareInstallation(tb:ThingsBoard,input:unknown):Promise<InstallationPlan>{
 await administrator(tb);const draft=checkDraft(input);for(const array of draft.nodes.filter(n=>n.measurementDeviceId)){draft.nodes.find(n=>n.id===array.measurementDeviceId)!.mapping=structuredClone(array.mapping);}const snapshot=await installationSnapshot(tb,draft.assetId);
 if(draft.baseline!==snapshot.draft.baseline)throw new ApiError(409,'ThingsBoard changed since loading. Reload the hierarchy before reviewing changes.');
 if(!draft.layout&&snapshot.draft.layout)draft.layout={...snapshot.draft.layout,version:1,...(snapshot.draft.layout.groups?{groups:pruneGroups(snapshot.draft.layout.groups,new Set(draft.nodes.map(n=>n.id)))}:{}),positions:Object.fromEntries(Object.entries(snapshot.draft.layout.positions).filter(([id])=>draft.nodes.some(n=>n.id===id)))};
 const issues:InstallationReview['issues']=topologyIssues(draft.nodes),changes:InstallationChange[]=[],entities=new Map<string,Entity>(),attrs=new Map<string,Metadata>(),old=new Map(snapshot.entities.map(e=>[e.id.id,e]));
 const add=(entity:string,message:string,severity:'error'|'warning'='error')=>issues.push({entity,message,severity});
 const sourceKeys=new Map<string,string[]>();
 const validateDcSource=async(sourceId:string,mapping:InstallationNode['mapping'],name:string)=>{if(!Object.keys(mapping).length)return;let keys=sourceKeys.get(sourceId);if(!keys){keys=await tb.keys(sourceId);sourceKeys.set(sourceId,keys);}const values=await tb.latest(sourceId,Object.fromEntries(Object.entries(mapping).filter(([,m])=>keys!.includes(m.key))));for(const m of Object.values(mapping)){if(!keys.includes(m.key)){add(name,'DC telemetry key does not exist on its inverter: '+m.key);continue;}const sample=values[m.key]?.at(-1);if(!sample){add(name,'DC measurement is unavailable: '+m.key,'warning');continue;}if(!Number.isFinite(sample.ts)||sample.value===null||sample.value===''||typeof sample.value==='boolean'||!Number.isFinite(Number(sample.value)))add(name,'DC telemetry must be numeric with a timestamp: '+m.key);}};
 const assetNames=new Map((await inventory(tb,'assets')).map(e=>[e.name,e.id.id])),newNames=new Set<string>();
 const root=snapshot.report.site;
 for(const n of draft.nodes){
  let entity=old.get(n.id);const isNew=n.id.startsWith('new_');
  if(isNew){if(n.entityType!=='ASSET'||!['zone','pvArray','pvString'].includes(n.role))throw new ApiError(422,'New hierarchy assets must be zones, PV arrays or PV strings');entity={id:ref(n),name:n.name,ownerId:root.ownerId};changes.push({kind:'createAsset',target:n.id,description:n.name});}
  else if(!entity){if(n.entityType!=='DEVICE')throw new ApiError(422,'Existing external assets cannot be adopted by this editor');entity=await tb.request<Entity>('/api/device/'+n.id);entity.solarops=await metadata(tb,entity);}
  if(!isNew&&entity!.id.entityType!==n.entityType)throw new ApiError(422,'Entity types cannot be changed');
  if(!isNew&&entity!.id.entityType!==n.entityType)throw new ApiError(422,'Entity types cannot be changed');
  entities.set(n.id,entity!);const before=entity!.solarops??{} as Metadata;
  if(before.solaropsSchemaVersion&&before.solaropsSchemaVersion!==schemaVersion)add(n.name,'Unsupported SolarOps schema version; existing metadata will not be overwritten');
  if(before.equipmentKey&&before.equipmentKey!==n.equipmentKey||n.id===draft.assetId&&n.equipmentKey!==before.siteKey)add(n.name,'Keep the existing stable equipment key');
  if(n.entityType==='DEVICE'&&n.name!==entity!.name)add(n.name,'Device names are retained; use the display label instead');
  if(entity!.ownerId&&root.ownerId&&entity!.ownerId.id!==root.ownerId.id)add(n.name,'Selected equipment has a different ThingsBoard owner');
  if(!old.has(n.id)&&!isNew){if([...(await memberships(tb,entity!))].some(id=>id!==draft.assetId))add(n.name,'This device belongs to another SolarOps installation. It will not be moved.');if(before.dataSourceKind&&before.dataSourceKind!==snapshot.report.metadata.dataSourceKind)add(n.name,'Keep the existing physical or simulation provenance');}
  if(n.entityType==='ASSET'){
   if(assetNames.has(n.name)&&assetNames.get(n.name)!==n.id||newNames.has(n.name))add(n.name,'Another asset uses this name');newNames.add(n.name);
   if(!isNew&&(n.name!==entity!.name||n.label!==(entity!.label??'')))changes.push({kind:'updateAsset',target:n.id,description:n.name,before:{name:entity!.name,label:entity!.label??''},after:{name:n.name,label:n.label}});
  }else if(n.label!==(entity!.label??''))changes.push({kind:'updateDevice',target:n.id,description:entity!.name,before:{label:entity!.label??''},after:{label:n.label}});
  const after:Metadata={...before,...(n.stateMapping!==undefined?{solaropsStateMapping:n.stateMapping}:{}),solaropsSchemaVersion:schemaVersion,solaropsRole:n.role,...(n.id===draft.assetId?{timezone:draft.timezone}:{equipmentKey:n.equipmentKey,dataSourceKind:snapshot.report.metadata.dataSourceKind}),...(n.role==='pvArray'&&n.entityType==='ASSET'?{...(n.measurementDeviceId||before.solaropsMeasurementDeviceId?{solaropsMeasurementDeviceId:n.measurementDeviceId??''}:{}),solaropsTelemetryMapping:n.mapping}:{}),...(['DEVICE'].includes(n.entityType)||n.role==='pvString'?{solaropsTelemetryMapping:n.mapping}:{}),...(n.inverterConfig?{solaropsInverterConfiguration:n.inverterConfig,energyCounterKind:n.inverterConfig.energyCounterKind,...(n.inverterConfig.model?{model:n.inverterConfig.model}:{})}:{}),...(n.stringConfig?{solaropsStringConfiguration:n.stringConfig}:{}),...(n.mapping['gridExport']&&n.gridSignConfirmed===true?{gridPowerSign:'exportPositive'}:{})};
  if(isNew&&n.entityType==='ASSET'&&n.role!=='pvString'&&!n.measurementDeviceId&&Object.keys(n.mapping).length)add(n.name,'New passive assets do not publish device telemetry');
  if(n.mapping['gridExport']&&n.gridSignConfirmed!==true)add(n.name,'Grid telemetry must declare an export-positive sign convention');
  const validation:Issue[]=[];validateMetadata({...entity!,solarops:after},validation);for(const i of validation)add(i.entity,i.message,i.severity);
  if(n.entityType==='DEVICE'){
   const keys=await tb.keys(n.id);for(const [field,m] of Object.entries(n.mapping))if(!keys.includes(m.key))add(n.name,'Telemetry key does not exist: '+m.key,field==='acPower'?'error':'warning');
   if(n.role==='inverter'&&n.mapping['acPower']){const values=await tb.latest(n.id,n.mapping),p=values[n.mapping.acPower.key]?.at(-1);if(!p||!Number.isFinite(p.ts)||p.value===null||p.value===''||typeof p.value==='boolean'||!Number.isFinite(Number(p.value)))add(n.name,'AC power needs a numeric measurement with a timestamp');else if(Date.now()-p.ts>(before.staleAfterMs??120000))add(n.name,'Source telemetry is stale; monitoring resumes when publishing resumes','warning');}
  }
  if(n.measurementDeviceId)await validateDcSource(n.measurementDeviceId,n.mapping,n.name);
  if(n.role==='pvString'&&n.feedsTo){const target=draft.nodes.find(t=>t.id===n.feedsTo);if(target)await validateDcSource(target.id,n.mapping,n.name);}
 if(n.inverterConfig&&!configurationIssues(n.inverterConfig).length){for(const m of n.inverterConfig.mppts)await validateDcSource(n.id,m.mapping,n.name+' / '+m.name);}
 const diff=Object.fromEntries(Object.entries(after).filter(([key,value])=>canonical((before as any)[key])!==canonical(value)));if(Object.keys(diff).length)changes.push({kind:'metadata',target:n.id,description:n.name,before:Object.fromEntries(Object.keys(diff).map(k=>[k,(before as any)[k]??null])),after:diff});attrs.set(n.id,after);
 }
 const retained=new Set(draft.nodes.map(n=>n.id)),desired:Link[]=draft.nodes.filter(n=>n.parentId).map(n=>({from:ref(draft.nodes.find(p=>p.id===n.parentId)!),to:ref(n),type:'Contains'}));
 for(const n of draft.nodes.filter(n=>n.measurementDeviceId))desired.push({from:ref(n),to:ref(draft.nodes.find(s=>s.id===n.measurementDeviceId)!),type:'MeasuredBy'});
 for(const n of draft.nodes){if(['pvArray','pvString'].includes(n.role)&&n.feedsTo){desired.push({from:ref(n),to:ref(draft.nodes.find(t=>t.id===n.feedsTo)!),type:'Feeds'});const original=snapshot.draft.nodes.find(v=>v.id===n.id);if(original?.feedsTo===n.feedsTo)desired.push(...snapshot.links.filter(r=>r.type==='Feeds'&&r.from.id===n.id&&retained.has(r.to.id)&&draft.nodes.find(t=>t.id===r.to.id)?.role==='inverter'));}else if(!['pvArray','pvString'].includes(n.role)&&!['pvArray','pvString'].includes(snapshot.draft.nodes.find(v=>v.id===n.id)?.role??''))desired.push(...snapshot.links.filter(r=>r.type==='Feeds'&&r.from.id===n.id&&retained.has(r.to.id)));}
 const wanted=new Map(desired.map(r=>[linkKey(r),r])),previous=new Map(snapshot.links.map(r=>[linkKey(r),r]));
 const adds=[...wanted].filter(([key])=>!previous.has(key)).map(([,r])=>r);
 // Detached groups keep their internal graph; only links involving retained
 // nodes are edited. Entity records and telemetry are never deleted.
 const removes=snapshot.links.filter(r=>!wanted.has(linkKey(r))&&(retained.has(r.from.id)||retained.has(r.to.id)));
 const label=(id:string)=>draft.nodes.find(n=>n.id===id)?.label||draft.nodes.find(n=>n.id===id)?.name||old.get(id)?.label||old.get(id)?.name||id;
 for(const r of adds)changes.push({kind:'addRelation',target:label(r.from.id)+' → '+label(r.to.id),description:r.type,after:r});for(const r of removes)changes.push({kind:'removeRelation',target:label(r.from.id)+' → '+label(r.to.id),description:r.type,before:r});
 const profiles:Entity[]=[];for(let page=0;page<20;page++){const result=await tb.request<{data:Entity[];hasNext:boolean}>(`/api/assetProfiles?pageSize=100&page=${page}`);profiles.push(...result.data);if(!result.hasNext)break;if(page===19)throw new ApiError(422,'Too many asset profiles');}
 for(const name of [...new Set(draft.nodes.filter(n=>n.id.startsWith('new_')).map(n=>n.role==='zone'?'SolarOps Zone v1':n.role==='pvString'?'SolarOps PV String v1':'SolarOps PV Array v1'))])if(!profiles.some(p=>p.name===name))changes.push({kind:'profile',target:name,description:name});
 if(draft.layout&&canonical(draft.layout)!==canonical(snapshot.draft.layout))changes.push({kind:'layout',target:draft.assetId,description:'Diagram layout',before:snapshot.draft.layout??null,after:draft.layout});
 const digest=hash({draft,changes});return {draft,snapshot,entities,attrs,adds,removes,profiles,review:{id:randomUUID(),digest,expiresAt:Date.now()+900000,canSave:!issues.some(i=>i.severity==='error'),issues,changes,counts:{assets:draft.nodes.filter(n=>n.id.startsWith('new_')).length,devicesAdded:draft.nodes.filter(n=>n.entityType==='DEVICE'&&!old.has(n.id)).length,updates:changes.filter(c=>['metadata','updateAsset','updateDevice'].includes(c.kind)).length,linksAdded:adds.length,linksRemoved:removes.length}}};
}
function updateBody(entity:Entity,node:InstallationNode){
 const fields=entity.id.entityType==='DEVICE'?['id','version','name','type','deviceProfileId','deviceData','additionalInfo','externalId','firmwareId','softwareId']:['id','version','name','type','assetProfileId','additionalInfo','externalId'];
 return {...Object.fromEntries(fields.filter(k=>(entity as any)[k]!==undefined).map(k=>[k,(entity as any)[k]])),name:node.entityType==='ASSET'?node.name:entity.name,label:node.label};
}
export async function saveInstallation(tb:ThingsBoard,p:InstallationPlan,jobId:string,directory=fileURLToPath(new URL('../.runtime/management/',import.meta.url))){
 if(!p.review.canSave)throw new ApiError(422,'Resolve hierarchy errors before saving');
 await mkdir(directory,{recursive:true,mode:0o700});const record:any={id:jobId,instance:tb.config.url,siteId:p.draft.assetId,status:'saving',createdAt:Date.now(),before:p.snapshot.draft,changes:p.review.changes,completed:[]};const audit=()=>writeFile(directory+'/'+jobId+'.json',JSON.stringify(record,null,2),{mode:0o600});await audit();
 const done=async(kind:string,value:unknown)=>{record.completed.push({kind,value});await audit();};const resolve=new Map<string,Entity['id']>(p.draft.nodes.map(n=>[n.id,ref(n)]));
 try{
  for(const c of p.review.changes.filter(c=>c.kind==='profile')){const profile=await tb.request<Entity>('/api/assetProfile','POST',{name:c.target,description:'SolarOps Installation Contract 1.0.0',default:false});p.profiles.push(profile);await done('profile',profile.id);}
  for(const n of p.draft.nodes){const old=p.entities.get(n.id)!;let entity=old;
   if(n.id.startsWith('new_')){const type=n.role==='zone'?'SolarOps Zone v1':n.role==='pvString'?'SolarOps PV String v1':'SolarOps PV Array v1';entity=await tb.request<Entity>('/api/asset','POST',{name:n.name,label:n.label,type,assetProfileId:p.profiles.find(v=>v.name===type)!.id,...(p.snapshot.report.site.ownerId?.entityType==='CUSTOMER'?{customerId:p.snapshot.report.site.ownerId}:{})});resolve.set(n.id,entity.id);await done('asset',{temporaryId:n.id,id:entity.id});}
   else if(p.review.changes.some(c=>c.target===n.id&&['updateAsset','updateDevice'].includes(c.kind))){await tb.request('/api/'+n.entityType.toLowerCase(),'POST',updateBody(old,n));await done('entity',old.id);}
   const meta=p.review.changes.find(c=>c.target===n.id&&c.kind==='metadata');if(meta){await tb.request(`/api/plugins/telemetry/${entity.id.entityType}/${entity.id.id}/attributes/SERVER_SCOPE`,'POST',meta.after);await done('metadata',entity.id);}
  }
  const remove=async(r:Link)=>{const q=new URLSearchParams({fromId:r.from.id,fromType:r.from.entityType,toId:r.to.id,toType:r.to.entityType,relationType:r.type,relationTypeGroup:'COMMON'});await tb.request('/api/v2/relation?'+q,'DELETE');await done('unlink',r);};
  for(const r of p.removes.filter(r=>r.type!=='Contains'))await remove(r);
  for(const r of p.adds){const link={from:resolve.get(r.from.id)??r.from,to:resolve.get(r.to.id)??r.to,type:r.type,typeGroup:'COMMON'};await tb.request('/api/v2/relation','POST',link);await done('link',link);}
  for(const r of p.removes.filter(r=>r.type==='Contains'))await remove(r);
  if(p.review.changes.some(c=>c.kind==='layout')){const layout={...p.draft.layout!,hmi:remapHmi(p.draft.layout!.hmi,id=>resolve.get(id)!.id),version:1,...(p.draft.layout!.groups?{groups:p.draft.layout!.groups.map(g=>({...g,members:g.members.map(id=>resolve.get(id)!.id)}))}:{}),positions:Object.fromEntries(Object.entries(p.draft.layout!.positions).map(([id,point])=>[resolve.get(id)!.id,point]))};await tb.request(`/api/plugins/telemetry/ASSET/${p.draft.assetId}/attributes/SERVER_SCOPE`,'POST',{solaropsDiagramLayout:layout});await done('layout',layout);}
  const result=await installationSnapshot(tb,p.draft.assetId);const validation=await inspectSite(tb,p.draft.assetId);if(!validation.compatible)throw new ApiError(422,'The saved installation needs another review');
  record.status='succeeded';record.finishedAt=Date.now();await audit();return {saved:true,assetId:p.draft.assetId,draft:result.draft,siteName:result.report.site.label||result.report.site.name,counts:p.review.counts};
 }catch(e){record.status='partial';record.failure=e instanceof ApiError?'ThingsBoard request failed ('+e.status+')':'Save did not finish';await audit();throw new ApiError(502,'Saving did not finish. Some changes may already exist. Reload the hierarchy to review the current state. Device records and telemetry history were not deleted.');}
}
