import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ThingsBoard,ApiError} from '../server/thingsboard.ts';
import {Settings} from '../server/config.ts';
import {operatingState,measurement} from '../src/app/domain/solar.ts';
import {stateHistory,measured,numericSeries,recordedEnergy} from '../server/plant.ts';

const cfg:Settings={url:'http://thingsboard.test',assetId:'',plantId:'main',relation:'Contains',origin:'http://localhost:3300',timezone:'Europe/Oslo',mapping:{acPower:{key:'ACPower',unit:'kW'}},states:{},verified:true,staleMs:120000,version:'4.4.0',historyPath:'/history',devicePrefix:'Twynix Solar - ',plantName:'Twynix Solar Farm'};

test('4.4 history and preceding state use the installed /history endpoint',async()=>{
 const urls:URL[]=[];const tb=new ThingsBoard(cfg,'user-jwt',async(input)=>{urls.push(new URL(String(input)));return Response.json({});});
 await tb.history('inv1',['ACPower','DCPower'],100,200,'AVG',500,60000);await tb.preceding('inv1','OperatingState',100);
 assert.ok(urls.every(u=>u.pathname.endsWith('/values/timeseries/history')));
 assert.equal(urls[0].searchParams.get('keys'),'ACPower,DCPower');assert.equal(urls[1].searchParams.get('orderBy'),'DESC');assert.equal(urls[1].searchParams.get('limit'),'1');
});
test('authorized prefix discovery excludes unrelated equipment and separates roles',async()=>{
 const names=['Twynix Solar - INV-101','Twynix Solar - INV-102','Twynix Solar - INV-103','Twynix Solar - PV-101','Twynix Solar - GM-101','Twynix Solar - Simulation','Other Plant - INV-1'];
 let calls=0;const tb=new ThingsBoard(cfg,'operator-jwt',async(input,options)=>{calls++;const url=new URL(String(input));assert.equal(url.pathname,'/api/user/devices');assert.equal((options?.headers as Record<string,string>)['X-Authorization'],'Bearer operator-jwt');return Response.json({data:names.map((name,k)=>({id:{id:String(k),entityType:'DEVICE'},name})),hasNext:false});});
 const d=await tb.discover();assert.equal(d.devices.length,3);assert.equal(d.arrays.length,1);assert.equal(d.meter?.name,'Twynix Solar - GM-101');assert.equal(d.controller?.name,'Twynix Solar - Simulation');assert.equal(d.all.length,6);assert.equal(d.asset.id.entityType,'SITE');await tb.discover();assert.equal(calls,1);
});
test('prefix discovery does not turn forbidden device access into an empty plant',async()=>{
 const tb=new ThingsBoard(cfg,'expired',async()=>new Response('',{status:403}));await assert.rejects(()=>tb.discover(),(e:unknown)=>e instanceof ApiError&&e.status===403);
});
test('unmapped numeric codes use run feedback without claiming MPPT',()=>{
 assert.equal(operatingState(4,{},true,false),'running');assert.equal(operatingState(4,{},false,false),'stopped');assert.equal(operatingState(4,{},undefined,false),'unknown');assert.equal(operatingState(4,{},true,true),'fault');assert.equal(operatingState(4,{'4':'mppt'},true,false),'mppt');
});
test('historical categorical state combines preceding feedback with fault transitions',()=>{
 const mapping={operatingState:{key:'OperatingState',unit:''},runFeedback:{key:'RunFeedback',unit:''},faultActive:{key:'FaultActive',unit:''}};
 const result=stateHistory({OperatingState:[{ts:0,value:'4.0'}],RunFeedback:[{ts:0,value:'false'},{ts:100,value:'true'}],FaultActive:[{ts:0,value:'false'},{ts:200,value:'true'}]},mapping,{});
 assert.deepEqual(result,[{ts:0,state:'stopped'},{ts:100,state:'running'},{ts:200,state:'fault'}]);
});
test('simulator power and line-line voltage retain their actual engineering units',()=>{
 const power=measured({ACPower:[{ts:100,value:'7.505'}]},{key:'ACPower',unit:'kW'},'kW',100,120000);assert.equal(power.value,7.505);
 assert.equal(measured({ACVoltage:[{ts:100,value:'400'}]},{key:'ACVoltage',unit:'V'},'V',100,120000).value,400);
 assert.equal(measured({},undefined,'V',100,120000).value,null);
});
test('missing telemetry remains a chart gap and never becomes zero',()=>{
 const points=numericSeries({ACPower:[{ts:0,value:0},{ts:60,value:null},{ts:120,value:'invalid'}]},{key:'ACPower',unit:'kW'},'kW',90);
 assert.deepEqual(points,[{ts:0,value:0},{ts:60,value:null},{ts:120,value:null}]);
});
test('recorded energy explicitly preserves partial coverage and reset warnings',()=>{
 const e=recordedEnergy([{ts:10,value:0},{ts:20,value:6},{ts:30,value:1},{ts:40,value:5}],0,40);
 assert.equal(e.value,10);assert.equal(e.coverage,.5);assert.equal(e.start,10);assert.ok(e.issues.includes('counter reset'));assert.ok(e.issues.includes('incomplete coverage'));
});
test('raw history fails rather than certify a truncated counter query',async()=>{
 const tb=new ThingsBoard(cfg,'token',async()=>Response.json({Energy:Array.from({length:10000},(_,ts)=>({ts,value:ts}))}));await assert.rejects(()=>tb.rawHistory('i',['Energy'],0,100),/Sample limit/);
});

