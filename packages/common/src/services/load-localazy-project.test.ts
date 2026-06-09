import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Project } from '@localazy/api-client';

const throttleMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
}));

vi.mock('./localazy-api-throttle-service', () => ({
  LocalazyApiThrottleService: {
    listProjects: throttleMocks.listProjects,
  },
}));

import { loadLocalazyProject } from './load-localazy-project';

describe('loadLocalazyProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null without calling the API when the token is empty', async () => {
    const result = await loadLocalazyProject('');

    expect(result).toBeNull();
    expect(throttleMocks.listProjects).not.toHaveBeenCalled();
  });

  it('requests organisation + languages metadata and returns the first project', async () => {
    const project = { id: 'p1' } as Project;
    throttleMocks.listProjects.mockResolvedValue([project, { id: 'p2' } as Project]);

    const result = await loadLocalazyProject('tok');

    expect(throttleMocks.listProjects).toHaveBeenCalledWith('tok', { organization: true, languages: true });
    expect(result).toBe(project);
  });

  it('returns null when the API yields no projects', async () => {
    throttleMocks.listProjects.mockResolvedValue([]);

    const result = await loadLocalazyProject('tok');

    expect(result).toBeNull();
  });

  // Behaviour change versus the legacy BaseContentSynchronizationService.loadProject:
  // the old helper swallowed API errors and returned null (the caller logged "could not
  // load project"). The new helper lets API errors bubble so the pipeline can map them
  // to a `failed` outcome with the original error attached.
  it('propagates API errors instead of swallowing them', async () => {
    const apiError = new Error('boom');
    throttleMocks.listProjects.mockRejectedValue(apiError);

    await expect(loadLocalazyProject('tok')).rejects.toBe(apiError);
  });
});
