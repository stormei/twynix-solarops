import type {Telemetry} from './thingsboard.ts';
import type {Mapping} from './config.ts';
import {measurement,convert,type Measurement} from '../src/app/domain/solar.ts';
type Unit='kW'|'kWh'|'V'|'A'|'°C'|'Hz'|'W/m²'|'%';
export function measured(data:Telemetry,mapping:Mapping|undefined,unit:Unit,now:number,staleMs:number):Measurement {
 if(!mapping)return measurement(null,null);
 const point=data[mapping.key]?.at(-1),result=measurement(point?.value,point?.ts??null,now,staleMs);
 if(result.value!==null){try{result.value=convert(result.value,mapping.unit,unit);}catch{result.value=null;result.quality='invalid';}}
 return result;
}
