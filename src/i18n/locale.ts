export type Locale = 'en' | 'fr';
export const LOCALES: Locale[] = ['en', 'fr'];

let current: Locale = 'en';

/** The language text is shown in. Set by the app from the settings; English elsewhere (tests, the simulator). */
export const getLocale = () => current;
export const setLocale = (locale: Locale) => {
  current = locale;
};

/** The current language's version of a text module. */
export const localized = <T>(versions: Record<Locale, T>): T => versions[current];
