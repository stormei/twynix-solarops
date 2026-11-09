import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translateMessage} from '../src/app/core/translate.ts';
import {english} from '../src/app/core/translations.ts';

test('English translates operational labels and retains Norwegian source text',()=>{
  assert.equal(translateMessage('Foreldede data','en'),'Stale data');
  assert.equal(translateMessage('Foreldede data','nb'),'Foreldede data');
  assert.equal(translateMessage('good','nb'),'God');
});
test('count placeholders and surrounding whitespace survive language changes',()=>{
  assert.equal(translateMessage('{count} / {total} invertere · delsum','en',{count:12,total:13}),'12 / 13 inverters · subtotal');
  assert.equal(translateMessage(' · Simulert historikk ','en'),' · Simulated history ');
});
test('unknown entity names and native alarm messages remain unchanged',()=>{
  for(const text of ['KACO blueplanet','Solparken','Main Plant / INV-03','Vendor alarm code: 17'])assert.equal(translateMessage(text,'en'),text);
  assert.equal(translateMessage(null,'en'),'');
});
test('every authored static template translation has an English catalog entry',()=>{
  const identity=new Set(['ϟ SolarOps','SOLAROPS /']);
  for(const file of ['src/app/app.html','src/app/features/login.html','src/app/features/overview.html','src/app/features/detail.html','src/app/features/workspace.html','src/app/features/reports.html','src/app/features/create-installation.html','src/app/features/setup.html','src/app/features/single-line.html']){
    const html=readFileSync(file,'utf8');
    for(const match of html.matchAll(/'([^']+)'\s*\|\s*t/g))assert.ok(english[match[1]]||identity.has(match[1]),`Missing translation: ${match[1]}`);
  }
});
