import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileListKeysRequest, FilesListRequest, ImportJsonRequest, KeyUpdateRequest, ProjectsListRequest } from '@localazy/api-client';

// Hoisted so vi.mock factories below can reference these without TDZ errors.
const apiMocks = vi.hoisted(() => ({
  importJson: vi.fn(),
  filesListKeys: vi.fn(),
  filesList: vi.fn(),
  projectsList: vi.fn(),
  keysUpdate: vi.fn(),
}));

vi.mock('../api/localazy-api', () => ({
  getLocalazyApi: vi.fn(() => ({
    import: { json: apiMocks.importJson },
    files: { listKeys: apiMocks.filesListKeys, list: apiMocks.filesList },
    projects: { list: apiMocks.projectsList },
    keys: { update: apiMocks.keysUpdate },
  })),
}));

// Sleep is used by the throttle's processor loop; resolve immediately so tests don't wait.
vi.mock('../utilities/sleep', () => ({
  sleep: vi.fn(() => Promise.resolve()),
}));

import { LocalazyApiThrottleService } from './localazy-api-throttle-service';
import { getLocalazyApi } from '../api/localazy-api';

describe('LocalazyApiThrottleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('delegation', () => {
    it('import passes options through to localazyApi.import.json', async () => {
      const options: ImportJsonRequest = { project: 'p1', json: { en: { hello: 'Hello' } } };
      apiMocks.importJson.mockResolvedValue({ success: true });

      const result = await LocalazyApiThrottleService.import('token', options);

      expect(apiMocks.importJson).toHaveBeenCalledExactlyOnceWith(options);
      expect(result).toEqual({ success: true });
    });

    it('listAllKeysInFileForLanguage passes options through to localazyApi.files.listKeys', async () => {
      const options: FileListKeysRequest = { project: 'p1', file: 'f1', lang: 'en' };
      apiMocks.filesListKeys.mockResolvedValue([{ id: 'k1' }]);

      const result = await LocalazyApiThrottleService.listAllKeysInFileForLanguage('token', options);

      expect(apiMocks.filesListKeys).toHaveBeenCalledExactlyOnceWith(options);
      expect(result).toEqual([{ id: 'k1' }]);
    });

    it('listProjects passes options through to localazyApi.projects.list', async () => {
      const options: ProjectsListRequest = { organization: true, languages: true };
      apiMocks.projectsList.mockResolvedValue([{ id: 'p1' }]);

      const result = await LocalazyApiThrottleService.listProjects('token', options);

      expect(apiMocks.projectsList).toHaveBeenCalledExactlyOnceWith(options);
      expect(result).toEqual([{ id: 'p1' }]);
    });

    it('listFiles passes options through to localazyApi.files.list', async () => {
      const options: FilesListRequest = { project: 'p1' };
      apiMocks.filesList.mockResolvedValue([{ id: 'f1' }]);

      const result = await LocalazyApiThrottleService.listFiles('token', options);

      expect(apiMocks.filesList).toHaveBeenCalledExactlyOnceWith(options);
      expect(result).toEqual([{ id: 'f1' }]);
    });

    it('updateKey passes options through to localazyApi.keys.update', async () => {
      const options: KeyUpdateRequest = { project: 'p1', key: 'k1', deprecated: 0 };
      apiMocks.keysUpdate.mockResolvedValue({ success: true });

      const result = await LocalazyApiThrottleService.updateKey('token', options);

      expect(apiMocks.keysUpdate).toHaveBeenCalledExactlyOnceWith(options);
      expect(result).toEqual({ success: true });
    });
  });

  describe('token handling', () => {
    it('reconstructs the API client with the latest token on every call', async () => {
      apiMocks.projectsList.mockResolvedValue([]);

      await LocalazyApiThrottleService.listProjects('token-a', {});
      await LocalazyApiThrottleService.listProjects('token-b', {});

      const tokens = (getLocalazyApi as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
      expect(tokens).toContain('token-a');
      expect(tokens).toContain('token-b');
    });
  });

  describe('queueing and error isolation', () => {
    it('returns each result in the order matching the originating call', async () => {
      apiMocks.importJson.mockResolvedValueOnce('first').mockResolvedValueOnce('second').mockResolvedValueOnce('third');

      const opts: ImportJsonRequest = { project: 'p1', json: {} };
      const results = await Promise.all([
        LocalazyApiThrottleService.import('t', opts),
        LocalazyApiThrottleService.import('t', opts),
        LocalazyApiThrottleService.import('t', opts),
      ]);

      expect(results).toEqual(['first', 'second', 'third']);
      expect(apiMocks.importJson).toHaveBeenCalledTimes(3);
    });

    it('propagates rejection from the underlying API to only the failing call', async () => {
      apiMocks.importJson.mockResolvedValueOnce('ok-1').mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok-2');

      const opts: ImportJsonRequest = { project: 'p1', json: {} };
      const p1 = LocalazyApiThrottleService.import('t', opts);
      const p2 = LocalazyApiThrottleService.import('t', opts);
      const p3 = LocalazyApiThrottleService.import('t', opts);

      await expect(p1).resolves.toBe('ok-1');
      await expect(p2).rejects.toThrow('boom');
      await expect(p3).resolves.toBe('ok-2');
    });
  });
});
