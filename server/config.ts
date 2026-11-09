import 'dotenv/config';
import {State} from '../src/app/domain/solar.ts';
export interface Mapping {key:string;unit:string}
export interface Settings {
 url:string;assetId:string;plantId:string;relation:string;origin:string;timezone:string;
 mapping:Record<string,Mapping>;states:Record<string,State>;verified:boolean;staleMs:number;
 discoveryMode?:'standard'|'legacy';version?:string;historyPath?:string;devicePrefix?:string;plantName?:string;simulated?:boolean;
 siteMapping?:Record<string,Mapping>;deviceModel?:string;
}
export function settings():Settings {
 const url=process.env['TB_URL']??'';
 if(url&&!/^https?:\/\//.test(url))throw Error('TB_URL must use http(s)');
 const mapping=JSON.parse(process.env['TB_TELEMETRY_MAPPING']??'{}') as Record<string,Mapping>;
 const siteMapping=JSON.parse(process.env['TB_SITE_MAPPING']??'{}') as Record<string,Mapping>;
 const states=JSON.parse(process.env['TB_STATE_MAPPING']??'{}') as Record<string,State>;
 const allowed=['mppt','sleep','standby','startup','throttled','fault','unknown','running','stopped'];
 if(Object.values(states).some(s=>!allowed.includes(s)))throw Error('Invalid state mapping');
 for(const v of [...Object.values(mapping),...Object.values(siteMapping)])if(!v||typeof v.key!=='string'||!v.key||typeof v.unit!=='string')throw Error('Invalid telemetry mapping');
 const historyPath=process.env['TB_HISTORY_PATH']??'';
 if(!['','/history'].includes(historyPath))throw Error('Invalid history endpoint suffix');
 return {discoveryMode:process.env['TB_DISCOVERY_MODE']==='standard'?'standard':'legacy',url:url.replace(/\/$/,''),assetId:process.env['TB_PLANT_ASSET_ID']??'',plantId:process.env['PLANT_ID']??'main',relation:process.env['TB_RELATION_TYPE']??'Contains',origin:process.env['APP_ORIGIN']??'http://localhost:3300',timezone:process.env['PLANT_TIMEZONE']??'Europe/Oslo',mapping,siteMapping,states,verified:process.env['TB_SCHEMA_VERIFIED']==='true',staleMs:Number(process.env['STALE_AFTER_MS']??120000),version:process.env['TB_VERSION']??'4.3.8',historyPath,devicePrefix:process.env['TB_DEVICE_PREFIX']??'',plantName:process.env['PLANT_NAME']??'Solar plant',simulated:process.env['TB_SIMULATED_SOURCE']==='true',deviceModel:process.env['TB_DEVICE_MODEL']};
}
