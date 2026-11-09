import {Component,input,output,computed,signal,ChangeDetectionStrategy} from '@angular/core';
import {TranslatePipe} from '../core/locale';
import type {InstallationNode} from '../domain/installation';
import {stringPower} from '../domain/inverter';
@Component({selector:'inverter-topology',imports:[TranslatePipe],templateUrl:'./inverter-topology.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class InverterTopology {
 nodes=input.required<InstallationNode[]>();selected=input('');editable=input(false);configure=output<string>();selectString=output<string>();
 inverter=computed(()=>{const n=this.nodes().find(n=>n.id===this.selected());const id=n?.role==='inverter'?n.id:n?.role==='pvString'?n.feedsTo:undefined;return this.nodes().find(n=>n.id===id);});
 strings=computed(()=>this.nodes().filter(n=>n.role==='pvString'&&n.feedsTo===this.inverter()?.id));
 selectedString=computed(()=>this.strings().find(n=>n.id===this.selected())??null);
 rows=computed(()=>{const inv=this.inverter();if(!inv?.inverterConfig)return [];return inv.inverterConfig.mppts.flatMap(m=>m.inputs.flatMap(i=>{const linked=this.strings().filter(n=>n.stringConfig?.mpptId===m.id&&n.stringConfig?.inputId===i.id);return (linked.length?linked:[null]).map(n=>({mppt:m,input:i,node:n}));})).map((r,index)=>({...r,y:55+index*110}));});
 height=computed(()=>Math.max(180,this.rows().length*110+40));
 trackers=computed(()=>this.inverter()?.inverterConfig?.mppts.map(m=>{const ys=this.rows().filter(r=>r.mppt.id===m.id).map(r=>r.y);return {mppt:m,y:ys.length?ys.reduce((a,b)=>a+b)/ys.length:55};})??[]);
 mapped(mapping:object){return Object.keys(mapping).length;}
 trackerPath(id:string,y:number){return this.rows().filter(r=>r.mppt.id===id).map(r=>'M 620 '+r.y+' V '+y+' H 650').join(' ');}
 power=stringPower;name(n:InstallationNode){return n.label||n.name;}
 truncate(name:string,max:number){return name.length>max?name.slice(0,max-1)+'…':name;}
 short(name:string){return name.length>28?name.slice(0,26)+'…':name;}
 panels(n:InstallationNode){return Array.from({length:Math.min(100,n.stringConfig?.moduleCount??0)},(_,i)=>i+1);}
}
