import {Injectable,inject,signal} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {defaultPreferences,type AppPreferences} from '../domain/preferences';
@Injectable({providedIn:'root'})
export class Preferences {
 private http=inject(HttpClient);value=signal<AppPreferences>({...defaultPreferences});error=signal('');private server=false;private pending=Promise.resolve();
 configure(value:AppPreferences|undefined,server:boolean){this.server=server;if(value)this.value.set(value);}
 save(patch:Partial<AppPreferences>){if(!this.server){this.value.update(v=>({...v,...patch}));return;}this.pending=this.pending.then(async()=>{try{const saved=await firstValueFrom(this.http.put<AppPreferences>('/api/preferences',patch));this.value.set(saved);this.error.set('');}catch{this.error.set('Innstillingene kunne ikke lagres i .env.');}});}
}
