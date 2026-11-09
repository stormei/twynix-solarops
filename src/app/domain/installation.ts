import type {State} from './solar.js';
import type {InverterConfiguration,StringConfiguration} from './inverter.js';
import type {DiagramLayout} from './diagram.js';
import type {FieldMapping} from './commission.js';
export interface InstallationNode {id:string;entityType:'ASSET'|'DEVICE';name:string;label:string;role:string;equipmentKey:string;parentId:string|null;mapping:Record<string,FieldMapping>;stateMapping?:Record<string,State>;feedsTo:string|null;measurementDeviceId?:string;gridSignConfirmed?:boolean;isNew?:boolean;inverterConfig?:InverterConfiguration;stringConfig?:StringConfiguration}
export interface InstallationDraft {assetId:string;baseline:string;timezone:string;nodes:InstallationNode[];layout?:DiagramLayout}
export interface InstallationChange {kind:'createAsset'|'updateAsset'|'updateDevice'|'metadata'|'addRelation'|'removeRelation'|'profile'|'layout';target:string;description:string;before?:unknown;after?:unknown}
export interface InstallationReview {id:string;digest:string;expiresAt:number;canSave:boolean;issues:{severity:'error'|'warning';entity:string;message:string}[];changes:InstallationChange[];counts:{assets:number;devicesAdded:number;updates:number;linksAdded:number;linksRemoved:number}}
export interface InstallationContext {url:string;canEdit:boolean;siteName:string;draft:InstallationDraft;sites:{id:string;name:string}[];devices:{id:{id:string};name:string;label?:string}[];issues:{severity:string;entity:string;message:string}[]}
