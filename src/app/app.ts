import {LoginPage} from './features/login';
import {SetupWizard} from './features/setup';
import {TranslatePipe} from './core/locale';
import {Component,inject,signal,ChangeDetectionStrategy,computed} from '@angular/core';
import {RouterOutlet,RouterLink,RouterLinkActive,Router,NavigationEnd} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Store} from './core/store';
import {Icon} from './shared/icon';
import {Theme} from './core/theme';
@Component({selector:'solar-app',imports:[TranslatePipe,RouterOutlet,RouterLink,RouterLinkActive,Icon,SetupWizard,LoginPage],templateUrl:'./app.html',changeDetection:ChangeDetectionStrategy.OnPush})
export class AppComponent {s=inject(Store);theme=inject(Theme);modal=signal<'settings'|'notifications'|'help'|'reset'|null>(null);menu=signal(false);setup=signal(false);nav=[['grid','Oversikt','overview'],['inverter','Invertere','inverters'],['chart','Analyse','analytics'],['bell','Hendelser','events'],['file','Rapporter','reports']];router=inject(Router);url=signal(this.router.url);page=computed(()=>this.url().includes('/installation')?'Installasjonseditor':this.url().match(/\/inverters\//)?'Inverterdetaljer':this.nav.find(n=>this.url().includes('/'+n[2]))?.[1]??'Oversikt');section=computed(()=>this.url().includes('/installation')?'Konfigurasjon':'Overvåking');constructor(){if(this.router.url.includes('setup=1')){this.setup.set(true);void this.router.navigateByUrl('/plants/main/overview',{replaceUrl:true});}this.router.events.pipe(takeUntilDestroyed()).subscribe(e=>{if(e instanceof NavigationEnd){this.url.set(e.urlAfterRedirects);if(e.urlAfterRedirects.includes('setup=1')){this.setup.set(true);void this.router.navigateByUrl(e.urlAfterRedirects.split('?')[0],{replaceUrl:true});}}});}logoutBusy=signal(false);logoutError=signal('');
 requestLogout(menu:HTMLElement,dialog:HTMLDialogElement){menu.hidePopover();this.logoutError.set('');dialog.showModal();}
 async confirmLogout(dialog:HTMLDialogElement){if(this.logoutBusy())return;this.logoutBusy.set(true);this.logoutError.set('');try{await this.s.logout();dialog.close();this.modal.set(null);this.menu.set(false);}catch{this.logoutError.set('Kunne ikke logge ut. Prøv igjen.');}finally{this.logoutBusy.set(false);}}
 async restartSetup(){try{await this.s.resetSetup();this.modal.set(null);this.setup.set(true);}catch{this.s.error.set('Kunne ikke tilbakestille tilkoblingen. Prøv igjen.');}}}
