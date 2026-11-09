import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EncryptedSessionStore} from '../server/session-store.ts';
import type {SessionData} from 'express-session';

test('sessions survive a server restart while tokens remain encrypted on disk',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'solarops-session-test-'));
 try{
  const first=new EncryptedSessionStore(directory,'test-secret-only');
  const data={token:'fake-user-jwt-for-test',expires:Date.now()+60000,cookie:{expires:new Date(Date.now()+60000),maxAge:60000,httpOnly:true,sameSite:'strict'}} as SessionData;
  await new Promise<void>((resolve,reject)=>first.set('session-id-for-test',data,e=>e?reject(e):resolve()));
  const files=await readdir(directory);const encrypted=await readFile(path.join(directory,files[0]),'utf8');assert.ok(!encrypted.includes(data.token));assert.ok(!encrypted.includes('session-id-for-test'));
  const restarted=new EncryptedSessionStore(directory,'test-secret-only');
  const restored=await new Promise<SessionData|null|undefined>((resolve,reject)=>restarted.get('session-id-for-test',(e,v)=>e?reject(e):resolve(v)));
  assert.equal(restored?.token,data.token);
  await new Promise<void>((resolve,reject)=>restarted.destroy('session-id-for-test',e=>e?reject(e):resolve()));assert.equal((await readdir(directory)).length,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('expired sessions are removed and a different secret cannot decrypt them',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'solarops-session-test-'));
 try{
  const store=new EncryptedSessionStore(directory,'secret-a');
  await new Promise<void>((resolve,reject)=>store.set('expired',{token:'test-token',expires:0,cookie:{expires:new Date(Date.now()-1000)}} as SessionData,e=>e?reject(e):resolve()));
  const expired=await new Promise((resolve,reject)=>store.get('expired',(e,v)=>e?reject(e):resolve(v)));assert.equal(expired,null);
  await new Promise<void>((resolve,reject)=>store.set('fresh',{token:'test-token',expires:Date.now()+60000,cookie:{expires:new Date(Date.now()+60000)}} as SessionData,e=>e?reject(e):resolve()));
  const wrong=new EncryptedSessionStore(directory,'secret-b');await assert.rejects(()=>new Promise((resolve,reject)=>wrong.get('fresh',(e,v)=>e?reject(e):resolve(v))));
 }finally{await rm(directory,{recursive:true,force:true});}
});
