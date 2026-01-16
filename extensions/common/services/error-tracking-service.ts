/* eslint-disable no-console */
import { AxiosError } from 'axios';

/**
 * Error severity levels for categorization.
 * Used to prioritize and triage errors in logging and monitoring.
 */
export enum ErrorSeverity {
  /** Minor issues that don't affect functionality */
  LOW = 'low',
  /** Issues that may affect user experience but have workarounds */
  MEDIUM = 'medium',
  /** Significant issues that affect core functionality */
  HIGH = 'high',
  /** System-breaking issues requiring immediate attention */
  CRITICAL = 'critical',
}

/**
 * Error categories for classification.
 * Helps in grouping and filtering errors by their source.
 */
export enum ErrorCategory {
  /** Network connectivity issues (timeouts, connection refused) */
  NETWORK = 'network',
  /** Input validation failures */
  VALIDATION = 'validation',
  /** API response errors (Directus or Localazy) */
  API = 'api',
  /** Configuration or setup errors */
  CONFIGURATION = 'configuration',
  /** Errors that don't fit other categories */
  UNKNOWN = 'unknown',
}

/**
 * Structured error information for consistent logging and tracking.
 */
interface ErrorInfo {
  /** ISO 8601 timestamp when the error occurred */
  timestamp: string;
  /** Error category for classification */
  category: ErrorCategory;
  /** Error severity for prioritization */
  severity: ErrorSeverity;
  /** Error type identifier (e.g., 'fetchTranslationStrings', 'exportContent') */
  type: string;
  /** Human-readable error message */
  message: string;
  /** Additional error context and metadata */
  details?: Record<string, unknown>;
  /** Stack trace if available */
  stack?: string;
}

/**
 * Centralized error tracking service with structured logging and categorization.
 *
 * Provides consistent error handling across the extension with:
 * - Automatic severity classification based on HTTP status codes
 * - Structured logging with source identification
 * - Error storage with configurable size limit
 * - Category-based error retrieval and counting
 *
 * @example
 * ```typescript
 * try {
 *   await fetchData();
 * } catch (error) {
 *   ErrorTrackingService.trackDirectusError(error, 'fetchData', { userId: '123' });
 * }
 *
 * // Later, retrieve errors for analysis
 * const apiErrors = ErrorTrackingService.getErrorsByCategory(ErrorCategory.API);
 * const counts = ErrorTrackingService.getErrorCounts();
 * ```
 */
export class ErrorTrackingService {
  private static errors: ErrorInfo[] = [];

  private static maxErrorsStored = 100;

  /**
   * Track a Directus-related error
   */
  static trackDirectusError(error: AxiosError | Error, type: string, details?: Record<string, unknown>): void {
    const errorInfo = this.buildErrorInfo(error, type, ErrorCategory.API, details);
    this.logAndStore(errorInfo, 'Directus');
  }

  /**
   * Track a Localazy-related error
   */
  static trackLocalazyError(error: AxiosError | Error, type: string, details?: Record<string, unknown>): void {
    const errorInfo = this.buildErrorInfo(error, type, ErrorCategory.API, details);
    this.logAndStore(errorInfo, 'Localazy');
  }

  /**
   * Track a network-related error
   */
  static trackNetworkError(error: AxiosError | Error, type: string, details?: Record<string, unknown>): void {
    const errorInfo = this.buildErrorInfo(error, type, ErrorCategory.NETWORK, details);
    this.logAndStore(errorInfo, 'Network');
  }

  /**
   * Track a validation error
   */
  static trackValidationError(message: string, type: string, details?: Record<string, unknown>): void {
    const errorInfo: ErrorInfo = {
      timestamp: new Date().toISOString(),
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      type,
      message,
      details,
    };
    this.logAndStore(errorInfo, 'Validation');
  }

  /**
   * Track a configuration error
   */
  static trackConfigurationError(message: string, type: string, details?: Record<string, unknown>): void {
    const errorInfo: ErrorInfo = {
      timestamp: new Date().toISOString(),
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.HIGH,
      type,
      message,
      details,
    };
    this.logAndStore(errorInfo, 'Configuration');
  }

  /**
   * Get all stored errors
   */
  static getErrors(): ErrorInfo[] {
    return [...this.errors];
  }

  /**
   * Get errors by category
   */
  static getErrorsByCategory(category: ErrorCategory): ErrorInfo[] {
    return this.errors.filter((e) => e.category === category);
  }

  /**
   * Clear all stored errors
   */
  static clearErrors(): void {
    this.errors = [];
  }

  /**
   * Get error count by category
   */
  static getErrorCounts(): Record<ErrorCategory, number> {
    const counts: Record<ErrorCategory, number> = {
      [ErrorCategory.NETWORK]: 0,
      [ErrorCategory.VALIDATION]: 0,
      [ErrorCategory.API]: 0,
      [ErrorCategory.CONFIGURATION]: 0,
      [ErrorCategory.UNKNOWN]: 0,
    };

    this.errors.forEach((e) => {
      counts[e.category] += 1;
    });

    return counts;
  }

  private static buildErrorInfo(
    error: AxiosError | Error,
    type: string,
    category: ErrorCategory,
    details?: Record<string, unknown>,
  ): ErrorInfo {
    const isAxiosError = (err: unknown): err is AxiosError =>
      err !== null && typeof err === 'object' && 'isAxiosError' in err;

    let message = error.message || 'Unknown error';
    let severity = ErrorSeverity.MEDIUM;
    const errorDetails: Record<string, unknown> = { ...details };

    if (isAxiosError(error)) {
      const status = error.response?.status;
      errorDetails.status = status;
      errorDetails.url = error.config?.url;
      errorDetails.method = error.config?.method;

      if (status) {
        message = `HTTP ${status}: ${error.message}`;
        if (status >= 500) {
          severity = ErrorSeverity.HIGH;
        } else if (status === 401 || status === 403) {
          severity = ErrorSeverity.HIGH;
        } else if (status === 429) {
          severity = ErrorSeverity.MEDIUM;
          message = 'Rate limit exceeded';
        }
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        severity = ErrorSeverity.HIGH;
      }
    }

    return {
      timestamp: new Date().toISOString(),
      category,
      severity,
      type,
      message,
      details: Object.keys(errorDetails).length > 0 ? errorDetails : undefined,
      stack: error.stack,
    };
  }

  private static logAndStore(errorInfo: ErrorInfo, source: string): void {
    // Structured console output
    const logPrefix = `[Localazy:${source}]`;
    const logMessage = `${logPrefix} ${errorInfo.type}: ${errorInfo.message}`;

    switch (errorInfo.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error(logMessage, errorInfo.details || '');
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(logMessage, errorInfo.details || '');
        break;
      default:
        console.log(logMessage, errorInfo.details || '');
    }

    // Store error with size limit
    this.errors.push(errorInfo);
    if (this.errors.length > this.maxErrorsStored) {
      this.errors.shift(); // Remove oldest error
    }
  }
}

// Re-export legacy functions for backward compatibility
export function trackDirectusError(error: AxiosError | Error, type: string): void {
  ErrorTrackingService.trackDirectusError(error, type);
}

export function trackLocalazyError(error: AxiosError | Error, type: string): void {
  ErrorTrackingService.trackLocalazyError(error, type);
}
