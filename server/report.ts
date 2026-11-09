import PDFDocument from 'pdfkit';
import type {Response} from 'express';
import {translateMessage,type Language} from '../src/app/core/translate.ts';
import type {RecordedEnergy} from '../src/app/domain/solar.ts';
import {completeEnergy} from '../src/app/domain/energy-period.ts';
import {getEnergyReport} from './production-report.ts';
import type {ThingsBoard} from './thingsboard.ts';
const issueNames:Record<string,string>={'counter reset':'Teller nullstilt','missing samples':'Datagap','invalid sample':'Ugyldige målinger','incomplete coverage':'Delvis dekning','incomplete inverter coverage':'Mangler inverterdata','energy history unavailable':'Energihistorikk utilgjengelig','energy counter not mapped':'Energiteller ikke kartlagt'};
export async function monthlyReport(tb:ThingsBoard,month:string,res:Response,language:Language='nb',snapshot?:string){
 const report=await getEnergyReport(tb,month,snapshot),t=(key:string)=>translateMessage(key,language),locale=language==='en'?'en-GB':'nb-NO';
 const number=(v:number|null,digits=2)=>v===null?'—':new Intl.NumberFormat(locale,{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(v);
 const date=(ts:number)=>new Intl.DateTimeFormat(locale,{timeZone:report.timezone,dateStyle:'medium',timeStyle:'short'}).format(ts);
 const day=(ts:number)=>new Intl.DateTimeFormat(locale,{timeZone:report.timezone,day:'2-digit',month:'short'}).format(ts);
 const quality=(e:RecordedEnergy)=>e.value===null?t('Ingen beregnbar energi'):completeEnergy(e)?t('Komplett dekning hittil'):t('Delvise data');
 const issues=(e:RecordedEnergy)=>e.issues.map(i=>t(issueNames[i]??i)).join(', ');
 const doc=new PDFDocument({margin:45,size:'A4',bufferPages:true,info:{Title:`SolarOps ${report.siteName} ${month}`}});res.type('application/pdf');res.setHeader('Content-Disposition',`attachment; filename="solarops-${month}.pdf"`);doc.pipe(res);
 const space=(height=50)=>{if(doc.y+height>780)doc.addPage();};
 const heading=(title:string)=>{space(65);doc.moveDown().fontSize(15).fillColor('#10243b').text(title);doc.moveDown(.5);};
 const row=(label:string,e:RecordedEnergy)=>{const text=`${label} | ${number(e.value)} kWh | ${t('dekning')} ${number(e.coverage*100,1)}% | ${quality(e)}`;space(42);doc.fontSize(9).fillColor('#243b53').text(text);if(e.issues.length)doc.fontSize(8).fillColor('#8a6421').text(issues(e));doc.moveDown(.4);};
 doc.fontSize(12).fillColor('#3272aa').text('SOLAROPS / ENERGY INTELLIGENCE');doc.moveDown().fontSize(24).fillColor('#10243b').text(t('Månedlig produksjonsrapport'));doc.moveDown(.5).fontSize(12).text(`${report.siteName} | ${month}`);doc.fontSize(9).text(`${t('Periode:')} ${date(report.start)} – ${date(report.end)}`);doc.text(`${t('Anleggets tidssone:')} ${report.timezone}`);doc.text(`${t('Generert:')} ${date(report.generatedAt)} | ${report.id}`);doc.text(t(report.simulated?'SIMULERTE DATA':'THINGSBOARD'));
 heading(t('Registrert produksjon i måneden'));row(t('Hele anlegget'),report.site);for(const i of report.inverters)row(i.name,i.period);
 doc.moveDown().fontSize(10).fillColor('#243b53').text(t('Delvise verdier er registrert produksjon, ikke en bekreftet total for hele perioden.'));
 doc.text(t('Anleggstotalen krever data fra alle invertere. Manglende inverterdata erstattes ikke med null.'));
 heading(t('Daglig produksjon')+' · '+t('Hele anlegget'));for(const d of report.days)row(day(d.start),d.site);
 for(const inverter of report.inverters){doc.addPage();heading(t('Daglig produksjon')+' · '+inverter.name);for(const d of report.days)row(day(d.start),d.inverters[inverter.id]);}
 heading(t('Datakvalitet og beregningsgrunnlag'));doc.fontSize(9).fillColor('#243b53').text(t('counter-delta-v1: sorterte og dedupliserte kumulative målinger, maksimalt gap 15 min, nullstillingsintervaller utelatt, ingen antatt tellerovergang. Lineær grenseinterpolasjon kun over gyldige korte intervaller. Ingen sammenligning med hele historiske måneder.'));doc.moveDown().text(t('Dekning viser andelen av perioden med gyldige tellerintervaller. Dagens og månedens dekning måles frem til rapportens tidspunkt.'));
 const pages=doc.bufferedPageRange();for(let n=pages.start;n<pages.start+pages.count;n++){doc.switchToPage(n);doc.fontSize(8).fillColor('#60758b').text(`SolarOps | ${report.month} | ${n+1} / ${pages.count}`,45,doc.page.height-30,{lineBreak:false});}
 doc.end();
}
