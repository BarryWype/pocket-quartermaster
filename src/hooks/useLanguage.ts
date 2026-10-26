import { useLocales } from 'expo-localization';

import { getLocale, setLocale, type Locale } from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * The language to show: the one picked in Settings, or the phone's. Screens
 * call it so they re-render when it changes; it also sets the language used
 * by `t` and the content texts.
 */
export function useLanguage(): Locale {
  const setting = useSettingsStore((state) => state.language);
  const device = useLocales()[0]?.languageCode;
  const locale = setting === 'system' ? (device === 'fr' ? 'fr' : 'en') : setting;
  if (getLocale() !== locale) setLocale(locale);
  return locale;
}
