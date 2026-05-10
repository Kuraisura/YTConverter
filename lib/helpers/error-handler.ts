/**
 * Centralized error handling and logging
 */

export enum ErrorType {
  R2_UPLOAD = 'R2_UPLOAD',
  R2_DELETE = 'R2_DELETE',
  DOWNLOAD = 'DOWNLOAD',
  CONVERSION = 'CONVERSION',
  QUEUE = 'QUEUE',
  VALIDATION = 'VALIDATION',
  CLEANUP = 'CLEANUP',
  UNKNOWN = 'UNKNOWN',
}

export interface ErrorContext {
  type: ErrorType;
  jobId?: string;
  details?: Record<string, any>;
  originalError?: Error;
}

export class ConversionError extends Error {
  constructor(
    message: string,
    public type: ErrorType,
    public context: Omit<ErrorContext, 'type'>
  ) {
    super(message);
    this.name = 'ConversionError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      context: this.context,
    };
  }
}

/**
 * Structured logging with context
 */
export function logError(context: ErrorContext, message: string, metadata?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const jobId = context.jobId ? ` [${context.jobId}]` : '';
  const logEntry = {
    timestamp,
    level: 'ERROR',
    type: context.type,
    jobId: context.jobId,
    message,
    metadata: {
      ...context.details,
      ...metadata,
    },
    originalError: context.originalError ? context.originalError.message : undefined,
  };

  console.error(`[${context.type}]${jobId} ${message}`, logEntry);
  return logEntry;
}

export function logInfo(type: string, message: string, metadata?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: 'INFO',
    type,
    message,
    metadata,
  };

  console.log(`[${type}] ${message}`, metadata ? JSON.stringify(metadata) : '');
  return logEntry;
}

export function logWarning(type: string, message: string, metadata?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: 'WARN',
    type,
    message,
    metadata,
  };

  console.warn(`[${type}] ${message}`, metadata ? JSON.stringify(metadata) : '');
  return logEntry;
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  return 'Unknown error occurred';
}
