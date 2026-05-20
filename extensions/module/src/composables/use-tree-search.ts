import { computed, ref } from 'vue';

export type HighlightSegment = { text: string; matched: boolean };

export function matchesText(label: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return label.toLowerCase().includes(normalizedQuery);
}

// Splits a label into matched / unmatched segments for rendering. Returned segments
// reuse the original label's casing — `normalizedQuery` only drives where to cut.
// Always returns at least one segment so the caller can `v-for` without a fallback.
export function splitHighlight(label: string, normalizedQuery: string): HighlightSegment[] {
  if (!normalizedQuery) return [{ text: label, matched: false }];
  const lower = label.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < label.length) {
    const idx = lower.indexOf(normalizedQuery, cursor);
    if (idx < 0) {
      segments.push({ text: label.slice(cursor), matched: false });
      break;
    }
    if (idx > cursor) segments.push({ text: label.slice(cursor, idx), matched: false });
    segments.push({ text: label.slice(idx, idx + normalizedQuery.length), matched: true });
    cursor = idx + normalizedQuery.length;
  }
  return segments;
}

// Owns the page-level search query. Designed to be a transient lens (ADR-0003):
// the input resets on every visit because the composable is instantiated by the
// hosting component, and dies with it on route unmount.
export function useTreeSearch() {
  const query = ref<string>('');
  // `v-input` can emit `null` when cleared depending on its `nullable` prop —
  // coalesce defensively so the rest of the lens never sees a nullish value.
  const normalizedQuery = computed(() => (query.value ?? '').trim().toLowerCase());
  const isActive = computed(() => normalizedQuery.value.length > 0);
  const isMatch = (label: string) => matchesText(label, normalizedQuery.value);
  const highlight = (label: string) => splitHighlight(label, normalizedQuery.value);
  const clear = () => {
    query.value = '';
  };
  return { query, normalizedQuery, isActive, isMatch, highlight, clear };
}
