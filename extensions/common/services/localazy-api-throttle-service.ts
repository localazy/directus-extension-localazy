import {
  FileListKeysRequest,
  FilesListRequest,
  ImportJsonRequest,
  KeyUpdateRequest,
  ProjectsListRequest,
  WebhooksGetSecretRequest,
  WebhooksListRequest,
  WebhooksUpdateRequest,
} from '@localazy/api-client';
import { sleep } from '../utilities/sleep';
import { getLocalazyApi } from '../api/localazy-api';

class LocalazyRequestProcessor {
  private MAX_REQUESTS_PER_SECOND = 10;

  private MAX_REQUESTS_PER_MINUTE = 100;

  private requests: (() => Promise<void>)[] = [];

  private processing = false;

  private requestsInLastSecond = 0;

  private requestsInLastMinute = 0;

  private lastSecondTimestamp: number = Date.now();

  private lastMinuteTimestamp: number = Date.now();

  async addRequest<T>(request: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requests.push(async () => {
        try {
          const response = await request();
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });

      // Intentionally fire-and-forget: addRequest returns a Promise that resolves when
      // the queued request completes; the processor loop runs concurrently.
      void this.processRequests();
    });
  }

  private async processRequests() {
    if (this.processing) {
      return; // Requests are already being processed
    }

    this.processing = true;

    while (this.requests.length > 0) {
      await sleep(50);
      const currentRequest = this.requests[0];
      if (!currentRequest) {
        break;
      }

      const currentTime = Date.now();
      const elapsedSeconds = Math.floor((currentTime - this.lastSecondTimestamp) / 1000);
      const ellapsedMinutes = Math.floor((currentTime - this.lastMinuteTimestamp) / 1000 / 60);

      if (elapsedSeconds >= 1) {
        this.requestsInLastSecond = 0;
        this.lastSecondTimestamp = currentTime;
      }
      if (ellapsedMinutes >= 1) {
        this.requestsInLastMinute = 0;
        this.lastMinuteTimestamp = currentTime;
      }

      if (this.requestsInLastSecond < this.MAX_REQUESTS_PER_SECOND && this.requestsInLastMinute < this.MAX_REQUESTS_PER_MINUTE) {
        const resolveFn = this.createResolveFunction();
        const rejectFn = this.createRejectFunction();

        try {
          const response = await currentRequest();
          this.requests.shift(); // Remove the processed request
          this.requestsInLastSecond += 1;
          this.requestsInLastMinute += 1;
          resolveFn(response); // Resolve the promise with the response data
        } catch (error) {
          rejectFn(error); // Reject the promise with the error
        }
      } else {
        break; // Wait for the next second to continue processing requests
      }
    }

    this.processing = false;

    // Process any queued requests. Recursive fire-and-forget continues the loop.
    if (this.requests.length > 0) {
      void this.processRequests();
    }
  }

  private createResolveFunction(): (value?: unknown) => void {
    let resolveFn: (value?: unknown) => void;
    const promise = new Promise<unknown>((resolve) => {
      resolveFn = resolve;
    });
    promise.catch(() => {}); // Ignore unhandled promise rejection warnings
    return resolveFn!;
  }

  private createRejectFunction(): (reason?: unknown) => void {
    let rejectFn: (reason?: unknown) => void;
    const promise = new Promise<unknown>((_, reject) => {
      rejectFn = reject;
    });
    promise.catch(() => {}); // Ignore unhandled promise rejection warnings
    return rejectFn!;
  }
}

const localazyRequestProcessor = new LocalazyRequestProcessor();

export class LocalazyApiThrottleService {
  private static localazyApi = getLocalazyApi('');

  static async import(token: string, options: ImportJsonRequest) {
    this.localazyApi = getLocalazyApi(token);
    return localazyRequestProcessor.addRequest(() => this.localazyApi.import.json(options));
  }

  static async listAllKeysInFileForLanguage(token: string, options: FileListKeysRequest) {
    this.localazyApi = getLocalazyApi(token);
    return localazyRequestProcessor.addRequest(() => this.localazyApi.files.listKeys(options));
  }

  static async listProjects(token: string, options: ProjectsListRequest) {
    this.localazyApi = getLocalazyApi(token);
    return localazyRequestProcessor.addRequest(() => this.localazyApi.projects.list(options));
  }

  static async listFiles(token: string, options: FilesListRequest) {
    this.localazyApi = getLocalazyApi(token);
    return localazyRequestProcessor.addRequest(() => this.localazyApi.files.list(options));
  }

  static async updateKey(token: string, options: KeyUpdateRequest) {
    this.localazyApi = getLocalazyApi(token);
    return localazyRequestProcessor.addRequest(() => this.localazyApi.keys.update(options));
  }

  static async listWebhooks(token: string, options: WebhooksListRequest) {
    this.localazyApi = getLocalazyApi(token);
    return localazyRequestProcessor.addRequest(() => this.localazyApi.webhooks.list(options));
  }

  static async updateWebhooks(token: string, options: WebhooksUpdateRequest) {
    this.localazyApi = getLocalazyApi(token);
    return localazyRequestProcessor.addRequest(() => this.localazyApi.webhooks.update(options));
  }

  static async getWebhookSecret(token: string, options: WebhooksGetSecretRequest) {
    this.localazyApi = getLocalazyApi(token);
    return localazyRequestProcessor.addRequest(() => this.localazyApi.webhooks.getSecret(options));
  }
}
