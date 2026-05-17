import { Project } from '@localazy/api-client';
import { LocalazyApiThrottleService } from './localazy-api-throttle-service';

/**
 * Pure helper used by the Automated export and deprecation pipelines. Loads the first
 * Localazy project visible to the supplied access token, with organisation and language
 * metadata hydrated (both are required downstream for payment-status gating and language
 * resolution).
 *
 * Returns `null` only when no token is supplied. API failures bubble — the caller's
 * pipeline maps them to a `failed` outcome.
 */
export async function loadLocalazyProject(token: string): Promise<Project | null> {
  if (!token) {
    return null;
  }
  const projects = await LocalazyApiThrottleService.listProjects(token, { organization: true, languages: true });
  return projects[0] || null;
}
