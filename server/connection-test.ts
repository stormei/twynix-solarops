import {ApiError} from './thingsboard.ts';

// Test HTTP reachability only. Never use a session token or submitted credentials.
export async function testThingsBoardConnection(url:string,transport:typeof fetch=fetch){
 let response:Response;
 try{response=await transport(url+'/api/auth/user',{method:'GET',headers:{Accept:'application/json'},redirect:'error',credentials:'omit',signal:AbortSignal.timeout(8000)});}
 catch{throw new ApiError(502,'Cannot reach the configured ThingsBoard server','TB_UNREACHABLE');}
 await response.body?.cancel().catch(()=>{});
 if(response.ok||[401,403].includes(response.status))return {reachable:true as const};
 if(response.status>=500||response.status===429)throw new ApiError(502,'ThingsBoard server unavailable','TB_UNAVAILABLE');
 throw new ApiError(502,'The configured server responded, but the ThingsBoard API could not be reached','TB_TEST_FAILED');
}
