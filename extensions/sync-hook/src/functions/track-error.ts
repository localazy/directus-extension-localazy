/* eslint-disable no-console */
import { AxiosError } from 'axios';

export function trackDirectusError(error: AxiosError | Error, type: string) {
  console.log(type, error);
}

export function trackLocalazyError(error: AxiosError | Error, type: string) {
  console.log(type, error);
}
