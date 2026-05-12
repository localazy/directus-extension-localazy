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
    // Fire-and-forget by design: the test awaits `promise` explicitly below
    // (line 21) once the fake timer has advanced; this .then is only setting a
    // flag the test reads to verify resolution timing.
    void promise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toBe(true);
  });
});
