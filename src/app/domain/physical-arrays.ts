import type {InstallationDraft} from './installation.js';
import {arrange} from './diagram.js';
export function upgradeMeasuredArrays(input:InstallationDraft):InstallationDraft {
 const draft=structuredClone(input),bound=new Set(draft.nodes.map(n=>n.measurementDeviceId)),replacements=new Map<string,string>();
 const devices=draft.nodes.filter(n=>n.entityType==='DEVICE'&&n.role==='pvArray'&&!bound.has(n.id));
 if(draft.nodes.length+devices.length>128)throw Error('The installation would exceed 128 equipment items');
 for(const device of devices){const id='new_'+crypto.randomUUID();let key=device.equipmentKey.slice(0,70)+'-array',suffix=1;while(draft.nodes.some(n=>n.equipmentKey===key))key=device.equipmentKey.slice(0,68)+'-array-'+suffix++;draft.nodes.push({id,entityType:'ASSET',role:'pvArray',name:device.name.slice(0,102)+' / Physical array',label:device.equipmentKey.toUpperCase()+' array',equipmentKey:key,parentId:device.parentId,mapping:structuredClone(device.mapping),feedsTo:device.feedsTo,measurementDeviceId:device.id,isNew:true});device.parentId=id;device.feedsTo=null;replacements.set(device.id,id);}
 if(!devices.length)return input;
 const positions={...arrange(draft.nodes).positions,...draft.layout?.positions};for(const [device,id] of replacements)positions[id]={...positions[device]};
 draft.layout={...draft.layout,version:1,positions,groups:draft.layout?.groups?.map(g=>({...g,members:g.members.map(id=>replacements.get(id)??id)}))};return draft;
}
