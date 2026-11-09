import {DOCUMENT} from '@angular/common';
import {inject,Injectable,computed,effect} from '@angular/core';
import {Preferences} from './preferences';
export type ThemeMode='dark'|'light';
@Injectable({providedIn:'root'})
export class Theme {
 private document=inject(DOCUMENT);private preferences=inject(Preferences);readonly mode=computed(()=>this.preferences.value().theme);
 constructor(){effect(()=>{this.document.documentElement.dataset['theme']=this.mode();this.document.documentElement.style.colorScheme=this.mode();});}
 set(mode:ThemeMode){if(mode==='light'||mode==='dark')this.preferences.save({theme:mode});}
}
