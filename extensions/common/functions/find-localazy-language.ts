import { getLocalazyLanguages, Language } from './localazy-languages';

export const findLocalazyLanguageByLocale = (locale: string): Language | undefined => getLocalazyLanguages()
  .find((language) => language.locale === locale);
