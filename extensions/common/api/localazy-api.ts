import { ApiClient } from '@localazy/api-client';
import { getConfig } from '../config/get-config';

export const getLocalazyApi = (accessToken: string) => new ApiClient({
  authToken: accessToken,
  apiUrl: getConfig().LOCALAZY_API_URL,
});
