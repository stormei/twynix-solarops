import {inventory} from './commission.ts';
import {ApiError,type ThingsBoard} from './thingsboard.ts';
import {deviceIdentification,savedProductionMappings,type DiscoveryMetadata,type SetupDevice} from '../src/app/domain/device-discovery.ts';
export async function setupDevices(tb:ThingsBoard):Promise<SetupDevice[]> {
 const devices=await inventory(tb,'devices'),result:SetupDevice[]=[];
 // Read declared roles and mappings only. Keys, samples and membership are
 // checked against ThingsBoard again when the operator selects a device.
 for(let offset=0;offset<devices.length;offset+=8){const batch=devices.slice(offset,offset+8),values=await Promise.allSettled(batch.map(async device=>{const attributes=await tb.request<{key:string;value:unknown}[]>(`/api/plugins/telemetry/DEVICE/${encodeURIComponent(device.id.id)}/values/attributes/SERVER_SCOPE?keys=solaropsRole,solaropsTelemetryMapping`),info=Object.fromEntries(attributes.map(a=>[a.key,a.value])) as DiscoveryMetadata;return {...device,identification:deviceIdentification(info),savedMappings:savedProductionMappings(info)};}));
  for(const [index,value] of values.entries()){if(value.status==='fulfilled')result.push(value.value);else {if(value.reason instanceof ApiError&&[401,403].includes(value.reason.status))throw value.reason;result.push({...batch[index],identification:'unavailable',savedMappings:{}});}}
 }
 return result.sort((a,b)=>Number(b.identification==='inverter')-Number(a.identification==='inverter')||(a.label||a.name).localeCompare(b.label||b.name));
}
