import {pruneHmi} from './hmi.js';
import {pruneGroups} from './diagram.js';
import type {InstallationDraft,InstallationNode} from './installation.js';
export interface RemovalPlan {removed:InstallationNode[];disconnected:InstallationNode[];rootSelected:boolean;error:string;draft:InstallationDraft}
export function planEquipmentRemoval(draft:InstallationDraft,selected:string[]):RemovalPlan {
 const selectedSet=new Set(selected),removedIds=new Set(draft.nodes.filter(n=>selectedSet.has(n.id)&&n.id!==draft.assetId).map(n=>n.id));
 let changed=true;
 while(changed){changed=false;for(const n of draft.nodes){if(n.id===draft.assetId||removedIds.has(n.id))continue;
   if(n.parentId&&removedIds.has(n.parentId)||n.role==='pvString'&&n.feedsTo&&removedIds.has(n.feedsTo)){removedIds.add(n.id);changed=true;}
 }}
 const removed=draft.nodes.filter(n=>removedIds.has(n.id)),disconnected=draft.nodes.filter(n=>!removedIds.has(n.id)&&n.feedsTo&&removedIds.has(n.feedsTo));
 const nodes=draft.nodes.filter(n=>!removedIds.has(n.id)).map(n=>({...n,...(n.feedsTo&&removedIds.has(n.feedsTo)?{feedsTo:null}:{}),...(n.measurementDeviceId&&removedIds.has(n.measurementDeviceId)?{measurementDeviceId:undefined,mapping:{}}:{})}));
 const error=!removed.length?'Velg utstyr som skal fjernes.':!nodes.some(n=>n.role==='inverter'&&n.entityType==='DEVICE')?'Behold minst én inverter i installasjonen.':'';
 const result={...draft,nodes,...(draft.layout?{layout:{...draft.layout,hmi:pruneHmi(draft.layout.hmi,new Set(nodes.map(n=>n.id))),version:1 as const,...(draft.layout.groups?{groups:pruneGroups(draft.layout.groups,new Set(nodes.map(n=>n.id)))}:{}),positions:Object.fromEntries(Object.entries(draft.layout.positions).filter(([id])=>!removedIds.has(id)))}}:{})};
 return {removed,disconnected,rootSelected:selectedSet.has(draft.assetId),error,draft:result};
}
