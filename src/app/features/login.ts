import {loginErrorMessage,missingEndpointMessage} from '../domain/login-error';
import {Component,inject,output,signal,ChangeDetectionStrategy} from '@angular/core';
import {HttpClient,HttpErrorResponse} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {Store} from '../core/store';
import {Theme} from '../core/theme';
import {TranslatePipe} from '../core/locale';
import {Icon} from '../shared/icon';
@Component({selector:'solar-login',imports:[TranslatePipe,Icon],templateUrl:'./login.html',styleUrl:'./login.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class LoginPage {
 s=inject(Store);theme=inject(Theme);private http=inject(HttpClient);setupRequested=output<void>();
 testing=signal(false);connectionTest=signal<{ok:boolean;message:string}|null>(null);busy=signal(false);error=signal('');showPassword=signal(false);
 get needsConnection(){return !this.s.config.configured;}
 get missingEndpoint(){return this.s.config.setupAvailable===true&&this.s.config.endpointConfigured===false;}
 get message(){return this.missingEndpoint?missingEndpointMessage:this.error()||this.s.error();}
 get submitting(){return this.busy()||this.s.authenticating();}
 private async backendIssue(){
  if(this.s.config.setupAvailable===undefined){try{await this.s.refreshConfig();}catch{return loginErrorMessage(0);}}
  if(this.s.config.setupAvailable===false)return 'Denne forhåndsvisningen kan ikke koble til ThingsBoard. Åpne SolarOps på http://localhost:3300.';
  if(this.s.config.setupAvailable!==true)return 'Konfigurasjonen kunne ikke lastes.';
  if(this.missingEndpoint)return missingEndpointMessage;
  this.s.error.set('');return '';
 }
 async testConnection(){
  if(this.testing()||this.submitting||this.missingEndpoint)return;
  this.connectionTest.set(null);
  this.testing.set(true);
  try{const issue=await this.backendIssue();if(issue){this.connectionTest.set({ok:false,message:issue});return;}await firstValueFrom(this.http.post('/api/setup/test-connection',{}));this.connectionTest.set({ok:true,message:'Serveren kan nås. Logg inn for å kontrollere tilgang.'});}
  catch(e){const status=e instanceof HttpErrorResponse?e.status:502,code=e instanceof HttpErrorResponse?e.error?.code:undefined;this.connectionTest.set({ok:false,message:code==='TB_TEST_FAILED'?'Serveren svarer, men ThingsBoard-API-et ble ikke funnet. Kontroller TB_URL i .env.':status===429?'For mange tilkoblingstester. Vent ett minutt og prøv igjen.':code||status===0?loginErrorMessage(status,code):'Kunne ikke teste tilkoblingen. Prøv igjen.'});}
  finally{this.testing.set(false);}
 }
 async submit(form:HTMLFormElement){
  if(this.submitting||this.testing()||this.missingEndpoint)return;this.error.set('');this.s.error.set('');
  // Native form values also support password managers that do not emit input events.
  const fields=new FormData(form),username=String(fields.get('username')??'').trim(),password=String(fields.get('password')??'');
  const missing=!username?'username':!password?'password':null;
  if(missing){this.error.set(missing==='username'?'Skriv inn brukernavn eller e-post.':'Skriv inn passord.');(form.elements.namedItem(missing) as HTMLInputElement|null)?.focus();return;}
  this.busy.set(true);
  try{const issue=await this.backendIssue();if(issue){this.error.set(issue);return;}if(!this.needsConnection){await this.s.login(username,password);if(this.s.plant())form.reset();return;}await firstValueFrom(this.http.post('/api/setup/connect',{username,password}));form.reset();this.showPassword.set(false);this.setupRequested.emit();}
  catch(e){this.error.set(loginErrorMessage(e instanceof HttpErrorResponse?e.status:502,e instanceof HttpErrorResponse?e.error?.code:undefined));}
  finally{this.busy.set(false);}
 }
}
