import type {EnergyReport} from './production-report.js';
import type {RecordedEnergy} from './solar.js';
import {completeEnergy} from './energy-period.js';
type Cell=string|number|boolean|null;
// Fixed column names and decimal points keep exports consistent across UI languages.
export const reportCsvColumns=['report_id','generated_at_utc','report_month','period_type','period_label','period_start_utc','period_end_utc','timezone','site_id','site_name','entity_type','entity_id','entity_name','energy_kwh','coverage_percent','quality','partial_data','has_gaps','energy_unavailable','counter_reset','invalid_samples','missing_inverter_data','history_unavailable','counter_unmapped','issues','period_in_progress','simulated','calculation_version','energy_source'] as const;
function cell(value:Cell){
 let text=value===null?'':String(value);
 // Keep entity labels and other external text literal when opened in a spreadsheet.
 if(typeof value==='string'&&(/^[\u0000-\u0020]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text)))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
function localDay(ts:number,timezone:string){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(ts),part=(key:string)=>parts.find(p=>p.type===key)!.value;return `${part('year')}-${part('month')}-${part('day')}`;}
export function energyReportCsv(report:EnergyReport):string {
 const rows:Cell[][]=[[...reportCsvColumns]];
 const add=(type:'monthly'|'daily',start:number,end:number,label:string,kind:'site'|'inverter',id:string,name:string,e:RecordedEnergy)=>{
  const complete=completeEnergy(e),has=(issue:string)=>e.issues.includes(issue);
  rows.push([report.id,new Date(report.generatedAt).toISOString(),report.month,type,label,new Date(start).toISOString(),new Date(end).toISOString(),report.timezone,report.siteId,report.siteName,kind,id,name,e.value,e.coverage*100,e.value===null?'unavailable':complete?'complete':'partial',!complete,e.coverage<.999||has('missing samples'),e.value===null,has('counter reset'),has('invalid sample'),has('incomplete inverter coverage'),has('energy history unavailable'),has('energy counter not mapped'),e.issues.join('; '),report.ongoing&&end===report.end,report.simulated,report.version,report.source]);
 };
 add('monthly',report.start,report.end,report.month,'site',report.siteId,report.siteName,report.site);
 for(const i of report.inverters)add('monthly',report.start,report.end,report.month,'inverter',i.id,i.name,i.period);
 for(const day of report.days){const label=localDay(day.start,report.timezone);add('daily',day.start,day.end,label,'site',report.siteId,report.siteName,day.site);for(const i of report.inverters)add('daily',day.start,day.end,label,'inverter',i.id,i.name,day.inverters[i.id]);}
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
