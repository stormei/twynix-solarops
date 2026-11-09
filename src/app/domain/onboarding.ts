import type {CommissionRow} from './commission.js';
export interface DeviceMeasurements {keys:string[];latest:Record<string,{ts:number;value:unknown}[]>}
export function measurementReadiness(row:CommissionRow,info?:DeviceMeasurements){
 const errors:string[]=[],warnings:string[]=[];
 if(row.kind==='asset'&&!row.measurementDeviceId)return {errors,warnings,mapped:0};
 if(!(row.deviceId||row.measurementDeviceId)||!info)return {errors:['Velg en enhet først.'],warnings,mapped:0};
 const mappings=Object.entries(row.mapping).filter(([,m])=>m.key.trim()),missing=mappings.filter(([,m])=>!info.keys.includes(m.key));
 if(row.role==='inverter'){
  const ac=row.mapping.acPower,sample=ac?info.latest[ac.key]?.at(-1):undefined;
  if(!ac?.key||!info.keys.includes(ac.key))errors.push('Velg en tilgjengelig målenøkkel for AC-effekt.');
  else if(!sample||!Number.isFinite(sample.ts)||sample.value===null||sample.value===''||typeof sample.value==='boolean'||!Number.isFinite(Number(sample.value)))errors.push('AC-effekt trenger en numerisk råverdi med tidsstempel.');
  if(!row.mapping.lifetimeEnergy?.key)warnings.push('Energirapporter krever en kartlagt energiteller.');
  if(!['operatingState','runFeedback','faultActive'].some(k=>row.mapping[k]?.key))warnings.push('Kartlegg drift- og feilsignaler for inverterstatus.');
 }
 if(missing.some(([field])=>field!=='acPower'))warnings.push('Noen kartlagte målenøkler finnes ikke på enheten.');
 return {errors,warnings,mapped:mappings.filter(([,m])=>info.keys.includes(m.key)).length};
}
