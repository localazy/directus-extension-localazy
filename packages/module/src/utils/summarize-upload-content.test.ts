import { describe, it, expect } from 'vitest';
import { TranslatableContent } from '@localazy/directus-common';
import { summarizeUploadContent } from './summarize-upload-content';

/**
 * The runtime shape goes deeper than `TranslatableContent`'s declared 2-level
 * `KeyValueEntry` allows. Cast to the target type at construction so tests can describe
 * the real on-wire structure — the production code does the same dance via lodash merge.
 */
type DeepRecord = Record<string, unknown>;
const asContent = (v: { sourceLanguage: DeepRecord; otherLanguages: Record<string, DeepRecord> }): TranslatableContent =>
  v as TranslatableContent;

describe('summarizeUploadContent', () => {
  it('returns all zeros for empty content', () => {
    const content: TranslatableContent = { sourceLanguage: {}, otherLanguages: {} };
    expect(summarizeUploadContent(content)).toEqual({
      items: 0,
      collections: 0,
      sourceLangEntries: 0,
      nonEmptySourceLangEntries: 0,
      translationEntries: 0,
      nonEmptyTranslationEntries: 0,
    });
  });

  it('counts items and source-language string entries', () => {
    const content = asContent({
      sourceLanguage: {
        posts: {
          '1': { translations: { title: 'Hello', body: 'World' } },
          '2': { translations: { title: 'Foo' } },
        },
      },
      otherLanguages: {},
    });
    expect(summarizeUploadContent(content)).toEqual({
      items: 2,
      collections: 1,
      sourceLangEntries: 3,
      nonEmptySourceLangEntries: 3,
      translationEntries: 0,
      nonEmptyTranslationEntries: 0,
    });
  });

  it('counts items across multiple collections', () => {
    const content = asContent({
      sourceLanguage: {
        posts: { '1': { translations: { title: 'Hi' } } },
        pages: { '5': { translations: { title: 'Hi' } } },
      },
      otherLanguages: {},
    });
    expect(summarizeUploadContent(content)).toEqual({
      items: 2,
      collections: 2,
      sourceLangEntries: 2,
      nonEmptySourceLangEntries: 2,
      translationEntries: 0,
      nonEmptyTranslationEntries: 0,
    });
  });

  it('sums translation-language entries across languages', () => {
    const content = asContent({
      sourceLanguage: {
        posts: { '1': { translations: { title: 'Hi' } } },
      },
      otherLanguages: {
        fr: { posts: { '1': { translations: { title: 'Salut' } } } },
        de: { posts: { '1': { translations: { title: 'Hallo' } } } },
      },
    });
    expect(summarizeUploadContent(content)).toEqual({
      items: 1,
      collections: 1,
      sourceLangEntries: 1,
      nonEmptySourceLangEntries: 1,
      translationEntries: 2,
      nonEmptyTranslationEntries: 2,
    });
  });

  it('excludes @meta: keys from entry counts', () => {
    const content = asContent({
      sourceLanguage: {
        posts: {
          '1': {
            translations: { title: 'Hi' },
            '@meta:title': { add: { directus: { collection: 'posts', field: 'title', itemId: 1 } } },
          },
        },
        '@meta:something': { add: { directus: { collection: 'posts', field: 'x', itemId: 1 } } },
      },
      otherLanguages: {},
    });
    const summary = summarizeUploadContent(content);
    expect(summary.sourceLangEntries).toBe(1);
    expect(summary.nonEmptySourceLangEntries).toBe(1);
    expect(summary.items).toBe(1);
  });

  it('counts translation_string entries but does not list them under items/collections', () => {
    const content = asContent({
      sourceLanguage: {
        translation_string: { greeting: { key1: 'Hello', key2: 'Hi' } },
      },
      otherLanguages: {
        fr: { translation_string: { greeting: { key1: 'Salut' } } },
      },
    });
    expect(summarizeUploadContent(content)).toEqual({
      items: 0,
      collections: 0,
      sourceLangEntries: 2,
      nonEmptySourceLangEntries: 2,
      translationEntries: 1,
      nonEmptyTranslationEntries: 1,
    });
  });

  it('deduplicates the same item id appearing in source + translation languages', () => {
    const content = asContent({
      sourceLanguage: { posts: { '1': { translations: { title: 'Hi' } } } },
      otherLanguages: {
        fr: { posts: { '1': { translations: { title: 'Salut' } } } },
      },
    });
    expect(summarizeUploadContent(content).items).toBe(1);
  });

  describe('non-empty counting', () => {
    it('treats empty string and whitespace-only strings as empty', () => {
      const content = asContent({
        sourceLanguage: {
          posts: {
            '1': { translations: { title: 'Hello', subtitle: '', body: '   ', cta: '\t\n' } },
            '2': { translations: { title: '', body: 'World' } },
          },
        },
        otherLanguages: {},
      });
      const summary = summarizeUploadContent(content);
      expect(summary.sourceLangEntries).toBe(6);
      expect(summary.nonEmptySourceLangEntries).toBe(2);
    });

    it('counts non-empty entries inside nested JSON fields', () => {
      const content = asContent({
        sourceLanguage: {
          posts: {
            '1': {
              translations: {
                rich: { headline: 'Hi', tagline: '', meta: { caption: 'Caption', alt: ' ' } },
              },
            },
          },
        },
        otherLanguages: {},
      });
      const summary = summarizeUploadContent(content);
      expect(summary.sourceLangEntries).toBe(4);
      expect(summary.nonEmptySourceLangEntries).toBe(2);
    });

    it('tracks non-empty separately for source and translation languages', () => {
      const content = asContent({
        sourceLanguage: {
          posts: { '1': { translations: { title: 'Hi', body: '' } } },
        },
        otherLanguages: {
          fr: { posts: { '1': { translations: { title: 'Salut', body: '   ' } } } },
        },
      });
      const summary = summarizeUploadContent(content);
      expect(summary.sourceLangEntries).toBe(2);
      expect(summary.nonEmptySourceLangEntries).toBe(1);
      expect(summary.translationEntries).toBe(2);
      expect(summary.nonEmptyTranslationEntries).toBe(1);
    });

    it('counts empty translation_string values as empty', () => {
      const content = asContent({
        sourceLanguage: {
          translation_string: { greeting: { key1: 'Hello', key2: '', key3: '   ' } },
        },
        otherLanguages: {},
      });
      const summary = summarizeUploadContent(content);
      expect(summary.sourceLangEntries).toBe(3);
      expect(summary.nonEmptySourceLangEntries).toBe(1);
    });
  });
});
