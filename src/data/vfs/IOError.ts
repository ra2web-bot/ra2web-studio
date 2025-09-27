/**
 * Custom error type for I/O related errors, e.g., file not found, read error.
 */
export class IOError extends Error {
  public cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "IOError";
    if (cause) {
      this.cause = cause;
    }
    // If targeting ES5 or an environment without proper Error subclassing support:
    Object.setPrototypeOf(this, IOError.prototype);
  }
}
