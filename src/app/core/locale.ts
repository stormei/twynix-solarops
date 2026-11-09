import {Preferences} from './preferences';
import {DOCUMENT} from '@angular/common';
import {inject, Injectable, Pipe, PipeTransform, effect, computed} from '@angular/core';
import {Language, translateMessage, TranslationParams} from './translate';

@Injectable({providedIn: 'root'})
export class Locale {
  private readonly document = inject(DOCUMENT);
  private readonly preferences=inject(Preferences);
  readonly language = computed<Language>(()=>this.preferences.value().language);
  readonly locale = computed(() => this.language() === 'en' ? 'en-GB' : 'nb-NO');

  constructor() { effect(()=>this.apply()); }

  set(language:string):void { if(language==='nb'||language==='en')this.preferences.save({language}); }

  t(value: unknown, params?: TranslationParams): string {
    return translateMessage(value, this.language(), params);
  }

  private apply(): void {
    this.document.documentElement.lang = this.language();
    this.document.title = this.language() === 'en' ? 'SolarOps — Solar monitoring & analytics' : 'SolarOps — Solenergi, i oversikt';
  }
}

@Pipe({name: 't', pure: false})
export class TranslatePipe implements PipeTransform {
  private readonly locale = inject(Locale);
  transform(value: unknown, params?: TranslationParams): string { return this.locale.t(value, params); }
}
