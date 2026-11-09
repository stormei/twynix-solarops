import {energy,type Point,type RecordedEnergy} from './solar.js';
export function recordedPeriod(points:Point[],start:number,end:number):RecordedEnergy {
 const result=energy(points,start,end),valid=points.filter(p=>p.value!==null&&Number.isFinite(p.value)&&p.ts>=start&&p.ts<=end).sort((a,b)=>a.ts-b.ts);
 return {value:result.value,coverage:result.coverage,start:valid[0]?.ts??null,end:valid.at(-1)?.ts??null,issues:result.issues};
}
export function sumRecorded(periods:(RecordedEnergy|undefined)[]):RecordedEnergy {
 const known=periods.filter((p):p is RecordedEnergy=>!!p),complete=periods.length>0&&known.length===periods.length&&known.every(p=>p.value!==null);
 return {value:complete?known.reduce((v,p)=>v+p.value!,0):null,coverage:known.length===periods.length&&known.length?Math.min(...known.map(p=>p.coverage)):0,start:known.length&&known.every(p=>p.start!==null)?Math.min(...known.map(p=>p.start!)):null,end:known.length&&known.every(p=>p.end!==null)?Math.max(...known.map(p=>p.end!)):null,issues:[...new Set([...known.flatMap(p=>p.issues),...(!complete?['incomplete inverter coverage']:[])])]};
}
export function completeEnergy(period:RecordedEnergy|undefined){return !!period&&period.value!==null&&period.coverage>=.999&&!period.issues.length;}
