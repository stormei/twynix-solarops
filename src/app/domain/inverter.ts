import type {FieldMapping} from './commission.js';
import type {InstallationNode} from './installation.js';
export interface MpptInput {id:string;name:string}
export interface Mppt {id:string;name:string;inputs:MpptInput[];mapping:Record<string,FieldMapping>}
export interface InverterConfiguration {version:1;manufacturer:string;model:string;energyCounterKind:'unknown'|'lifetime'|'daily'|'resettable';mppts:Mppt[]}
export interface StringConfiguration {version:1;mpptId:string;inputId:string;moduleManufacturer:string;moduleModel:string;moduleCount:number;modulePowerW:number;azimuth:number|null;tilt:number|null}
export interface BuilderIssue {entity:string;message:string;severity:'error'|'warning'}
export function stringPower(n:InstallationNode):number {return n.stringConfig?n.stringConfig.moduleCount*n.stringConfig.modulePowerW/1000:0;}
const text=(v:unknown,max=120)=>typeof v==='string'&&v.length<=max;
const identity=(v:unknown)=>typeof v==='string'&&/^[-a-z0-9]{1,60}$/.test(v);
export function mappingIssues(mapping:unknown):string[] {
 if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))return ['Invalid DC measurement mapping'];
 const issues:string[]=[];
 for(const [field,m] of Object.entries(mapping))if(!['dcPower','dcVoltage','dcCurrent'].includes(field)||!m||!text(m.key,128)||!m.key.trim()||!(field==='dcPower'?['W','kW','MW']:field==='dcVoltage'?['V']:['A']).includes(m.unit))issues.push('Check DC telemetry keys and units');
 return issues;
}
export function configurationIssues(config:unknown):string[] {
 const c=config as InverterConfiguration;
 if(!c||c.version!==1||!text(c.manufacturer)||!text(c.model)||!['unknown','lifetime','daily','resettable'].includes(c.energyCounterKind)||!Array.isArray(c.mppts)||c.mppts.length>16)return ['Invalid inverter configuration'];
 const errors:string[]=[],ids=new Set<string>();
 for(const m of c.mppts){if(!m||!identity(m.id)||ids.has(m.id)||!text(m.name)||!m.name.trim()||!Array.isArray(m.inputs)||!m.inputs.length||m.inputs.length>16){errors.push('Each MPPT needs a unique ID, name and 1–16 inputs');continue;}ids.add(m.id);const inputIds=new Set<string>();for(const input of m.inputs){if(!input||!identity(input.id)||inputIds.has(input.id)||!text(input.name)||!input.name.trim())errors.push('Each input needs a unique ID and name within its MPPT');inputIds.add(input.id);}errors.push(...mappingIssues(m.mapping));}
 return errors;
}
export function stringIssues(config:unknown):string[] {
 const c=config as StringConfiguration;
 if(!c||c.version!==1||!identity(c.mpptId)||!identity(c.inputId)||!text(c.moduleManufacturer)||!text(c.moduleModel)||!Number.isInteger(c.moduleCount)||c.moduleCount<1||c.moduleCount>1000||!Number.isFinite(c.modulePowerW)||c.modulePowerW<=0||c.modulePowerW>2000)return ['Enter a valid MPPT/input, module count (1–1,000) and module power (0–2,000 W)'];
 if(c.azimuth!==null&&(!Number.isFinite(c.azimuth)||c.azimuth<0||c.azimuth>=360)||c.tilt!==null&&(!Number.isFinite(c.tilt)||c.tilt<0||c.tilt>90))return ['Azimuth must be 0–359° from north; tilt must be 0–90°'];
 return [];
}
export function topologyIssues(nodes:InstallationNode[]):BuilderIssue[] {
 const issues:BuilderIssue[]=[],occupied=new Set<string>();
 const add=(n:InstallationNode,message:string,severity:'error'|'warning'='error')=>issues.push({entity:n.label||n.name,message,severity});
 for(const n of nodes){
  if(n.inverterConfig){if(n.role!=='inverter'||n.entityType!=='DEVICE')add(n,'Only inverter devices can have MPPT configuration');for(const e of configurationIssues(n.inverterConfig))add(n,e);if(n.mapping.lifetimeEnergy&&n.inverterConfig.energyCounterKind==='unknown')add(n,'Confirm whether the energy counter is lifetime, daily or resettable','warning');}
  if(n.role==='pvString'){
   if(n.entityType!=='ASSET')add(n,'PV strings must be assets');if(nodes.some(child=>child.parentId===n.id))add(n,'PV strings cannot contain other equipment');const errs=stringIssues(n.stringConfig);for(const e of errs)add(n,e);for(const e of mappingIssues(n.mapping))add(n,e);
   const inverter=nodes.find(t=>t.id===n.feedsTo&&t.role==='inverter'&&t.entityType==='DEVICE');if(!inverter)add(n,'Assign the string to an inverter inside this installation');
   if(!errs.length){const c=n.stringConfig!,mppt=Array.isArray(inverter?.inverterConfig?.mppts)?inverter!.inverterConfig!.mppts.find(m=>m.id===c.mpptId):undefined;if(!Array.isArray(mppt?.inputs)||!mppt.inputs.some(i=>i.id===c.inputId))add(n,'The string references an MPPT/input that does not exist');const key=n.feedsTo+'|'+c.mpptId+'|'+c.inputId;if(occupied.has(key))add(n,'Each DC input supports one string. Add a separate input for another string.');occupied.add(key);}
   if(!Object.keys(n.mapping).length)add(n,'String and module layout is configured; individual measurements are unavailable','warning');
  }else if(n.stringConfig)add(n,'Only PV string assets can have string configuration');
 }
 return issues;
}
export function blankInverter():InverterConfiguration {return {version:1,manufacturer:'',model:'',energyCounterKind:'unknown',mppts:[]};}
