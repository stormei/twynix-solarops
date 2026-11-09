import type {FieldMapping} from './commission.js';
export type DeviceIdentification='inverter'|'other'|'unclassified'|'unavailable';
export interface SetupDevice {id:{id:string;entityType?:string};name:string;label?:string;identification:DeviceIdentification;savedMappings:{acPower?:FieldMapping;lifetimeEnergy?:FieldMapping}}
export interface DiscoveryMetadata {solaropsRole?:string;solaropsTelemetryMapping?:Record<string,FieldMapping>}
export function deviceIdentification(metadata:DiscoveryMetadata):DeviceIdentification {const role=metadata.solaropsRole;return role==='inverter'?'inverter':typeof role==='string'&&role.trim()?'other':'unclassified';}
export function savedProductionMappings(metadata:DiscoveryMetadata):SetupDevice['savedMappings'] {
 const result:SetupDevice['savedMappings']={};
 for(const field of ['acPower','lifetimeEnergy'] as const){const m=metadata.solaropsTelemetryMapping?.[field],units=field==='acPower'?['W','kW','MW']:['Wh','kWh','MWh'];if(m&&typeof m.key==='string'&&m.key.trim()&&units.includes(m.unit))result[field]={key:m.key,unit:m.unit};}
 return result;
}
