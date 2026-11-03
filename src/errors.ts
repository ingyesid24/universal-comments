import type { CommentsErrorCode } from './types.js';

export interface CommentsAdapterErrorOptions {
  code?: CommentsErrorCode;
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}

const ERROR_BRAND = Symbol.for('universal-comments.adapter-error');

const ERROR_CODES: ReadonlySet<string> = new Set([
  'network',
  'unauthorized',
  'forbidden',
  'not-found',
  'conflict',
  'validation',
  'rate-limited',
  'timeout',
  'server',
  'aborted',
  'unknown',
]);

/**
 * Normalized storage error exposed by the component and the built-in adapters.
 *
 * The component never performs retries by itself; `retryable` is a hint for the
 * UI (and for consumers), not an instruction to retry automatically.
 *
 * A global brand is used in addition to `instanceof` so errors keep their
 * metadata when the main bundle and the adapters bundle are loaded separately.
 */
export class CommentsAdapterError extends Error {
  readonly code: CommentsErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, options: CommentsAdapterErrorOptions = {}) {
    super(message);
    this.name = 'CommentsAdapterError';
    this.code = options.code ?? 'unknown';
    this.status = options.status;
    this.retryable =
      options.retryable ??
      (this.code === 'network' ||
        this.code === 'server' ||
        this.code === 'rate-limited' ||
        this.code === 'timeout' ||
        this.code === 'unknown');
    this.cause = options.cause;
    Object.defineProperty(this, ERROR_BRAND, { value: true });
    // Required when targeting ES5/ES2015 builds; harmless on modern targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function isCommentsErrorCode(value: unknown): value is CommentsErrorCode {
  return typeof value === 'string' && ERROR_CODES.has(value);
}

/**
 * Works across the main and adapters bundles, where `instanceof` is not
 * reliable because each bundle contains its own copy of this class.
 */
export function isCommentsAdapterError(
  value: unknown,
): value is CommentsAdapterError {
  if (value instanceof CommentsAdapterError) return true;
  if (typeof value !== 'object' || value === null) return false;
  return (value as Record<PropertyKey, unknown>)[ERROR_BRAND] === true;
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Wraps any thrown value into a `CommentsAdapterError`, preserving an existing
 * normalized error (even from another bundle) with its code/status/retryable
 * and cause.
 */
export function toCommentsAdapterError(error: unknown): CommentsAdapterError {
  if (error instanceof CommentsAdapterError) return error;

  if (isCommentsAdapterError(error)) {
    const external = error as CommentsAdapterError;
    return new CommentsAdapterError(
      typeof external.message === 'string' && external.message
        ? external.message
        : 'Error desconocido',
      {
        code: isCommentsErrorCode(external.code) ? external.code : 'unknown',
        status:
          typeof external.status === 'number' ? external.status : undefined,
        retryable:
          typeof external.retryable === 'boolean'
            ? external.retryable
            : undefined,
        cause: external.cause ?? error,
      },
    );
  }

  if (isAbortError(error)) {
    return new CommentsAdapterError('La operación fue cancelada', {
      code: 'aborted',
      retryable: false,
      cause: error,
    });
  }

  if (error instanceof Error) {
    return new CommentsAdapterError(error.message || 'Error desconocido', {
      code: 'unknown',
      retryable: true,
      cause: error,
    });
  }

  return new CommentsAdapterError(
    typeof error === 'string' && error ? error : 'Error desconocido',
    {
      code: 'unknown',
      retryable: true,
      cause: error,
    },
  );
}
