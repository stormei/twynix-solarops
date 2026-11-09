import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPanelWidths,fitPanelWidths} from '../src/app/domain/editor-panels.ts';
test('panel preferences restore valid widths and reject malformed or unsupported stored data',()=>{
 assert.deepEqual(readPanelWidths('{"version":1,"left":286,"right":375}',1280),{left:286,right:375});
 assert.deepEqual(readPanelWidths('broken',1280),{left:210,right:310});
 assert.deepEqual(readPanelWidths('{"version":2,"left":286,"right":375}',1280),{left:210,right:310});
 assert.deepEqual(readPanelWidths('{"version":1,"left":"300","right":9000}',1280),{left:210,right:520});
});
test('restored panel widths leave canvas space on smaller screens without changing preferences',()=>{
 const saved={left:420,right:520};const effective=fitPanelWidths(saved,900,true,true);
 assert.ok(effective.left>=160&&effective.right>=240);
 assert.ok(900-effective.left-effective.right-12>=320);
 assert.deepEqual(saved,{left:420,right:520});
 assert.deepEqual(fitPanelWidths(saved,1600,true,true),saved);
});
test('hidden panels do not reserve drawing space',()=>{
 const saved={left:290,right:370};
 assert.deepEqual(fitPanelWidths(saved,1000,false,true),{left:0,right:370});
 assert.deepEqual(fitPanelWidths(saved,1000,true,false),{left:290,right:0});
 assert.deepEqual(fitPanelWidths(saved,1000,false,false),{left:0,right:0});
});
