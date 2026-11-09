// Solar artwork reused from factory-simulator/apps/web/src/glyph.html and _equipment.scss.
import {Component,input,computed,ChangeDetectionStrategy} from '@angular/core';
@Component({selector:'svg[solarEquipmentGlyph]',templateUrl:'./equipment-glyph.html',host:{viewBox:'0 0 120 120','aria-hidden':'true'},styles:[`:host{display:inline-block;pointer-events:none}.glyph-art{color:#c7c2b6;stroke:#6f7c86;stroke-width:.8;stroke-linecap:butt;stroke-linejoin:miter}
.glyph-art .frame-member {
  fill: none;
  stroke: #6b7b86;
  stroke-width: 2.4;
}
.glyph-art .guard-rail {
  fill: none;
  stroke: #6c7e8b;
  stroke-width: 1.2;
}
.glyph-art .solar-frame {
  fill: #c8d1d7;
  stroke: #667a88;
  stroke-width: 1;
}
.glyph-art .solar-module {
  fill: #244b66;
  stroke: #839cae;
  stroke-width: 0.7;
}
.glyph-art .solar-cell-line {
  fill: none;
  stroke: #7893a7;
  stroke-width: 0.45;
}
.glyph-art .cabinet-panel {
  fill: #e6ebee;
  stroke: #71818d;
}
.glyph-art .inverter-header {
  fill: #e9edf0;
  stroke: #9baab4;
  stroke-width: 0.6;
}
.glyph-art .inverter-brand {
  fill: #415461;
  font: 600 9px sans-serif;
  letter-spacing: 0.5px;
}
.glyph-art .panel-seam {
  fill: none;
  stroke: #b0bcc4;
  stroke-width: 0.6;
}
.glyph-art .drive-fin {
  fill: none;
  stroke: #9ba9b3;
  stroke-width: 0.8;
}
.glyph-art .nameplate {
  fill: #f9fafb;
  stroke: #b3bfc8;
  stroke-width: 0.5;
}
.glyph-art .electrical-wire {
  fill: none;
  stroke: #526a7b;
  stroke-width: 1.4;
}
.glyph-art .equipment-engraving {
  fill: #677f8f;
  stroke: none;
  font:
    500 4.8px ui-monospace,
    monospace;
  letter-spacing: 0.35px;
}
.glyph-art .stack-light {
  fill: #bcc7cf;
  stroke: #8395a3;
  stroke-width: 0.6;
}
.glyph-art .stack-light.energized {
  fill: #699b85;
}
.glyph-art .stack-light.tripped {
  fill: #b77563;
}
.glyph-art .hmi-bezel {
  fill: #364b58;
  stroke: #7b8d98;
  stroke-width: 0.7;
}
.glyph-art .meter-screen {
  fill: #e1e9df;
  stroke: #95a28f;
  stroke-width: 0.6;
}
.glyph-art .meter-digits {
  fill: #304a3c;
  font: 600 13px monospace;
}
.glyph-art .vent-line {
  fill: none;
  stroke: #a4b1ba;
  stroke-width: 0.6;
}`],changeDetection:ChangeDetectionStrategy.OnPush})
export class EquipmentGlyph {role=input('inverter');running=input(false);fault=input(false);kind=computed(()=>['pvArray','pvString','solar-panel'].includes(this.role())?'pv-array':this.role()==='inverter'?'kaco-inverter':['gridMeter','productionMeter','grid-meter'].includes(this.role())?'grid-meter':'asset');}
