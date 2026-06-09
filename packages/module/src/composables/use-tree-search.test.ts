import { describe, it, expect } from 'vitest';
import { matchesText, splitHighlight, useTreeSearch } from './use-tree-search';

describe('matchesText', () => {
  it('returns true when the query is empty (no lens is no narrowing)', () => {
    expect(matchesText('Articles translations', '')).toBe(true);
    expect(matchesText('', '')).toBe(true);
  });

  it('matches case-insensitively against the label (caller passes the query pre-lowercased)', () => {
    expect(matchesText('Articles translations', 'art')).toBe(true);
    expect(matchesText('Articles translations', 'trans')).toBe(true);
    expect(matchesText('Articles translations', 'lations')).toBe(true);
  });

  it('returns false when the substring is absent', () => {
    expect(matchesText('Articles translations', 'banner')).toBe(false);
  });

  it('treats whitespace inside the query as literal — single token only', () => {
    expect(matchesText('Articles translations', 'les trans')).toBe(true);
    expect(matchesText('Articles translations', 'art lations')).toBe(false);
  });
});

describe('splitHighlight', () => {
  it('returns a single unmatched segment when the query is empty', () => {
    expect(splitHighlight('Articles', '')).toEqual([{ text: 'Articles', matched: false }]);
  });

  it('splits around a single match preserving original casing', () => {
    expect(splitHighlight('Articles translations', 'art')).toEqual([
      { text: 'Art', matched: true },
      { text: 'icles translations', matched: false },
    ]);
  });

  it('splits around multiple occurrences', () => {
    expect(splitHighlight('aXaXa', 'a')).toEqual([
      { text: 'a', matched: true },
      { text: 'X', matched: false },
      { text: 'a', matched: true },
      { text: 'X', matched: false },
      { text: 'a', matched: true },
    ]);
  });

  it('returns a single unmatched segment when the query is absent from the label', () => {
    expect(splitHighlight('Articles', 'banner')).toEqual([{ text: 'Articles', matched: false }]);
  });
});

describe('useTreeSearch', () => {
  it('trims and lowercases the input for matching', () => {
    const lens = useTreeSearch();
    lens.query.value = '  ART  ';
    expect(lens.normalizedQuery.value).toBe('art');
    expect(lens.isActive.value).toBe(true);
    expect(lens.isMatch('articles translations')).toBe(true);
    expect(lens.isMatch('Banner')).toBe(false);
  });

  it('treats a blank input as inactive', () => {
    const lens = useTreeSearch();
    expect(lens.isActive.value).toBe(false);
    lens.query.value = '   ';
    expect(lens.isActive.value).toBe(false);
    // Inactive lens matches everything (no narrowing).
    expect(lens.isMatch('anything')).toBe(true);
  });

  it('coalesces a null query value to empty (defensive against v-input)', () => {
    const lens = useTreeSearch();
    // Simulate the `v-input` clear-to-null path.
    lens.query.value = null as unknown as string;
    expect(lens.normalizedQuery.value).toBe('');
    expect(lens.isActive.value).toBe(false);
  });

  it('clear() resets the query', () => {
    const lens = useTreeSearch();
    lens.query.value = 'foo';
    lens.clear();
    expect(lens.query.value).toBe('');
    expect(lens.isActive.value).toBe(false);
  });
});
