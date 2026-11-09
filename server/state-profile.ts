import type {Entity} from './thingsboard.ts';
import type {State} from '../src/app/domain/solar.ts';
// Verified against factory-simulator stepSolar and docs/solar-opcua.md.
// These meanings apply only to that explicit simulation profile, not arbitrary KACO devices.
export function validatedStates(entity:Entity,fallback:Record<string,State>):Record<string,State>{
 const metadata=entity.solarops,profile:Record<string,State>=metadata?.solaropsIntegrationProfile==='twynix-solar-v1'&&metadata.dataSourceKind==='simulation'?{'1':'stopped','2':'standby','3':'startup','4':'running','5':'throttled','7':'fault','8':'standby'}:{};
 return {...profile,...(metadata?.solaropsStateMapping??fallback)};
}
