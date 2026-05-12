import { AxiosError } from 'axios';

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

export function trackDirectusError(error: unknown, type: string) {
  console.log(type, normaliseError(error));
}

export function trackLocalazyError(error: unknown, type: string) {
  console.log(type, normaliseError(error));
}
