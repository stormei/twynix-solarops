import {TranslatePipe} from '../core/locale';
import {Component,computed,inject,input,signal,ChangeDetectionStrategy} from '@angular/core';
import {Store} from '../core/store';
import {Chart,powerOptions} from '../shared/chart';
@Component({selector:'solar-workspace',imports:[TranslatePipe,Chart],templateUrl:'./workspace.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class Workspace {s=inject(Store);section=input('analytics');eventFilter=signal('Alle');names:Record<string,string>={analytics:'Analyse',events:'Hendelser',reports:'Rapporter'};events=computed(()=>this.s.plant()?.events.filter(e=>this.eventFilter()==='Alle'||this.eventFilter()==='Aktive'&&e.active||this.eventFilter()==='Alarmer'&&e.type==='alarm'||this.eventFilter()==='Tilstand'&&e.type==='state')??[]);option=computed(()=>powerOptions([{name:'AC-effekt',color:'#51adff',data:this.s.chartData(this.s.plant()?.history??[])}],'kW',true,this.s.l.locale()));
}
