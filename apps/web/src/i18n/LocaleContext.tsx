import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { translate, type Language } from './messages';
const LocaleContext = createContext({
  language: 'en' as Language,
  setLanguage: (_language: Language) => {
    void _language;
  },
  t: (key: string, values?: Record<string, string | number>) => translate(key, 'en', values),
});
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('carecircle.language');
    return saved === 'hi' || saved === 'ta' ? saved : 'en';
  });
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('carecircle.language', language);
  }, [language]);
  return (
    <LocaleContext.Provider
      value={{ language, setLanguage, t: (key, values) => translate(key, language, values) }}
    >
      {children}
    </LocaleContext.Provider>
  );
}
export const useLocale = () => useContext(LocaleContext);
export function LanguagePicker() {
  const { language, setLanguage, t } = useLocale();
  return (
    <label className="language-picker">
      <span className="sr-only">{t('Language')}</span>
      <select
        aria-label={t('Language')}
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
      >
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
        <option value="ta">தமிழ்</option>
      </select>
    </label>
  );
}
