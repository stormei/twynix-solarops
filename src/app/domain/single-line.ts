import type {Measurement} from './solar.js';
export interface ArrayTelemetry {id:string;name:string;equipmentKey:string;measurementDeviceId:string|null;feedsTo:string[];dc:Measurement;connected:boolean|null;staleAfterMs:number}
export interface GridTelemetry {id:string;name:string;source:'meter'|'controller';power:Measurement;connected:boolean|null;staleAfterMs:number}
export interface SingleLineTelemetry {arrays:ArrayTelemetry[];grid:GridTelemetry|null;dcTopologyKnown:boolean}
export interface DiagramPosition {id:string;x:number;y:number}
export function singleLineLayout(inverters:{id:string}[],arrays:ArrayTelemetry[]){
 let y=64;const inverterNodes:DiagramPosition[]=[],arrayNodes:DiagramPosition[]=[],links:{source:string;target:string}[]=[];const assigned=new Set<string>();
 for(const inverter of inverters){const connected=arrays.filter(a=>a.feedsTo.includes(inverter.id)),height=Math.max(1,connected.length)*108;inverterNodes.push({id:inverter.id,x:360,y:y+(height-108)/2});for(const [index,array] of connected.entries()){if(!assigned.has(array.id)){arrayNodes.push({id:array.id,x:24,y:y+index*108});assigned.add(array.id);}links.push({source:array.id,target:inverter.id});}y+=height;}
 const orphanStart=y;for(const array of arrays.filter(a=>!assigned.has(a.id))){arrayNodes.push({id:array.id,x:24,y});y+=108;}
 const centres=inverterNodes.map(n=>n.y+41),busTop=centres[0]??105,busBottom=centres.at(-1)??105,gridY=(busTop+busBottom)/2-41;
 return {inverters:inverterNodes,arrays:arrayNodes,links,height:Math.max(280,y+26),busTop,busBottom,gridY,orphanStart,hasUnlinked:arrays.some(a=>!assigned.has(a.id))};
}
export function measuredPowerState(power:Measurement,connected:boolean|null,unmetered=false):string {
 if(connected===false)return 'Frakoblet';if(unmetered)return 'Ikke målt';if(power.quality==='stale')return 'Foreldet';if(power.value===null||power.quality==='missing'||power.quality==='invalid')return 'Mangler data';return power.value>0.05?'Produksjon':power.value<-.05?'Forbruk':'Ingen effektflyt';
}
export function powerFlow(power:Measurement,connected:boolean|null,live:boolean):'forward'|'reverse'|'idle'{return !live||connected===false||power.quality!=='good'||power.value===null||Math.abs(power.value)<=.05?'idle':power.value>0?'forward':'reverse';}
