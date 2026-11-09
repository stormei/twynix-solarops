import type {CommissionRow,FieldMapping} from './commission.js';
import {measurementReadiness,type DeviceMeasurements} from './onboarding.js';
export interface InitialDeviceInfo extends DeviceMeasurements {metadata:{solaropsRole?:string;equipmentKey?:string;dataSourceKind?:'physical'|'simulation';solaropsTelemetryMapping?:Record<string,FieldMapping>};siteIds:string[]}
export function initialInverter(id:string,name:string,info:InitialDeviceInfo):CommissionRow {
 if(info.siteIds.length)throw Error('Enheten er allerede tilknyttet et anlegg.');
 if(info.metadata.solaropsRole&&info.metadata.solaropsRole!=='inverter')throw Error('Velg en enhet som representerer en inverter.');
 return {kind:'device',role:'inverter',deviceId:id,name,equipmentKey:info.metadata.equipmentKey||'inv-'+id.replace(/-/g,'').slice(0,12),mapping:structuredClone(info.metadata.solaropsTelemetryMapping??{acPower:{key:'',unit:''}})};
}
export function initialReadiness(row:CommissionRow,info?:InitialDeviceInfo){const result=measurementReadiness(row,info),ac=row.mapping.acPower,counter=row.mapping.lifetimeEnergy;
 if(ac?.key&&!['W','kW','MW'].includes(ac.unit))result.errors.push('Velg måleenhet for AC-effekt.');
 if(counter?.key){if(!info?.keys.includes(counter.key))result.errors.push('Velg en tilgjengelig målenøkkel for energitelleren.');else {const sample=info.latest[counter.key]?.at(-1);if(!sample||!Number.isFinite(sample.ts)||sample.value===null||sample.value===''||typeof sample.value==='boolean'||!Number.isFinite(Number(sample.value)))result.errors.push('Energitelleren trenger en numerisk råverdi med tidsstempel.');}if(!['Wh','kWh','MWh'].includes(counter.unit))result.errors.push('Velg måleenhet for energitelleren.');}
 return result;
}
export function initialSource(infos:InitialDeviceInfo[]){const kinds=[...new Set(infos.map(i=>i.metadata.dataSourceKind).filter((v):v is 'physical'|'simulation'=>v==='physical'||v==='simulation'))];return {kind:kinds.length===1?kinds[0]:null,conflict:kinds.length>1,unclassified:infos.some(i=>!['physical','simulation'].includes(i.metadata.dataSourceKind??''))};}
