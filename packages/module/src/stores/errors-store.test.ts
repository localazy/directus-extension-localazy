import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useErrorsStore, normalizeDirectusMessage } from './errors-store';

// AnalyticsService is only touched by the Localazy-error path; stub it so importing the
// store doesn't try to reach the network.
vi.mock('@localazy/directus-common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@localazy/directus-common')>();
  return { ...actual, AnalyticsService: { trackError: vi.fn().mockResolvedValue(undefined) } };
});

/** Build a Directus-shaped axios error carrying a single API error message. */
function directusError(message: string) {
  return { response: { data: { errors: [{ message }] } } };
}

const TOO_LONG = (value: string) => `Value "${value}" for field "content" in collection "community_actions_translations" is too long.`;

describe('errors-store — Directus error aggregation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('collapses per-row "value too long" errors that differ only by the (long) value into one counted row', () => {
    const store = useErrorsStore();
    const longA = 'A'.repeat(500);
    const longB = '{"ar":{"_a6481607220144618512":-6481606700118020000}}'.repeat(20);

    store.addDirectusError(directusError(TOO_LONG(longA)));
    store.addDirectusError(directusError(TOO_LONG(longB)));
    store.addDirectusError(directusError(TOO_LONG(longA)));

    expect(store.directusErrors).toHaveLength(1);
    expect(store.directusErrors[0]!.count).toBe(3);
    // The masked message keeps the actionable parts and drops the blob.
    expect(store.directusErrors[0]!.message).toContain('field "content"');
    expect(store.directusErrors[0]!.message).toContain('"…"');
    expect(store.directusErrors[0]!.message).not.toContain('6481606700118020000');
  });

  it('keeps short quoted tokens (e.g. language codes) so distinct FK errors stay distinct', () => {
    const store = useErrorsStore();
    store.addDirectusError(directusError('Invalid foreign key "ja" for field "languages_code" in collection "x".'));
    store.addDirectusError(directusError('Invalid foreign key "ja" for field "languages_code" in collection "x".'));
    store.addDirectusError(directusError('Invalid foreign key "zh-CN" for field "languages_code" in collection "x".'));

    expect(store.directusErrors).toHaveLength(2);
    expect(store.directusErrors.find((e) => e.message.includes('"ja"'))!.count).toBe(2);
    expect(store.directusErrors.find((e) => e.message.includes('"zh-CN"'))!.count).toBe(1);
  });

  it('caps distinct errors at 50 but still counts repeats of already-tracked ones', () => {
    const store = useErrorsStore();
    for (let i = 0; i < 60; i += 1) {
      store.addDirectusError(directusError(`Distinct error number ${i} with a unique tail ${'x'.repeat(50)}-${i}`));
    }
    expect(store.directusErrors).toHaveLength(50);

    const before = store.directusErrors[0]!.count;
    store.addDirectusError(directusError(`Distinct error number 0 with a unique tail ${'x'.repeat(50)}-0`));
    expect(store.directusErrors[0]!.count).toBe(before + 1);
  });

  it('records deduped, capped per-record occurrences from the error context', () => {
    const store = useErrorsStore();
    const msg = TOO_LONG('x'.repeat(60));
    store.addDirectusError(directusError(msg), { collection: 'community_actions', itemId: 39, languages: ['es'] });
    store.addDirectusError(directusError(msg), { collection: 'community_actions', itemId: 39, languages: ['es'] }); // dup → not re-added
    store.addDirectusError(directusError(msg), { collection: 'community_actions', itemId: 40, languages: ['es', 'de'] });
    store.addDirectusError(directusError(msg)); // no context → counts but no occurrence

    expect(store.directusErrors).toHaveLength(1);
    const entry = store.directusErrors[0]!;
    expect(entry.count).toBe(4);
    expect(entry.occurrences).toEqual([
      { collection: 'community_actions', itemId: '39', languages: ['es'] },
      { collection: 'community_actions', itemId: '40', languages: ['es', 'de'] },
    ]);
  });

  it('resetDirectusErrors clears the list', () => {
    const store = useErrorsStore();
    store.addDirectusError(directusError('boom'));
    expect(store.hasDirectusErrors).toBe(true);
    store.resetDirectusErrors();
    expect(store.hasDirectusErrors).toBe(false);
    expect(store.directusErrors).toHaveLength(0);
  });

  it('normalizeDirectusMessage masks only quoted runs of 40+ chars', () => {
    expect(normalizeDirectusMessage('keep "ja" short')).toBe('keep "ja" short');
    expect(normalizeDirectusMessage(`mask "${'y'.repeat(40)}" here`)).toBe('mask "…" here');
  });
});
