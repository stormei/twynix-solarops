import type {RecordedEnergy} from './solar.js';
export interface EnergyReportRow {start:number;end:number;site:RecordedEnergy;inverters:Record<string,RecordedEnergy>}
export interface EnergyReport {
 id:string;month:string;siteId:string;siteName:string;timezone:string;start:number;end:number;generatedAt:number;ongoing:boolean;simulated:boolean;
 version:'counter-delta-v1';source:'inverters';inverters:{id:string;name:string;period:RecordedEnergy}[];site:RecordedEnergy;days:EnergyReportRow[];
}
