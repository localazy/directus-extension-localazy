import { describe, it, expect } from 'vitest';
import { AppCollection, Field } from '@directus/types';
import {
  buildVisibleTranslatableSelection,
  isCollectionShown,
  subtractEnabledFields,
  unionEnabledFields,
  visibleFieldsForCollection,
  VisibilityContext,
} from './tree-visibility';

// Minimal fixture: articles / pages (translatable) under a `content` folder,
// plus an untranslatable `settings` collection at the root.
function makeCollection(name: string, group?: string): AppCollection {
  return {
    collection: name,
    name,
    meta: { sort: 0, group: group ?? null } as AppCollection['meta'],
    schema: null,
    type: 'table',
  } as AppCollection;
}

function makeField(collection: string, field: string, type = 'string'): Field {
  return {
    collection,
    field,
    name: field,
    type,
    schema: null,
    meta: null,
  } as Field;
}

const content = makeCollection('content');
const articles = makeCollection('articles', 'content');
const pages = makeCollection('pages', 'content');
const settings = makeCollection('settings');

const FIELDS_BY_COLLECTION: Record<string, { translatableFields: Field[]; allFields: Field[] }> = {
  articles: {
    translatableFields: [makeField('articles', 'title'), makeField('articles', 'body')],
    allFields: [makeField('articles', 'title'), makeField('articles', 'body'), makeField('articles', 'created_at', 'timestamp')],
  },
  pages: {
    translatableFields: [makeField('pages', 'heading')],
    allFields: [makeField('pages', 'heading'), makeField('pages', 'slug', 'string')],
  },
  content: { translatableFields: [], allFields: [] },
  settings: { translatableFields: [], allFields: [makeField('settings', 'theme', 'string')] },
};

function makeCtx(over: Partial<VisibilityContext> = {}): VisibilityContext {
  const base: VisibilityContext = {
    isActive: false,
    isMatch: () => true,
    allCollections: [content, articles, pages, settings],
    getFieldsForCollection: (name) => FIELDS_BY_COLLECTION[name] ?? { translatableFields: [], allFields: [] },
    showUntranslatableField: false,
    showUntranslatableCollections: false,
    isTranslatableCollection: (c) => c.collection === 'articles' || c.collection === 'pages',
  };
  return { ...base, ...over };
}

describe('isCollectionShown — lens inactive', () => {
  it('shows translatable collections', () => {
    const ctx = makeCtx();
    expect(isCollectionShown(articles, ctx)).toBe(true);
  });

  it('shows folder collections with translatable descendants', () => {
    const ctx = makeCtx();
    expect(isCollectionShown(content, ctx)).toBe(true);
  });

  it('hides untranslatable collections unless the toggle is on', () => {
    expect(isCollectionShown(settings, makeCtx())).toBe(false);
    expect(isCollectionShown(settings, makeCtx({ showUntranslatableCollections: true }))).toBe(true);
  });
});

describe('isCollectionShown — lens active', () => {
  it('shows a collection whose own name matches', () => {
    const ctx = makeCtx({ isActive: true, isMatch: (s) => s.toLowerCase().includes('art') });
    expect(isCollectionShown(articles, ctx)).toBe(true);
  });

  it('shows a folder whose descendant matches by name', () => {
    const ctx = makeCtx({ isActive: true, isMatch: (s) => s.toLowerCase().includes('articles') });
    expect(isCollectionShown(content, ctx)).toBe(true);
  });

  it('shows a folder whose descendant has a matching field name', () => {
    const ctx = makeCtx({ isActive: true, isMatch: (s) => s.toLowerCase().includes('heading') });
    expect(isCollectionShown(content, ctx)).toBe(true);
    expect(isCollectionShown(pages, ctx)).toBe(true);
    expect(isCollectionShown(articles, ctx)).toBe(false);
  });

  it('hides a collection that does not match and has no matching descendant', () => {
    const ctx = makeCtx({ isActive: true, isMatch: (s) => s.toLowerCase().includes('banner') });
    expect(isCollectionShown(articles, ctx)).toBe(false);
    expect(isCollectionShown(content, ctx)).toBe(false);
  });
});

