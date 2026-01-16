import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock sleep to speed up tests
vi.mock('../../utilities/sleep', () => ({
  sleep: vi.fn(() => Promise.resolve()),
}));

// Store mock functions for use in tests
const mockImportJson = vi.fn();
const mockFilesListKeys = vi.fn();
const mockProjectsList = vi.fn();
const mockFilesList = vi.fn();
const mockKeysUpdate = vi.fn();

// Mock the localazy-api module
vi.mock('../../api/localazy-api', () => {
  const mockFns = {
    importJson: vi.fn(),
    filesListKeys: vi.fn(),
    projectsList: vi.fn(),
    filesList: vi.fn(),
    keysUpdate: vi.fn(),
  };

  return {
    getLocalazyApi: vi.fn(() => ({
      import: { json: mockFns.importJson },
      files: {
        listKeys: mockFns.filesListKeys,
        list: mockFns.filesList,
      },
      projects: { list: mockFns.projectsList },
      keys: { update: mockFns.keysUpdate },
    })),
    __mocks: mockFns,
  };
});

// Import after mocking
import { LocalazyApiThrottleService } from '../../services/localazy-api-throttle-service';
import { getLocalazyApi } from '../../api/localazy-api';

// Get the mock functions from the module
const getMocks = () => {
  const api = getLocalazyApi('');
  return {
    mockImportJson: api.import.json as ReturnType<typeof vi.fn>,
    mockFilesListKeys: api.files.listKeys as ReturnType<typeof vi.fn>,
    mockProjectsList: api.projects.list as ReturnType<typeof vi.fn>,
    mockFilesList: api.files.list as ReturnType<typeof vi.fn>,
    mockKeysUpdate: api.keys.update as ReturnType<typeof vi.fn>,
  };
};

describe('LocalazyApiThrottleService', () => {
  let mocks: ReturnType<typeof getMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = getMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('import', () => {
    it('should call import.json with provided options', async () => {
      const mockResponse = { success: true };
      mocks.mockImportJson.mockResolvedValue(mockResponse);

      const options = {
        project: 'project-123',
        json: { en: { key: 'value' } },
      };

      const result = await LocalazyApiThrottleService.import('test-token', options as any);

      expect(mocks.mockImportJson).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors from API', async () => {
      const error = new Error('API Error');
      mocks.mockImportJson.mockRejectedValue(error);

      await expect(
        LocalazyApiThrottleService.import('test-token', {} as any)
      ).rejects.toThrow('API Error');
    });
  });

  describe('listAllKeysInFileForLanguage', () => {
    it('should call files.listKeys with provided options', async () => {
      const mockKeys = [{ id: 'key-1', key: ['test'] }];
      mocks.mockFilesListKeys.mockResolvedValue(mockKeys);

      const options = {
        project: 'project-123',
        file: 'file-123',
        lang: 'en',
      };

      const result = await LocalazyApiThrottleService.listAllKeysInFileForLanguage(
        'test-token',
        options as any
      );

      expect(mocks.mockFilesListKeys).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockKeys);
    });
  });

  describe('listProjects', () => {
    it('should call projects.list with provided options', async () => {
      const mockProjects = [{ id: 'project-1', name: 'Test Project' }];
      mocks.mockProjectsList.mockResolvedValue(mockProjects);

      const options = { organization: true, languages: true };

      const result = await LocalazyApiThrottleService.listProjects(
        'test-token',
        options as any
      );

      expect(mocks.mockProjectsList).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockProjects);
    });
  });

  describe('listFiles', () => {
    it('should call files.list with provided options', async () => {
      const mockFiles = [{ id: 'file-1', name: 'directus.json' }];
      mocks.mockFilesList.mockResolvedValue(mockFiles);

      const options = { project: 'project-123' };

      const result = await LocalazyApiThrottleService.listFiles(
        'test-token',
        options as any
      );

      expect(mocks.mockFilesList).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockFiles);
    });
  });

  describe('updateKey', () => {
    it('should call keys.update with provided options', async () => {
      const mockResponse = { success: true };
      mocks.mockKeysUpdate.mockResolvedValue(mockResponse);

      const options = {
        project: 'project-123',
        key: 'key-123',
        deprecated: true,
      };

      const result = await LocalazyApiThrottleService.updateKey(
        'test-token',
        options as any
      );

      expect(mocks.mockKeysUpdate).toHaveBeenCalledWith(options);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('request queuing', () => {
    it('should process multiple requests in sequence', async () => {
      const responses = ['response-1', 'response-2', 'response-3'];
      mocks.mockImportJson
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2]);

      const promises = [
        LocalazyApiThrottleService.import('token', { project: 'p1' } as any),
        LocalazyApiThrottleService.import('token', { project: 'p2' } as any),
        LocalazyApiThrottleService.import('token', { project: 'p3' } as any),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(responses);
      expect(mocks.mockImportJson).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure', async () => {
      mocks.mockImportJson
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('failed'))
        .mockResolvedValueOnce('success-2');

      const promise1 = LocalazyApiThrottleService.import('token', { project: 'p1' } as any);
      const promise2 = LocalazyApiThrottleService.import('token', { project: 'p2' } as any);
      const promise3 = LocalazyApiThrottleService.import('token', { project: 'p3' } as any);

      await expect(promise1).resolves.toBe('success');
      await expect(promise2).rejects.toThrow('failed');
      await expect(promise3).resolves.toBe('success-2');
    });
  });

  describe('error handling', () => {
    it('should reject promise when API throws', async () => {
      mocks.mockProjectsList.mockRejectedValue(new Error('Network error'));

      await expect(
        LocalazyApiThrottleService.listProjects('token', {} as any)
      ).rejects.toThrow('Network error');
    });

    it('should not affect other requests when one fails', async () => {
      mocks.mockImportJson
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockResolvedValueOnce('success');

      const p1 = LocalazyApiThrottleService.import('token', {} as any);
      const p2 = LocalazyApiThrottleService.import('token', {} as any);

      await expect(p1).rejects.toThrow('Error 1');
      await expect(p2).resolves.toBe('success');
    });
  });
});