test('numeric ThingsBoard state strings normalize without inventing mappings',()=>{
 assert.equal(operatingState('4.0',{'4':'mppt'},true,false),'mppt');
 assert.equal(operatingState('4.0',{},true,false),'running');
});

test('plant query exposes actual three-inverter site aggregates and partial energy provenance',async()=>{
 const {PlantService}=await import('../server/plant.ts');const now=Date.now(),first=now-3600000;
 const device=(name:string,id:string)=>({id:{id,entityType:'DEVICE'},name,createdTime:first});
 const entities=[device('Twynix Solar - INV-101','i1'),device('Twynix Solar - INV-102','i2'),device('Twynix Solar - INV-103','i3'),device('Twynix Solar - PV-101','p1'),device('Twynix Solar - GM-101','grid'),device('Twynix Solar - Simulation','sim')];
 const mapping={...cfg.mapping,dcPower:{key:'DCPower',unit:'kW'},dcVoltage:{key:'DCVoltage',unit:'V'},dcCurrent:{key:'DCCurrent',unit:'A'},lifetimeEnergy:{key:'Energy',unit:'kWh'},operatingState:{key:'OperatingState',unit:''},runFeedback:{key:'RunFeedback',unit:''},faultActive:{key:'FaultActive',unit:''},acVoltage:{key:'ACVoltage',unit:'V'}};
 const siteMapping={acPower:{key:'SolarACPower',unit:'kW'},dcPower:{key:'SolarDCPower',unit:'kW'},energy:{key:'SolarEnergy',unit:'kWh'},gridExport:{key:'GridExportPower',unit:'kW'},irradiance:{key:'WeatherIrradiance',unit:'W/m²'},airTemperature:{key:'WeatherTemperature',unit:'°C'},cloudCover:{key:'WeatherCloudCover',unit:'%'}};
 const values:Record<string,string|number|boolean>={ACPower:7.5,DCPower:7.6,DCVoltage:732,DCCurrent:10.4,ACVoltage:400,Energy:3,OperatingState:'4.0',RunFeedback:true,FaultActive:false,SolarACPower:25.7,SolarDCPower:26.1,SolarEnergy:10,GridExportPower:15.7,WeatherIrradiance:53,WeatherTemperature:6.6,WeatherCloudCover:57};
 const tb=new ThingsBoard({...cfg,mapping,siteMapping,simulated:true},'authorized-user',async(input)=>{
  const u=new URL(String(input));
  if(u.pathname==='/api/user/devices')return Response.json({data:entities,hasNext:false});
  if(u.pathname.includes('/values/attributes'))return Response.json([{key:'active',value:true}]);
  if(u.pathname.startsWith('/api/alarm/'))return Response.json({data:[],hasNext:false});
  const keys=u.searchParams.get('keys')!.split(',');
  if(u.pathname.endsWith('/history')){
   if(u.searchParams.get('orderBy')==='DESC')return Response.json({});
   const from=Number(u.searchParams.get('startTs')),end=Number(u.searchParams.get('endTs'));
   return Response.json(Object.fromEntries(keys.map(key=>[key,[{ts:first,value:key==='Energy'||key==='SolarEnergy'?0:values[key]},{ts:now-1000,value:values[key]}].filter(p=>p.ts>=from&&p.ts<=end)])));
  }
  return Response.json(Object.fromEntries(keys.filter(k=>k in values).map(key=>[key,[{ts:now-1000,value:values[key]}]])));
 });
 const p=await new PlantService(tb).query();assert.equal(p.inverters.length,3);assert.equal(p.demo,false);assert.equal(p.source?.simulated,true);assert.equal(p.site?.ac.value,25.7);assert.equal(p.site?.gridExport.value,15.7);assert.equal(p.site?.irradiance.value,53);assert.equal(p.inverters[0].state,'running');assert.equal(p.inverters[0].telemetryMapping?.acPower.key,'ACPower');assert.equal(p.inverters[0].stateTimestamp,now-1000);assert.equal(p.inverters[0].staleAfterMs,cfg.staleMs);assert.equal(p.inverters[0].phases['AC spenning L–L'].value,400);assert.equal(p.inverters[0].phases['L1–N spenning'].value,null);assert.equal(p.timestamp,now-1000);assert.ok(p.recordedEnergy!.coverage<1);assert.ok(p.recordedEnergy!.issues.includes('missing samples'));
});
