import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WebSocketServer} from 'ws';
import {LiveConnection} from '../server/live.ts';
import {demoPlant} from '../src/app/core/demo.ts';
import type {PlantService} from '../server/plant.ts';
import type {Response} from 'express';

class BrowserStream extends EventEmitter {messages:string[]=[];write(value:string){this.messages.push(value);return true;}end(){this.emit('close');}}

test('one authenticated WebSocket serves multiple browser clients and closes cleanly',async()=>{
 const server=new WebSocketServer({port:0,host:'127.0.0.1'});
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const port=(server.address() as {port:number}).port;
 let connections=0;let command:any;let queries=0;
 server.on('connection',ws=>{connections++;ws.on('message',data=>{command=JSON.parse(String(data));ws.send(JSON.stringify({cmdId:1,errorCode:0,cmdUpdateType:'ENTITY_DATA',data:{data:[]}}));});});
 const service={last:demoPlant(),tb:{token:'fake-token-only',config:{url:`http://127.0.0.1:${port}`,mapping:{ac:{key:'ACPower'}},siteMapping:{ac:{key:'SolarACPower'}}},ingestLive:()=>{},setLiveReady:()=>{},discover:async()=>({all:[{id:{id:'inv'}},{id:{id:'site'}}]})},query:async()=>{queries++;return demoPlant();}} as unknown as PlantService;
 const live=new LiveConnection(service,Date.now()+60000),a=new BrowserStream(),b=new BrowserStream();
 try{
  live.add(a as unknown as Response);live.add(b as unknown as Response);
  const deadline=Date.now()+3000;while((live.diagnostics.state!=='connected'||queries===0)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
  assert.equal(connections,1);assert.equal(command.authCmd.token,'fake-token-only');assert.deepEqual(command.cmds[0].query.entityFilter.entityList,['inv','site']);assert.deepEqual(command.cmds[0].latestCmd.keys.map((k:any)=>k.key),['ACPower','SolarACPower','active']);assert.equal(live.diagnostics.state,'connected');assert.ok(live.diagnostics.receivedMessages>0);assert.ok(queries>0);assert.ok(a.messages.length>0);assert.ok(b.messages.length>0);
 }finally{live.stop();for(const ws of server.clients)ws.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 assert.equal(live.closed,true);
});

test('pushed telemetry and active attributes reach browsers without a latest REST poll',async()=>{
 const {ThingsBoard}=await import('../server/thingsboard.ts');
 const {settings}=await import('../server/config.ts');
 const server=new WebSocketServer({port:0,host:'127.0.0.1'});
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const port=(server.address() as {port:number}).port,now=Date.now();let socket:any;let restCalls=0;
 server.on('connection',ws=>{socket=ws;ws.on('message',()=>ws.send(JSON.stringify({cmdId:1,errorCode:0,data:{data:[{entityId:{id:'inv'},latest:{TIME_SERIES:{ACPower:{ts:now,value:'10'}},ATTRIBUTE:{active:{ts:now,value:'false'}}}}]}})));});
 const tb=new ThingsBoard({...settings(),url:`http://127.0.0.1:${port}`,mapping:{acPower:{key:'ACPower',unit:'kW'}},siteMapping:{}},'fake-token',async()=>{restCalls++;return Response.json([{key:'model',value:'test'}]);});
 tb.discover=async()=>({asset:{id:{id:'main',entityType:'SITE'},name:'Test'},devices:[],arrays:[],all:[{id:{id:'inv',entityType:'DEVICE'},name:'Test inverter'}]});
 const service={last:demoPlant(),tb,query:async()=>{
  const p=demoPlant(),latest=await tb.latest('inv'),attrs=await tb.attributes('inv');
  p.inverters[0].ac={value:Number(latest.ACPower[0].value),timestamp:latest.ACPower[0].ts,quality:'good'};
  p.inverters[0].connected=attrs.find(a=>a.key==='active')?.value==='true';return p;
 }} as unknown as PlantService;
 const live=new LiveConnection(service,Date.now()+60000),browser=new BrowserStream();
 const wait=async(test:()=>boolean)=>{const deadline=Date.now()+3000;while(!test()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));assert.ok(test());};
 try{
  live.add(browser as unknown as Response);
  await wait(()=>browser.messages.some(m=>m.includes('"value":10,"timestamp"')));
  const calls=restCalls;
  socket.send(JSON.stringify({cmdId:1,errorCode:0,update:[{entityId:{id:'inv'},latest:{TIME_SERIES:{ACPower:{ts:now+1000,value:'25'}},ATTRIBUTE:{active:{ts:now+1000,value:'true'}}}}]}));
  await wait(()=>browser.messages.some(m=>m.includes('"value":25,"timestamp"')));
  const latest=browser.messages.filter(m=>m.startsWith('data: ')).at(-1)!;
  const plant=JSON.parse(latest.slice(6));assert.equal(plant.inverters[0].connected,true);assert.equal(plant.connection.state,'connected');assert.equal(restCalls,calls);
  // Delayed packets must not replace a newer measurement.
  tb.ingestLive([{entityId:{id:'inv'},latest:{TIME_SERIES:{ACPower:{ts:now,value:'1'}}}}]);
  assert.equal((await tb.latest('inv')).ACPower[0].value,'25');
 }finally{live.stop();for(const ws of server.clients)ws.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