describe('visibleFieldsForCollection — collection-name match shows all', () => {
  it('returns every rendered field when the collection name itself matches (Q3 / ADR-0003)', () => {
    const ctx = makeCtx({ isActive: true, isMatch: (s) => s.toLowerCase().includes('articles') });
    expect(visibleFieldsForCollection(articles, ctx).map((f) => f.field)).toEqual(['title', 'body']);
  });

  it('returns only fields whose own names match when the collection name does not', () => {
    const ctx = makeCtx({ isActive: true, isMatch: (s) => s.toLowerCase().includes('title') });
    expect(visibleFieldsForCollection(articles, ctx).map((f) => f.field)).toEqual(['title']);
  });

  it('returns every rendered field with the lens inactive (filter compose AND from Q4)', () => {
    expect(visibleFieldsForCollection(articles, makeCtx()).map((f) => f.field)).toEqual(['title', 'body']);
  });

  it('honours the Show untranslatable fields toggle: lens-narrowed too', () => {
    const ctx = makeCtx({ isActive: true, showUntranslatableField: true, isMatch: (s) => s.toLowerCase().includes('created') });
    expect(visibleFieldsForCollection(articles, ctx).map((f) => f.field)).toEqual(['created_at']);
  });
});

describe('buildVisibleTranslatableSelection', () => {
  it('flattens the visible translatable selection for the page-level Select all', () => {
    const ctx = makeCtx({ isActive: true, isMatch: (s) => s.toLowerCase().includes('title') });
    expect(buildVisibleTranslatableSelection([content], ctx)).toEqual([{ collection: 'articles', fields: ['title'] }]);
  });

  it('includes every translatable field of a collection whose own name matches', () => {
    const ctx = makeCtx({ isActive: true, isMatch: (s) => s.toLowerCase().includes('articles') });
    expect(buildVisibleTranslatableSelection([content], ctx)).toEqual([{ collection: 'articles', fields: ['title', 'body'] }]);
  });

  it('returns the full set with the lens inactive', () => {
    expect(buildVisibleTranslatableSelection([content], makeCtx())).toEqual([
      { collection: 'articles', fields: ['title', 'body'] },
      { collection: 'pages', fields: ['heading'] },
    ]);
  });
});

describe('unionEnabledFields — scope-additive Select all', () => {
  it('merges fields per collection without dropping pre-existing entries', () => {
    const a = [{ collection: 'articles', fields: ['title'] }];
    const b = [{ collection: 'articles', fields: ['body'] }];
    expect(unionEnabledFields(a, b)).toEqual([{ collection: 'articles', fields: ['title', 'body'] }]);
  });

  it('preserves collections that exist only on one side', () => {
    const a = [{ collection: 'articles', fields: ['title'] }];
    const b = [{ collection: 'pages', fields: ['heading'] }];
    expect(unionEnabledFields(a, b)).toEqual([
      { collection: 'articles', fields: ['title'] },
      { collection: 'pages', fields: ['heading'] },
    ]);
  });

  it('does not duplicate fields that overlap between inputs', () => {
    const a = [{ collection: 'articles', fields: ['title', 'body'] }];
    const b = [{ collection: 'articles', fields: ['title'] }];
    expect(unionEnabledFields(a, b)).toEqual([{ collection: 'articles', fields: ['title', 'body'] }]);
  });
});

describe('subtractEnabledFields — scope-additive Deselect all', () => {
  it('removes only the fields present in the second list', () => {
    const a = [{ collection: 'articles', fields: ['title', 'body'] }];
    const b = [{ collection: 'articles', fields: ['title'] }];
    expect(subtractEnabledFields(a, b)).toEqual([{ collection: 'articles', fields: ['body'] }]);
  });

  it('drops collections that become empty', () => {
    const a = [{ collection: 'articles', fields: ['title'] }];
    const b = [{ collection: 'articles', fields: ['title'] }];
    expect(subtractEnabledFields(a, b)).toEqual([]);
  });

  it('leaves untouched collections alone', () => {
    const a = [
      { collection: 'articles', fields: ['title'] },
      { collection: 'pages', fields: ['heading'] },
    ];
    const b = [{ collection: 'articles', fields: ['title'] }];
    expect(subtractEnabledFields(a, b)).toEqual([{ collection: 'pages', fields: ['heading'] }]);
  });
});
