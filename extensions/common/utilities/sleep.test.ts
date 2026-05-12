import { describe, it, expect, vi, afterEach } from 'vitest';
import { sleep } from './sleep';

describe('sleep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the requested delay', async () => {
    vi.useFakeTimers();
    const promise = sleep(500);
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toBe(true);
  });
});
