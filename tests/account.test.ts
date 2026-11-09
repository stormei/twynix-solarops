import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountProfile} from '../server/account.ts';
test('account profile returns only ThingsBoard display fields',()=>{
 assert.deepEqual(accountProfile({firstName:'  Ada ',lastName:' Solar ',email:' ada@example.test ',id:'private-id',additionalInfo:{secret:'private'},password:'private'}),{name:'Ada Solar',email:'ada@example.test'});
});
test('missing and malformed account details are not invented',()=>{
 assert.deepEqual(accountProfile({email:'operator@example.test'}),{name:null,email:'operator@example.test'});
 assert.deepEqual(accountProfile({firstName:' Ada ',lastName:null,email:42}),{name:'Ada',email:null});
 for(const input of [null,{}, {firstName:[],lastName:{},email:'  '}])assert.deepEqual(accountProfile(input),{name:null,email:null});
});
