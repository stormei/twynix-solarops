import type {InstallationDraft,InstallationNode} from './installation.js';
import {arrange,type Point,type DiagramGroup} from './diagram.js';
import {moveSelection} from './diagram-selection.js';
import {topologyIssues} from './inverter.js';
export interface EquipmentClipboard {version:1;assetId:string;nodes:InstallationNode[];positions:Record<string,Point>;groups?:DiagramGroup[]}
export interface DeviceBinding {id:string;name:string;label?:string;equipmentKey?:string;keys:string[];role?:string;siteIds:string[]}
export interface StringBinding {inverterId:string;mpptId:string;inputId:string}
export function copyEquipment(draft:InstallationDraft,ids:string[]):EquipmentClipboard|null {
 const nodes=draft.nodes.filter(n=>ids.includes(n.id)&&n.id!==draft.assetId);if(!nodes.length)return null;
 const positions={...arrange(draft.nodes).positions,...draft.layout?.positions};
 return structuredClone({version:1,assetId:draft.assetId,nodes,groups:draft.layout?.groups?.filter(g=>g.members.every(id=>nodes.some(n=>n.id===id))),positions:Object.fromEntries(nodes.map(n=>[n.id,positions[n.id]]))});
}
export function pasteEquipment(draft:InstallationDraft,clipboard:EquipmentClipboard,devices:Record<string,DeviceBinding>={},strings:Record<string,StringBinding>={},offset=40,newId=()=> 'new_'+crypto.randomUUID()){
 if(clipboard.assetId!==draft.assetId)throw Error('Kopier utstyret fra denne installasjonen først.');
 if(draft.nodes.length+clipboard.nodes.length>128)throw Error('Installasjonen kan ha høyst 128 objekter.');
 const nodes=structuredClone(clipboard.nodes),ids=new Map<string,string>(),keys=new Set(draft.nodes.map(n=>n.equipmentKey)),names=new Set(draft.nodes.map(n=>n.name)),used=new Set(draft.nodes.map(n=>n.id));
 const unique=(base:string,set:Set<string>,max:number,key=false)=>{base=key?base.replace(/(?:-copy-\d+)+$/,''):base.replace(/(?: \(copy \d+\))+$/,'');let i=1,value='';do{const suffix=key?'-copy-'+i:' (copy '+i+')';value=base.slice(0,max-suffix.length)+suffix;i++;}while(set.has(value));set.add(value);return value;};
 for(const n of nodes){if(n.entityType==='DEVICE'){
   const b=devices[n.id];if(!b||used.has(b.id)||b.siteIds.some(id=>id!==draft.assetId))throw Error('Velg en egen, ledig ThingsBoard-enhet for hver enhetskopi.');
   if(b.role&&b.role!==n.role)throw Error('Den valgte enheten har en annen utstyrsrolle.');
   const mappings=[n.mapping,...(n.inverterConfig?.mppts.map(m=>m.mapping)??[])];if(mappings.some(m=>Object.values(m).some(v=>!b.keys.includes(v.key))))throw Error('Kopierte målenøkler finnes ikke på den valgte enheten.');
   ids.set(n.id,b.id);used.add(b.id);
  }else ids.set(n.id,newId());}
 for(const n of nodes){const oldId=n.id,b=devices[oldId];n.id=ids.get(oldId)!;n.parentId=ids.get(n.parentId??'')??(draft.nodes.some(p=>p.id===n.parentId)?n.parentId:draft.assetId);n.feedsTo=ids.get(n.feedsTo??'')??n.feedsTo;
  n.equipmentKey=b?.equipmentKey??unique(n.equipmentKey,keys,80,true);if(b?.equipmentKey){if(keys.has(b.equipmentKey))throw Error('Utstyrsnøkkelen er allerede i bruk.');keys.add(b.equipmentKey);}
  const originalName=n.name;n.name=n.entityType==='DEVICE'?b!.name:unique(originalName,names,120);n.label=n.entityType==='DEVICE'?unique(n.label||originalName,names,120):n.label?unique(n.label,names,120):'';n.isNew=n.entityType==='ASSET';
  if(n.measurementDeviceId){const copied=ids.get(n.measurementDeviceId);n.measurementDeviceId=copied;if(!copied)n.mapping={};}
  if(n.role==='pvString'){const input=strings[oldId];if(!input||!n.stringConfig)throw Error('Velg en ledig DC-inngang for hver strengkopi.');n.feedsTo=ids.get(input.inverterId)??input.inverterId;n.stringConfig={...n.stringConfig,mpptId:input.mpptId,inputId:input.inputId};n.mapping={};}
 }
 for(const role of ['gridMeter','siteController'])if([...draft.nodes,...nodes].filter(n=>n.role===role).length>1)throw Error('Installasjonen støtter bare én nettmåler og én anleggskontroller.');
 const copiedNames=new Set(nodes.map(n=>n.label||n.name)),issues=topologyIssues([...draft.nodes,...nodes]).filter(i=>i.severity==='error'&&copiedNames.has(i.entity));if(issues.length)throw Error('Kontroller strengtilkoblingene før innliming.');
 const positions={...arrange(draft.nodes).positions,...draft.layout?.positions},sourceIds=clipboard.nodes.map(n=>n.id);let moved=moveSelection(clipboard.positions,sourceIds,{x:offset,y:offset},false);
 for(let attempt=0;attempt<50&&Object.values(moved).some(p=>Object.values(positions).some(v=>v.x===p.x&&v.y===p.y));attempt++)moved=moveSelection(clipboard.positions,sourceIds,{x:offset+40*(attempt+1),y:offset+40*(attempt+1)},false);
 for(const [old,id] of ids)positions[id]=moved[old];
 return {draft:{...draft,nodes:[...draft.nodes,...nodes],layout:{...draft.layout,version:1 as const,positions,...(clipboard.groups?.length?{groups:[...(draft.layout?.groups??[]),...clipboard.groups.map(g=>({...g,id:'group_'+crypto.randomUUID(),name:g.name.slice(0,75)+' copy',members:g.members.map(id=>ids.get(id)!)}))]}:{})}},ids:nodes.map(n=>n.id)};
}
