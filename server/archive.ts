import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ThingsBoard,ApiError} from './thingsboard.ts';
import {administrator,canonical} from './commission.ts';
import {installationSnapshot} from './installation.ts';
export async function prepareArchive(tb:ThingsBoard,assetId:string){
 await administrator(tb);const snapshot=await installationSnapshot(tb,assetId);
 if(snapshot.report.metadata.solaropsArchived)throw new ApiError(409,'This installation is already archived');
 const ids=new Set(snapshot.draft.nodes.map(n=>n.id));
 if(snapshot.links.some(r=>!ids.has(r.from.id)||!ids.has(r.to.id)))throw new ApiError(422,'Resolve connections crossing the installation boundary before archiving');
 const backup={format:'solarops-installation-backup',version:1,instance:tb.config.url,siteId:assetId,siteName:snapshot.report.site.name,draft:snapshot.draft,relations:snapshot.links,metadata:snapshot.entities.map(e=>({id:e.id,name:e.name,label:e.label,solarops:e.solarops}))};
 return {id:randomUUID() as string,expiresAt:Date.now()+900000,baseline:snapshot.draft.baseline,digest:createHash('sha256').update(canonical(backup)).digest('hex'),backup,counts:{devices:snapshot.draft.nodes.filter(n=>n.entityType==='DEVICE').length,assets:snapshot.draft.nodes.filter(n=>n.entityType==='ASSET').length,relations:snapshot.links.length}};
}
export async function saveArchive(tb:ThingsBoard,p:Awaited<ReturnType<typeof prepareArchive>>,directory=fileURLToPath(new URL('../.runtime/archives/',import.meta.url))){
 await administrator(tb);await mkdir(directory,{recursive:true,mode:0o700});
 const record={...p.backup,id:p.id,archivedAt:new Date().toISOString(),status:'saving',completed:[] as unknown[]};
 const audit=()=>writeFile(directory+'/'+p.id+'.json',JSON.stringify(record,null,2),{mode:0o600});await audit();
 try{
  // A durable server-side model backup precedes every unlink. No entity or time-series endpoint is deleted.
  await tb.request(`/api/plugins/telemetry/ASSET/${p.backup.siteId}/attributes/SERVER_SCOPE`,'POST',{solaropsArchivedModel:record});
  for(const r of p.backup.relations){const q=new URLSearchParams({fromId:r.from.id,fromType:r.from.entityType,toId:r.to.id,toType:r.to.entityType,relationType:r.type,relationTypeGroup:'COMMON'});await tb.request('/api/v2/relation?'+q,'DELETE');record.completed.push(r);await audit();}
  await tb.request(`/api/plugins/telemetry/ASSET/${p.backup.siteId}/attributes/SERVER_SCOPE`,'POST',{solaropsArchived:true,solaropsArchivedAt:record.archivedAt,solaropsArchivedModel:{...record,status:'succeeded'}});
  record.status='succeeded';await audit();return {archived:true,siteId:p.backup.siteId,backup:record,counts:p.counts};
 }catch{record.status='partial';await audit();throw new ApiError(502,'Archiving did not finish. A model backup was saved. Reload the actual structure before reviewing another archive; devices and history were not deleted.');}
}
