import { AxiosError } from 'axios';
import type { DirectusLogger } from '../types/directus-services';

/**
 * Normalise an `unknown` thrown value into an Error instance so downstream
 * consumers can rely on a stable shape (message, stack, etc.).
 */
function normaliseError(error: unknown): AxiosError | Error {
  if (error instanceof AxiosError || error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

/**
 * Surface a Directus-side error at `error` severity on the Pino logger Directus injects
 * into the bundle context. Structured fields (`errorType`, `source`) make the entry
 * filterable in log aggregators; pino's built-in `err` serializer renders the
 * stack/message/code. The `type` doubles as the human-readable log message so a tail of
 * `directus_log` still reads naturally.
 */
export function trackDirectusError(logger: DirectusLogger, error: unknown, type: string) {
  logger.error({ err: normaliseError(error), errorType: type, source: 'directus' }, type);
}

/**
 * Localazy-side counterpart to `trackDirectusError`. Same shape; the `source` field
 * separates the two so operators can filter by origin.
 */
export function trackLocalazyError(logger: DirectusLogger, error: unknown, type: string) {
  logger.error({ err: normaliseError(error), errorType: type, source: 'localazy' }, type);
}
