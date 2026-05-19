import { describe, it, expect } from 'vitest';
import { collectEntryUserIds } from './use-sync-log-user-names';

describe('collectEntryUserIds', () => {
  it('returns no ids for null / undefined / empty input', () => {
    const sink = new Set<string>();
    collectEntryUserIds(null, sink);
    collectEntryUserIds(undefined, sink);
    collectEntryUserIds('', sink);
    expect(sink.size).toBe(0);
  });

  it('returns no ids for malformed JSON', () => {
    const sink = new Set<string>();
    collectEntryUserIds('{not json', sink);
    expect(sink.size).toBe(0);
  });

  it('returns no ids for a non-array payload', () => {
    const sink = new Set<string>();
    collectEntryUserIds('{"foo":"bar"}', sink);
    expect(sink.size).toBe(0);
  });

  it("collects each entry's data.user id, deduped via the Set sink", () => {
    const sink = new Set<string>();
    collectEntryUserIds(
      JSON.stringify([
        { timestamp: 't1', level: 'info', message: 'a', data: { user: 'u-1' } },
        { timestamp: 't2', level: 'info', message: 'b', data: { user: 'u-2' } },
        { timestamp: 't3', level: 'info', message: 'c', data: { user: 'u-1' } }, // dup
      ]),
      sink,
    );
    expect(Array.from(sink).sort()).toEqual(['u-1', 'u-2']);
  });

  it('skips entries with a missing data envelope or a non-string user field', () => {
    const sink = new Set<string>();
    collectEntryUserIds(
      JSON.stringify([
        { timestamp: 't1', level: 'info', message: 'no data' },
        { timestamp: 't2', level: 'info', message: 'null user', data: { user: null } },
        { timestamp: 't3', level: 'info', message: 'empty user', data: { user: '' } },
        { timestamp: 't4', level: 'info', message: 'valid', data: { user: 'u-1' } },
      ]),
      sink,
    );
    expect(Array.from(sink)).toEqual(['u-1']);
  });

  it('appends to an existing sink without clearing it', () => {
    const sink = new Set<string>(['pre-existing']);
    collectEntryUserIds(JSON.stringify([{ timestamp: 't', level: 'info', message: 'a', data: { user: 'u-1' } }]), sink);
    expect(Array.from(sink).sort()).toEqual(['pre-existing', 'u-1']);
  });
});
