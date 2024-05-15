export type DirectusApiResultTranslationString = {
  id: string;
  key: string;
  language: string;
  value: string;
};

export type TranslationString = {
  id: string;
  key: string;
  translations: Record<string, string>;
};
