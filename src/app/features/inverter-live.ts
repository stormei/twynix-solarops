import {inverterMode,inverterCommunication} from '../domain/operations';
import {Component,computed,inject,input,signal,DestroyRef,ChangeDetectionStrategy} from '@angular/core';
import {Store} from '../core/store';
import {TranslatePipe} from '../core/locale';
import {inverterReading,liveInverterFields,sameTelemetryMapping} from '../domain/inverter-live';
import {stateNames} from '../domain/solar';
import type {InstallationNode} from '../domain/installation';
@Component({selector:'inverter-live',imports:[TranslatePipe],templateUrl:'./inverter-live.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class InverterLive {
 node=input.required<InstallationNode>();s=inject(Store);now=signal(Date.now());fields=liveInverterFields;names=stateNames;
 inverter=computed(()=>this.s.inverters().find(n=>n.id===this.node().id));
 mode=computed(()=>inverterMode(this.inverter(),this.now()));communication=computed(()=>inverterCommunication(this.inverter()));
 pendingMapping=computed(()=>{const saved=this.inverter()?.telemetryMapping;return !!saved&&!sameTelemetryMapping(saved,this.node().mapping);});
 constructor(){const timer=setInterval(()=>this.now.set(Date.now()),1000);inject(DestroyRef).onDestroy(()=>clearInterval(timer));}
 reading(field:string){return inverterReading(this.inverter(),field,this.now());}
 key(field:string){return this.inverter()?.telemetryMapping?.[field]?.key??'';}
 stamp(ts:number|null|undefined){return ts===null||ts===undefined?'—':new Intl.DateTimeFormat(this.s.l.locale(),{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:this.s.config.timezone}).format(ts);}
}
