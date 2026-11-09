import type {DiagramLayout,Point} from './diagram.js';
import type {InstallationNode} from './installation.js';
import type {Plant,Measurement} from './solar.js';
import {inverterReading,liveInverterFields} from './inverter-live.js';
import {freshMeasurement} from './operations.js';
export const hmiKinds=['acBus','dcBus','breaker','isolator','transformer','grid','load','meter','value','trend','text','area'] as const;
export type HmiKind=typeof hmiKinds[number];
export interface HmiElement {id:string;kind:HmiKind;label:string;x:number;y:number;width:number;height:number;bindingId?:string;field?:string}
export interface HmiConnection {id:string;from:string;to:string;circuit:'ac'|'dc';bend?:number}
export interface HmiDrawing {elements:HmiElement[];connections:HmiConnection[]}
export const hmiNames:Record<HmiKind,string>={acBus:'AC-samleskinne',dcBus:'DC-samleskinne',breaker:'Effektbryter',isolator:'Skillebryter',transformer:'Transformator',grid:'Nett',load:'Bygning / last',meter:'Måler',value:'Sanntidsverdi',trend:'Minitrend',text:'Tekst',area:'Område'};
export function validHmi(value:unknown,ids:Set<string>):boolean{
 if(value===undefined)return true;const h=value as HmiDrawing;
 if(!h||!Array.isArray(h.elements)||h.elements.length>64||!Array.isArray(h.connections)||h.connections.length>128)return false;
 const elementIds=new Set<string>(),wireIds=new Set<string>();const id=(v:unknown)=>typeof v==='string'&&/^hmi_[-a-zA-Z0-9_]{1,80}$/.test(v);
 const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 if(!h.elements.every(e=>{if(!e||!id(e.id)||ids.has(e.id)||elementIds.has(e.id)||!hmiKinds.includes(e.kind)||typeof e.label!=='string'||e.label.length>160||!finite(e.x,0,20000)||!finite(e.y,0,20000)||!finite(e.width,80,1200)||!finite(e.height,40,800)||e.bindingId!==undefined&&!ids.has(e.bindingId)||e.field!==undefined&&!liveInverterFields.some(f=>f.field===e.field))return false;elementIds.add(e.id);return true;}))return false;
 const endpoints=new Set([...ids,...elementIds]);return h.connections.every(w=>{if(!w||!id(w.id)||wireIds.has(w.id)||elementIds.has(w.id)||!endpoints.has(w.from)||!endpoints.has(w.to)||w.from===w.to||!['ac','dc'].includes(w.circuit)||w.bend!==undefined&&!finite(w.bend,0,22000))return false;wireIds.add(w.id);return true;});
}
export function pruneHmi(h:HmiDrawing|undefined,ids:Set<string>):HmiDrawing|undefined{
 if(!h)return;const elements=h.elements.map(e=>({...e,...(e.bindingId&&!ids.has(e.bindingId)?{bindingId:undefined}:{})}));const endpoints=new Set([...ids,...elements.map(e=>e.id)]);return {elements,connections:h.connections.filter(w=>endpoints.has(w.from)&&endpoints.has(w.to))};
}
export function remapHmi(h:HmiDrawing|undefined,resolve:(id:string)=>string):HmiDrawing|undefined{return h?{elements:h.elements.map(e=>({...e,...(e.bindingId?{bindingId:resolve(e.bindingId)}:{})})),connections:h.connections.map(w=>({...w,from:w.from.startsWith('hmi_')?w.from:resolve(w.from),to:w.to.startsWith('hmi_')?w.to:resolve(w.to)}))}:undefined;}
export function hmiEndpoint(id:string,layout:DiagramLayout,nodes:InstallationNode[],out:boolean):Point{
 const e=layout.hmi?.elements.find(e=>e.id===id);if(e)return {x:e.x+(out?e.width:0),y:e.y+e.height/2};const p=layout.positions[id]??{x:0,y:0};return {x:p.x+(out?212:0),y:p.y+47};
}
export function hmiWirePath(a:Point,b:Point,bend?:number){const x=bend??(a.x+b.x)/2;return `M ${a.x} ${a.y} H ${x} V ${b.y} H ${b.x}`;}
export function hmiReading(e:HmiElement,plant:Plant|null,nodes:InstallationNode[],now:number):{measurement:Measurement;unit:string}{
 const field=e.field??'acPower',unit=liveInverterFields.find(f=>f.field===field)?.unit??'';const missing={measurement:{value:null,timestamp:null,quality:'missing' as const},unit};if(!e.bindingId||!plant)return missing;
 const inv=plant.inverters.find(i=>i.id===e.bindingId);if(inv)return {measurement:inverterReading(inv,field,now),unit};
 const n=nodes.find(n=>n.id===e.bindingId),grid=plant.singleLine?.grid;
 if(n?.role==='gridMeter'&&grid?.id===n.id&&field==='acPower')return {measurement:freshMeasurement(grid.power,now,grid.staleAfterMs),unit:'kW'};
 const array=plant.singleLine?.arrays.find(a=>a.id===n?.id);if(array&&field==='dcPower')return {measurement:freshMeasurement(array.dc,now,array.staleAfterMs),unit:'kW'};
 return missing;
}
export function hmiTrend(e:HmiElement,plant:Plant|null):string{
 const i=plant?.inverters.find(i=>i.id===e.bindingId),field=e.field??'acPower';const series=field==='acPower'?i?.history:field==='dcPower'?i?.dcHistory:field==='dcVoltage'?i?.voltageHistory:field==='dcCurrent'?i?.currentHistory:undefined;
 const p=series?.slice(-60)??[],values=p.filter(p=>p.value!==null&&Number.isFinite(p.value));if(values.length<2)return '';
 const min=Math.min(...values.map(p=>p.value!)),max=Math.max(...values.map(p=>p.value!)),start=p[0].ts,span=p.at(-1)!.ts-start;if(span<=0)return '';
 let gap=true,previous=0;return p.map(p=>{if(p.value===null||!Number.isFinite(p.value)){gap=true;return '';}const move=gap||p.ts-previous>900000;gap=false;previous=p.ts;return `${move?'M':'L'} ${12+(p.ts-start)/span*(e.width-24)} ${e.height-16-(p.value-min)/(max-min||1)*(e.height-62)}`;}).join(' ');
}
