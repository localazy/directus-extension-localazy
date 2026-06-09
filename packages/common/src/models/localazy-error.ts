type ErrorWithCaptureStackTrace = ErrorConstructor & {
  captureStackTrace?: (target: object, ctor: new (...args: never[]) => unknown) => void;
};

export class LocalazyError extends Error {
  public code!: number;

  public error!: string;

  constructor(error: string, message: string, code: number) {
    super(message);
    this.name = 'LocalazyError';
    this.error = error;
    this.code = code;

    const errorCtor = LocalazyError as unknown as ErrorWithCaptureStackTrace;
    if (errorCtor.captureStackTrace) {
      errorCtor.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack;
    }
  }
}
