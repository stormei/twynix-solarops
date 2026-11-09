import {english} from './translations.js';

export type Language = 'nb' | 'en';
export type TranslationParams = Readonly<Record<string, string | number>>;

export function translateMessage(value: unknown, language: Language, params: TranslationParams = {}): string {
  if (value === null || value === undefined) return '';
  const source = String(value);
  const key = source.trim();
  const quality: Record<string, string> = {good: 'God', stale: 'Foreldet', missing: 'Mangler', invalid: 'Ugyldig', 'missing samples':'manglende målinger', 'counter reset':'tellernullstilling', 'incomplete coverage':'ufullstendig dekning', 'invalid sample':'ugyldig måling'};
  const translated = language === 'en' ? english[key] : quality[key];
  // Preserve surrounding whitespace in fragments; never rewrite arbitrary entity names.
  const message = translated === undefined ? source : source.slice(0, source.indexOf(key)) + translated + source.slice(source.indexOf(key) + key.length);
  return message.replace(/\{(\w+)\}/g, (match, name: string) => params[name] === undefined ? match : String(params[name]));
}
