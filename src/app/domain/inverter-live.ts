import type {Inverter,Measurement} from './solar.js';
export const liveInverterFields=[
 {field:'acPower',name:'AC-effekt',unit:'kW',decimals:2},
 {field:'dcPower',name:'DC-effekt',unit:'kW',decimals:2},
 {field:'dcVoltage',name:'DC-spenning',unit:'V',decimals:1},
 {field:'dcCurrent',name:'DC-strøm',unit:'A',decimals:2},
 {field:'lifetimeEnergy',name:'Energiteller',unit:'kWh',decimals:3},
 {field:'cabinetTemperature',name:'Temperatur',unit:'°C',decimals:1},
 {field:'acVoltage',name:'AC spenning L–L',unit:'V',decimals:1},
 {field:'acCurrent',name:'AC linjestrøm',unit:'A',decimals:2},
 {field:'frequency',name:'Frekvens',unit:'Hz',decimals:2},
 {field:'ratedAcPower',name:'Nominell AC-effekt',unit:'kW',decimals:1}
];
export function inverterReading(inverter:Inverter|undefined,field:string,now=Date.now()):Measurement {
 if(!inverter)return {value:null,timestamp:null,quality:'missing'};
 const m=({acPower:inverter.ac,dcPower:inverter.dc,dcVoltage:inverter.voltage,dcCurrent:inverter.current,lifetimeEnergy:inverter.lifetime,cabinetTemperature:inverter.temperature,acVoltage:inverter.phases['AC spenning L–L'],acCurrent:inverter.phases['AC linjestrøm'],frequency:inverter.phases['Frekvens'],ratedAcPower:inverter.ratedAcKw} as Record<string,Measurement|undefined>)[field];
 if(m?.quality==='invalid')return {value:null,timestamp:m.timestamp,quality:'invalid'};
 if(!m||m.quality==='missing'||m.value===null||m.timestamp===null)return {value:null,timestamp:m?.timestamp??null,quality:'missing'};
 if(!Number.isFinite(m.value)||!Number.isFinite(m.timestamp))return {value:null,timestamp:null,quality:'invalid'};
 return {...m,quality:m.quality==='good'&&now-m.timestamp>(inverter.staleAfterMs??120000)?'stale':m.quality};
}

export function sameTelemetryMapping(a:Record<string,{key:string;unit:string}>,b:Record<string,{key:string;unit:string}>):boolean {
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>a[key].key===b[key]?.key&&a[key].unit===b[key]?.unit);
}
