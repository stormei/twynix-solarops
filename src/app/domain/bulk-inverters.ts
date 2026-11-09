import type {SetupDevice} from './device-discovery.js';
import type {CommissionRow} from './commission.js';
import {initialInverter,type InitialDeviceInfo} from './initial-setup.js';
export interface SelectionFailure {device:SetupDevice;error:unknown}
export async function selectDetectedInverters(devices:SetupDevice[],existing:CommissionRow[],load:(id:string)=>Promise<InitialDeviceInfo>,limit=32){
 const selected=new Set(existing.map(r=>r.deviceId)),candidates=devices.filter(d=>{if(d.identification!=='inverter'||selected.has(d.id.id))return false;selected.add(d.id.id);return true;}),equipment=[...existing],failures:SelectionFailure[]=[];
 if(equipment.length+candidates.length>limit)return {equipment,failures,limitExceeded:true};
 for(const device of candidates){try{const info=await load(device.id.id);equipment.push(initialInverter(device.id.id,device.name,info));selected.add(device.id.id);}catch(error){if(error&&typeof error==='object'&&'status' in error&&[401,403].includes(Number(error.status)))throw error;failures.push({device,error});}}
 return {equipment,failures,limitExceeded:false};
}
