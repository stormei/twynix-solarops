import '@angular/compiler';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signal} from '@angular/core';
import {of} from 'rxjs';
import {LoginPage} from '../src/app/features/login.ts';
function page(available?:boolean){
 const p=Object.create(LoginPage.prototype) as LoginPage;const requests:string[]=[];
 const store={config:{setupAvailable:available},authenticating:signal(false),error:signal('Configuration failed'),refreshConfig:async()=>{requests.push('configuration');store.config.setupAvailable=true;}};
 Object.assign(p,{s:store,testing:signal(false),connectionTest:signal(null),busy:signal(false),error:signal(''),http:{post:(url:string)=>{requests.push(url);return of({reachable:true});}}});
 return {p,store,requests};
}
test('a failed initial config request is retried before testing ThingsBoard',async()=>{
 const {p,store,requests}=page();await p.testConnection();assert.deepEqual(requests,['configuration','/api/setup/test-connection']);assert.equal(p.connectionTest()?.ok,true);assert.equal(store.error(),'');assert.equal(p.testing(),false);
});
test('an unavailable backend does not become a preview message or send a connection test',async()=>{
 const {p,store,requests}=page();store.refreshConfig=async()=>{throw Error('offline');};await p.testConnection();assert.deepEqual(requests,[]);assert.match(p.connectionTest()!.message,/SolarOps-serveren/);assert.equal(p.testing(),false);
});
test('only an explicitly declared static preview shows the local app instruction',async()=>{
 const {p,requests}=page(false);await p.testConnection();assert.deepEqual(requests,[]);assert.match(p.connectionTest()!.message,/http:\/\/localhost:3300/);
});
