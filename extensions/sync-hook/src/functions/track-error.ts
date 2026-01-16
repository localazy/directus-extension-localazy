/**
 * Error tracking functions for the sync-hook extension.
 * Re-exports from the common error tracking service for backward compatibility.
 */
import { AxiosError } from 'axios';
import { ErrorTrackingService } from '../../../common/services/error-tracking-service';

export function trackDirectusError(error: AxiosError | Error, type: string): void {
  ErrorTrackingService.trackDirectusError(error, type);
}

export function trackLocalazyError(error: AxiosError | Error, type: string): void {
  ErrorTrackingService.trackLocalazyError(error, type);
}

// Export the service for advanced usage
export { ErrorTrackingService };
