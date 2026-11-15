import { useLocale } from './LocaleContext';
/** Localizes product copy only; clinician-entered content is never machine-translated. */
export function Localized({ value }: { value: string }) {
  return useLocale().t(value);
}
