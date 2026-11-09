import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ThingsBoard,Entity,ApiError} from './thingsboard.ts';
import {metadata,inspectSite,validateMetadata,Metadata,Issue,schemaVersion,roles} from './standard.ts';
import type {CommissionDraft,CommissionReview,CommissionTemplate,CommissionChange} from '../src/app/domain/commission.ts';
export async function templates():Promise<CommissionTemplate[]>{return Promise.all(['minimal-site','twynix-solar'].map(async id=>({id,...JSON.parse(await readFile(fileURLToPath(new URL('../templates/solarops-v1/'+id+'.json',import.meta.url)),'utf8'))})));}
export async function administrator(tb:ThingsBoard){const user=await tb.request<{authority:string}>('/api/auth/user');if(user.authority!=='TENANT_ADMIN')throw new ApiError(403,'Creating installations requires a ThingsBoard tenant administrator');}
export async function inventory(tb:ThingsBoard,type:'devices'|'assets'){
 const result:Entity[]=[];for(let page=0;page<20;page++){const p=await tb.request<{data:Entity[];hasNext:boolean}>(`/api/user/${type}?pageSize=100&page=${page}&sortProperty=name&sortOrder=ASC`);result.push(...p.data);if(!p.hasNext)return result;}throw new ApiError(422,'Inventory exceeds 2000 entities');
}
export function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value)??'null';}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function text(value:unknown,max:number){return typeof value==='string'&&value.trim().length>0&&value.length<=max;}
export async function normalizeDraft(value:unknown):Promise<CommissionDraft>{
 const d=structuredClone(value) as CommissionDraft,template=(await templates()).find(t=>t.id===d?.templateId);
 if(!template||!d.site||!text(d.site.name,120)||!text(d.site.siteKey,80)||!/^[-a-z0-9]+$/.test(d.site.siteKey)||!text(d.site.timezone,80)||!['physical','simulation'].includes(d.site.dataSourceKind))throw new ApiError(400,'Check the template, installation name, site key and timezone');
 if(template.id==='twynix-solar'&&d.site.dataSourceKind!=='simulation')throw new ApiError(422,'The Twynix template requires simulation provenance');
 try{new Intl.DateTimeFormat('en',{timeZone:d.site.timezone});}catch{throw new ApiError(400,'Choose a valid IANA timezone');}
 if(!Array.isArray(d.equipment)||!d.equipment.length||d.equipment.length>32)throw new ApiError(400,'Choose between 1 and 32 equipment entries');
 const keys=new Set<string>(),ids=new Set<string>();const allowedFields=new Set((await templates()).flatMap(t=>Object.values(t.adapters).flatMap(a=>Object.keys(a))));
 for(const row of d.equipment){
  if(!row||!text(row.equipmentKey,64)||!/^[-a-z0-9]+$/.test(row.equipmentKey)||keys.has(row.equipmentKey)||!roles.includes(row.role as any)||['site','zone'].includes(row.role))throw new ApiError(400,'Equipment keys must be unique and roles must be supported');keys.add(row.equipmentKey);
  if(row.kind==='device'){if(!uuid.test(row.deviceId??'')||ids.has(row.deviceId!))throw new ApiError(400,'Select a different existing device for each equipment entry');ids.add(row.deviceId!);}
  else if(row.kind!=='asset'||row.role!=='pvArray'||!text(row.name,120))throw new ApiError(400,'Only passive PV arrays can be created as equipment assets');
  if(!row.mapping||typeof row.mapping!=='object'||Array.isArray(row.mapping)||Object.keys(row.mapping).length>30)throw new ApiError(400,'Invalid telemetry mapping');
  for(const [field,m] of Object.entries(row.mapping))if(!allowedFields.has(field)||!m||!text(m.key,128)||typeof m.unit!=='string'||m.unit.length>16)throw new ApiError(400,'Check the telemetry field, key and unit');
  if(row.measurementDeviceId){if(row.kind!=='asset'||row.role!=='pvArray'||!uuid.test(row.measurementDeviceId)||ids.has(row.measurementDeviceId))throw new ApiError(400,'Select a distinct measurement device for each physical array');ids.add(row.measurementDeviceId);}
  if(row.kind==='asset'&&!row.measurementDeviceId&&Object.keys(row.mapping).length)throw new ApiError(400,'Passive array assets do not publish device telemetry');
  if(row.mapping['gridExport']&&!row.gridSignConfirmed)throw new ApiError(422,'Confirm that the grid power key is positive for export');
 }
 if(!d.equipment.some(r=>r.role==='inverter'))throw new ApiError(422,'An installation needs at least one inverter');
 for(const row of d.equipment)if(row.feedsTo&&(row.role!=='pvArray'||!d.equipment.some(r=>r.equipmentKey===row.feedsTo&&r.role==='inverter')))throw new ApiError(400,'Connect each PV array to an inverter in this installation');
 return {templateId:d.templateId,site:{name:d.site.name.trim(),siteKey:d.site.siteKey,timezone:d.site.timezone,dataSourceKind:d.site.dataSourceKind},equipment:d.equipment.map(r=>({equipmentKey:r.equipmentKey,role:r.role,kind:r.kind,deviceId:r.kind==='device'?r.deviceId:undefined,measurementDeviceId:r.measurementDeviceId,name:r.name,mapping:r.mapping,feedsTo:r.feedsTo||undefined,gridSignConfirmed:!!r.gridSignConfirmed}))};
}
interface PlannedRow {key:string;entity:Entity;attrs:Metadata;before:Metadata;create:boolean;parentKey?:string}
export interface PreparedCommission {draft:CommissionDraft;review:CommissionReview;root?:Entity;siteAttrs:Metadata;rows:PlannedRow[];profiles:Entity[];rootMembers:Set<string>;relations:{from:string;to:string;type:string}[];owner?:Entity['ownerId']}
export async function memberships(tb:ThingsBoard,entity:Entity){
 const sites=new Set<string>(),seen=new Set<string>();const queue=[entity];
 while(queue.length){const e=queue.shift()!;if(seen.has(e.id.id))continue;if(seen.size>100)throw new ApiError(422,'Equipment ancestry is too complex to verify');seen.add(e.id.id);
  const links=await tb.request<{from:Entity['id'];type:string}[]>(`/api/relations/info/to/${e.id.entityType}/${e.id.id}?relationTypeGroup=COMMON`);
  for(const link of links.filter(l=>l.type==='Contains'&&l.from.entityType==='ASSET')){const parent=await tb.request<Entity>(`/api/asset/${link.from.id}`);const m=await metadata(tb,parent);if(m.solaropsRole==='site')sites.add(parent.id.id);else queue.push(parent);}
 }
 return sites;
}
export async function deviceDetails(tb:ThingsBoard,id:string){if(!uuid.test(id))throw new ApiError(400,'Choose a device');const entity=await tb.request<Entity>('/api/device/'+id);return {entity,metadata:await metadata(tb,entity),keys:await tb.keys(id),siteIds:[...await memberships(tb,entity)]};}
export async function prepareCommission(tb:ThingsBoard,input:unknown,auditDirectory=fileURLToPath(new URL('../.runtime/commissions/',import.meta.url))):Promise<PreparedCommission>{
 await administrator(tb);const draft=await normalizeDraft(input),template=(await templates()).find(t=>t.id===draft.templateId)!;
 const issues:CommissionReview['issues']=[],changes:CommissionChange[]=[];
 const assets=await inventory(tb,'assets'),tagged=await Promise.all(assets.map(async entity=>({entity,metadata:await metadata(tb,entity)})));
 const matches=tagged.filter(t=>t.metadata.solaropsRole==='site'&&t.metadata.siteKey===draft.site.siteKey);if(matches.length>1)throw new ApiError(409,'Duplicate installation site key in ThingsBoard');let root:Entity|undefined=matches[0]?.entity;
 const partials:any[]=[];for(const name of (await readdir(auditDirectory).catch(()=>[])).filter(n=>/^[0-9a-f-]+\.json$/.test(n)).slice(-100)){try{const r=JSON.parse(await readFile(auditDirectory+'/'+name,'utf8'));if(r.status==='partial'&&r.instance===tb.config.url&&r.actor===createHash('sha256').update(tb.token).digest('hex')&&r.draft.site.siteKey===draft.site.siteKey)partials.push(r);}catch{}}
 if(!root){const resume=partials.find(r=>r.siteId&&assets.some(a=>a.id.id===r.siteId&&a.name===draft.site.name));if(resume)root=assets.find(a=>a.id.id===resume.siteId);}
 const add=(entity:string,message:string,severity:'error'|'warning'='error')=>issues.push({entity,message,severity});
 if(root&&root.name!==draft.site.name)add(root.name,'This site key already exists with a different name. Use its existing name or choose another site key.');
 if(!root&&assets.some(a=>a.name===draft.site.name))add(draft.site.name,'An asset already uses this installation name. Choose another name.');
 if(root){const m=await metadata(tb,root);if(m.solaropsSchemaVersion&&m.solaropsSchemaVersion!==schemaVersion)add(root.name,'Unsupported SolarOps schema version; existing metadata will not be overwritten');if(m.dataSourceKind&&m.dataSourceKind!==draft.site.dataSourceKind)add(root.name,'Keep the existing physical or simulation provenance');}
 const existing=root?await inspectSite(tb,root.id.id,false):undefined;
 for(const issue of existing?.issues??[])if(issue.severity==='error'&&['hierarchy','duplicate-key','nested-site','electrical-boundary'].includes(issue.code))add(issue.entity,issue.message);
 const members=new Set(existing?.entities.map(e=>e.id.id)??[]),rows:PlannedRow[]=[];
 const ownerIds=new Set<string>();let owner:Entity['ownerId']=root?.ownerId;
 const siteAttrs:Metadata={solaropsSchemaVersion:schemaVersion,solaropsRole:'site',siteKey:draft.site.siteKey,timezone:draft.site.timezone,dataSourceKind:draft.site.dataSourceKind,solaropsIntegrationProfile:template.templateId};
 const diff=(target:string,before:Metadata,after:Metadata)=>{const changed=Object.fromEntries(Object.entries(after).filter(([key,value])=>canonical((before as any)[key])!==canonical(value)));if(Object.keys(changed).length)changes.push({kind:'attributes',target,description:'Save SolarOps metadata',before:Object.fromEntries(Object.keys(changed).map(k=>[k,(before as any)[k]??null])),after:changed});};
 if(!root)changes.push({kind:'asset',target:'site',description:draft.site.name});diff('site',root?await metadata(tb,root):{} as Metadata,siteAttrs);
 for(const row of draft.equipment){
  let entity:Entity,create=false;
  if(row.kind==='device')entity=await tb.request<Entity>('/api/device/'+row.deviceId);
  else {const found=existing?.entities.filter(e=>e.solarops?.equipmentKey===row.equipmentKey||(e.id.entityType==='ASSET'&&e.name===row.name&&!e.solarops?.equipmentKey))??[];if(!found.length){const step=partials.flatMap(r=>r.completed).find(s=>s.kind==='array'&&s.id?.key===row.equipmentKey);const e=step?assets.find(a=>a.id.id===step.id.id.id&&a.name===row.name):undefined;if(e)found.push(e);}if(found.length>1)throw new ApiError(409,'Duplicate equipment key');entity=found[0]??{id:{id:'@'+row.equipmentKey,entityType:'ASSET'},name:row.name};create=!found.length;if(!create&&(entity.id.entityType!=='ASSET'||entity.name!==row.name))add(row.name,'Existing equipment does not match this asset slot');if(create&&assets.some(a=>a.name===row.name))add(row.name,'An asset already uses this array name. Choose another name.');}
  const before=create?{} as Metadata:await metadata(tb,entity);if(before.solaropsSchemaVersion&&before.solaropsSchemaVersion!==schemaVersion)add(entity.name,'Unsupported SolarOps schema version; existing metadata will not be overwritten');
  if(entity.ownerId){ownerIds.add(entity.ownerId.id);owner??=entity.ownerId;}
  if(!create){
   const siteIds=await memberships(tb,entity);if([...siteIds].some(id=>id!==root?.id.id))add(entity.name,'This equipment belongs to another SolarOps installation. It will not be moved.');
   if(before.dataSourceKind&&before.dataSourceKind!==draft.site.dataSourceKind)add(entity.name,'Keep the existing physical or simulation provenance');
   if(before.solaropsRole&&before.solaropsRole!==row.role)add(entity.name,'The existing equipment role conflicts with the selected role');
   if(before.equipmentKey&&before.equipmentKey!==row.equipmentKey)add(entity.name,'Keep the existing stable equipment key');
  }
  const attrs:Metadata={solaropsSchemaVersion:schemaVersion,solaropsRole:row.role,equipmentKey:row.equipmentKey,dataSourceKind:draft.site.dataSourceKind,solaropsIntegrationProfile:before.solaropsIntegrationProfile??template.templateId,solaropsTelemetryMapping:row.mapping,...(row.measurementDeviceId?{solaropsMeasurementDeviceId:row.measurementDeviceId}:{}),...(Object.keys(row.mapping).length?{solaropsStateMapping:before.solaropsStateMapping??{},expectedIntervalMs:before.expectedIntervalMs??1000,staleAfterMs:before.staleAfterMs??120000}:{}),...(row.mapping['gridExport']?{gridPowerSign:'exportPositive'}:{})};
  const validation:Issue[]=[];validateMetadata({...entity,solarops:attrs},validation);for(const v of validation)add(v.entity,v.message,v.severity);
  let telemetryId=row.kind==='device'?entity.id.id:row.measurementDeviceId;
  if(row.measurementDeviceId){
   const source=await tb.request<Entity>('/api/device/'+row.measurementDeviceId),sourceBefore=await metadata(tb,source);
   if(source.ownerId){ownerIds.add(source.ownerId.id);owner??=source.ownerId;}
   if([...(await memberships(tb,source))].some(id=>id!==root?.id.id))add(source.name,'This equipment belongs to another SolarOps installation. It will not be moved.');
   if(sourceBefore.solaropsRole&&sourceBefore.solaropsRole!=='pvArray')add(source.name,'Choose a PV array measurement device');
   if(sourceBefore.dataSourceKind&&sourceBefore.dataSourceKind!==draft.site.dataSourceKind)add(source.name,'Keep the existing physical or simulation provenance');
   if(sourceBefore.solaropsSchemaVersion&&sourceBefore.solaropsSchemaVersion!==schemaVersion)add(source.name,'Unsupported measurement device schema');
   const sourceAttrs:Metadata={...sourceBefore,solaropsSchemaVersion:schemaVersion,solaropsRole:'pvArray',equipmentKey:sourceBefore.equipmentKey??row.equipmentKey+'-meter',dataSourceKind:draft.site.dataSourceKind,solaropsTelemetryMapping:row.mapping};
   const sourceKey='source:'+row.equipmentKey;diff(sourceKey,sourceBefore,sourceAttrs);rows.push({key:sourceKey,entity:source,attrs:sourceAttrs,before:sourceBefore,create:false,parentKey:row.equipmentKey});
  }
  if(telemetryId){
   const keys=await tb.keys(telemetryId);for(const [field,map] of Object.entries(row.mapping))if(!keys.includes(map.key))add(entity.name,'Telemetry key does not exist: '+map.key,field==='acPower'?'error':'warning');
   if(row.role==='inverter'&&row.mapping['acPower']){const points=await tb.latest(entity.id.id,row.mapping),p=points[row.mapping['acPower'].key]?.at(-1);if(!p||!Number.isFinite(p.ts)||p.value===null||p.value===''||typeof p.value==='boolean'||!Number.isFinite(Number(p.value)))add(entity.name,'AC power needs a numeric measurement with a timestamp');else if(Date.now()-p.ts>(attrs.staleAfterMs??120000))add(entity.name,'Source telemetry is stale; monitoring resumes when publishing resumes','warning');}
  }
  if(create)changes.push({kind:'asset',target:row.equipmentKey,description:row.name});diff(row.equipmentKey,before,attrs);rows.push({key:row.equipmentKey,entity,attrs,before,create});
 }
 const equipmentKeys=new Set<string>();for(const row of rows){const key=row.attrs.equipmentKey;if(key&&equipmentKeys.has(key))add(row.entity.name,'Equipment keys must be unique across physical assets and measurement devices');if(key)equipmentKeys.add(key);}
 if(root?.ownerId)ownerIds.add(root.ownerId.id);if(ownerIds.size>1)add(draft.site.name,'Selected equipment has different owners. Keep each installation within one ThingsBoard owner.');
 const retained=(existing?.entities??[]).filter(e=>!rows.some(r=>r.entity.id.id===e.id.id));for(const e of retained){const validation:Issue[]=[];validateMetadata(e,validation);for(const v of validation)if(v.severity==='error')add(v.entity,v.message);}for(const row of rows)if(retained.some(e=>e.solarops?.equipmentKey===row.key))add(row.entity.name,'Equipment key is already used in this installation');
 for(const role of ['siteController','gridMeter'])if([...rows.map(r=>r.attrs.solaropsRole),...retained.map(e=>e.solarops?.solaropsRole)].filter(r=>r===role).length>1)add(draft.site.name,'v1 supports only one '+role+' per installation');
 if(retained.length)add(draft.site.name,'Existing equipment not listed here will be retained','warning');
 const profiles=await (async()=>{const all:Entity[]=[];for(let page=0;page<20;page++){const p=await tb.request<{data:Entity[];hasNext:boolean}>(`/api/assetProfiles?pageSize=100&page=${page}`);all.push(...p.data);if(!p.hasNext)return all;}throw new ApiError(422,'Too many asset profiles');})();
 const needed=[...new Set([...(root?[]:['SolarOps Site v1']),...(rows.some(r=>r.create)?['SolarOps PV Array v1']:[])])];for(const name of needed)if(!profiles.some(p=>p.name===name))changes.push({kind:'profile',target:name,description:'Create reusable asset profile'});
 const relations:PreparedCommission['relations']=[];
 const hasLink=(fromKey:string,toKey:string,type:string)=>{const fromId=fromKey==='site'?root?.id.id:rows.find(r=>r.key===fromKey)?.entity.id.id,toId=rows.find(r=>r.key===toKey)?.entity.id.id;return existing?.relations.some(r=>r.from.id===fromId&&r.to.id===toId&&r.type===type)??false;};
 for(const row of rows){const from=row.parentKey??'site';if(!hasLink(from,row.key,'Contains')&&!members.has(row.entity.id.id)||row.parentKey&&!hasLink(from,row.key,'Contains')){if(row.parentKey&&members.has(row.entity.id.id)){const oldParent=existing?.relations.find(r=>r.type==='Contains'&&r.to.id===row.entity.id.id);if(oldParent)add(row.entity.name,'Move an existing site device using Installation editor before reusing it here');}relations.push({from,to:row.key,type:'Contains'});changes.push({kind:'relation',target:from+' → '+row.key,description:'Contains'});}
 if(row.parentKey&&!hasLink(row.parentKey,row.key,'MeasuredBy')){relations.push({from:row.parentKey,to:row.key,type:'MeasuredBy'});changes.push({kind:'relation',target:row.parentKey+' → '+row.key,description:'MeasuredBy'});}}
 for(const row of draft.equipment.filter(r=>r.feedsTo)){const from=rows.find(r=>r.key===row.equipmentKey)!,to=rows.find(r=>r.key===row.feedsTo)!;const links=from.create?[]:await tb.request<{from:Entity['id'];to:Entity['id'];type:string}[]>(`/api/relations/info/from/${from.entity.id.entityType}/${from.entity.id.id}?relationTypeGroup=COMMON`);if(links.some(l=>l.type==='Feeds'&&l.to.id!==to.entity.id.id))add(from.entity.name,'This array already feeds another inverter. Existing electrical relations will not be removed.');if(!links.some(l=>l.type==='Feeds'&&l.to.id===to.entity.id.id)){relations.push({from:from.key,to:to.key,type:'Feeds'});changes.push({kind:'relation',target:from.key+' → '+to.key,description:'Feeds'});}}
 const digest=createHash('sha256').update(canonical({draft,root:root?.id,rows:rows.map(r=>({key:r.key,id:r.entity.id,before:r.before})),changes})).digest('hex');
 return {draft,root,siteAttrs,rows,profiles,rootMembers:members,relations,owner,review:{id:randomUUID(),digest,expiresAt:Date.now()+900000,siteName:draft.site.name,existingSiteId:root?.id.id??null,canSave:!issues.some(i=>i.severity==='error'),issues,changes,counts:{assets:changes.filter(c=>c.kind==='asset').length,profiles:changes.filter(c=>c.kind==='profile').length,devices:rows.filter(r=>r.entity.id.entityType==='DEVICE').length,attributes:changes.filter(c=>c.kind==='attributes').length,relations:changes.filter(c=>c.kind==='relation').length},equipment:draft.equipment.map(r=>({...r,name:rows.find(p=>p.key===r.equipmentKey)!.entity.name}))}};
}
export async function saveCommission(tb:ThingsBoard,p:PreparedCommission,jobId:string,auditDirectory=fileURLToPath(new URL('../.runtime/commissions/',import.meta.url))){
 if(!p.review.canSave)throw new ApiError(422,'Resolve the installation errors before saving');
 await mkdir(auditDirectory,{recursive:true,mode:0o700});const auditFile=auditDirectory+'/'+jobId+'.json';
 const record:any={id:jobId,instance:tb.config.url,actor:createHash('sha256').update(tb.token).digest('hex'),createdAt:Date.now(),status:'saving',siteId:p.root?.id.id??null,draft:p.draft,changes:p.review.changes,devices:p.rows.filter(r=>!r.create).map(r=>({id:r.entity.id,name:r.entity.name,attributesBefore:r.before})),completed:[]};
 const audit=async()=>writeFile(auditFile,JSON.stringify(record,null,2),{mode:0o600});await audit();
 const done=async(kind:string,id:unknown)=>{record.completed.push({kind,id});await audit();};
 try{
  for(const change of p.review.changes.filter(c=>c.kind==='profile')){const profile=await tb.request<Entity>('/api/assetProfile','POST',{name:change.target,description:'SolarOps Installation Contract 1.0.0',default:false});p.profiles.push(profile);await done('profile',profile.id);}
  const owner=p.owner?.entityType==='CUSTOMER'?{customerId:p.owner}:{};
  const root=p.root??await tb.request<Entity>('/api/asset','POST',{name:p.draft.site.name,type:'SolarOps Site v1',assetProfileId:p.profiles.find(v=>v.name==='SolarOps Site v1')!.id,...owner});record.siteId=root.id.id;await done('site',root.id);
  const targets=new Map<string,Entity>([['site',root]]);
  // Tag the site before adding members, so a retry can resolve it by siteKey.
  const siteChange=p.review.changes.find(c=>c.kind==='attributes'&&c.target==='site');if(siteChange){await tb.request(`/api/plugins/telemetry/ASSET/${root.id.id}/attributes/SERVER_SCOPE`,'POST',siteChange.after);await done('attributes',root.id);}
  for(const row of [...p.rows].sort((a,b)=>Number(!!a.parentKey)-Number(!!b.parentKey))){const entity=row.create?await tb.request<Entity>('/api/asset','POST',{name:row.entity.name,type:'SolarOps PV Array v1',assetProfileId:p.profiles.find(v=>v.name==='SolarOps PV Array v1')!.id,...owner}):row.entity;targets.set(row.key,entity);if(row.create)await done('array',{key:row.key,id:entity.id});
   // Attach new arrays immediately, allowing a reviewed retry to discover them.
   const relation=p.relations.find(r=>r.type==='Contains'&&r.to===row.key&&!row.parentKey);if(relation){await tb.request('/api/v2/relation','POST',{from:root.id,to:entity.id,type:'Contains',typeGroup:'COMMON'});await done('Contains',entity.id);}
   const change=p.review.changes.find(c=>c.kind==='attributes'&&c.target===row.key);if(change){await tb.request(`/api/plugins/telemetry/${entity.id.entityType}/${entity.id.id}/attributes/SERVER_SCOPE`,'POST',change.after);await done('attributes',entity.id);}

  }
  for(const r of p.relations.filter(r=>r.type!=='Contains'||p.rows.find(row=>row.key===r.to)?.parentKey)){await tb.request('/api/v2/relation','POST',{from:targets.get(r.from)!.id,to:targets.get(r.to)!.id,type:r.type,typeGroup:'COMMON'});await done('Feeds',r);}
  const report=await inspectSite(tb,root.id.id);if(!report.compatible)throw new ApiError(422,'Saved structure needs attention. Review the installation again.');
  record.status='succeeded';record.finishedAt=Date.now();await audit();return {saved:true,siteId:root.id.id,report,counts:p.review.counts};
 }catch(e){record.status='partial';record.failure=e instanceof ApiError?'ThingsBoard request failed ('+e.status+')':'Commissioning could not finish';await audit();throw new ApiError(502,'Saving could not finish. Some reviewed changes may already exist. Review again before retrying; existing devices and telemetry were not deleted.');}
}
