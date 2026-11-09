import {Injectable,signal} from '@angular/core';
import type {EquipmentClipboard} from '../domain/installation-clipboard';
// Private editor clipboard; never exports device configuration to the OS clipboard.
@Injectable({providedIn:'root'})
export class EditorClipboard {value=signal<EquipmentClipboard|null>(null);}
