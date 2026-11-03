import {
  CommentsAdapterError,
  isAbortError,
  isCommentsAdapterError,
  toCommentsAdapterError,
} from '../errors.js';
import { normalizeComment } from '../internal/utils.js';
import type {
  AdapterCallOptions,
  Comment,
  CommentPage,
  CommentQuery,
  CommentsAdapter,
  CommentsErrorCode,
  NewCommentInput,
} from '../types.js';

export interface RestCommentsAdapterUrls {
  /**
   * Endpoint for `GET`. It can be a function to control query serialization,
   * or a string; in that case `limit` and `cursor` are appended as query
   * parameters by this adapter.
   */
  list: string | ((query: CommentQuery) => string);
  /** Endpoint for `POST`. */
  create: string | (() => string);
  /** Builds the endpoint for `DELETE`. */
  remove: (id: string) => string;
  /** Optional endpoint for `POST` reactions. */
  react?: (id: string) => string;
}

export interface RestErrorPayload {
  message?: string;
  code?: CommentsErrorCode;
}

export interface RestCommentsAdapterOptions {
  urls: RestCommentsAdapterUrls;
  /** Injectable fetch implementation (useful for tests, proxies or SSR). */
  fetch?: typeof fetch;
  /** Static headers or a function evaluated before every request. */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  credentials?: RequestCredentials;
  parseList?: (data: unknown, response: Response) => CommentPage;
  parseComment?: (data: unknown, response: Response) => Comment;
  parseError?: (
    data: unknown,
    response: Response,
  ) => RestErrorPayload | void;
  /** Defaults to `{ text, author }` (author omitted when absent). */
  serializeCreate?: (input: NewCommentInput) => unknown;
  /** Defaults to `{ emoji }`. */
  serializeReaction?: (emoji: string) => unknown;
  /**
   * Optional timeout for every HTTP request. When it expires, the request is
   * aborted (if the transport supports it) and a `timeout` error is produced.
   */
  timeoutMs?: number;
  /**
   * By default a `404` on DELETE is an error. Set this to `true` only when the
   * backend uses idempotent deletes and returns 404 for already-deleted items.
   */
  treatNotFoundAsSuccess?: boolean;
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'DELETE';
  body?: string;
  hasBody?: boolean;
  signal?: AbortSignal;
}

function statusToCode(status: number): CommentsErrorCode {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 408) return 'timeout';
  if (status === 425) return 'rate-limited';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  return 'unknown';
}

function isRetryable(status: number, code: CommentsErrorCode): boolean {
  if (
    code === 'network' ||
    code === 'rate-limited' ||
    code === 'timeout' ||
    code === 'server'
  ) {
    return true;
  }
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function defaultParseList(data: unknown): CommentPage {
  if (Array.isArray(data)) {
    return {
      comments: data.map((item) => normalizeServerComment(item)),
    };
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.comments)) {
      const page: CommentPage = {
        comments: record.comments.map((item) =>
          normalizeServerComment(item),
        ),
      };
      if (typeof record.nextCursor === 'string' || record.nextCursor === null) {
        page.nextCursor = record.nextCursor;
      }
      if (typeof record.hasMore === 'boolean') {
        page.hasMore = record.hasMore;
      }
      return page;
    }
  }

  throw new CommentsAdapterError(
    'Respuesta de listado inválida: se esperaba un array o { comments: [] }',
    { code: 'server', retryable: true, cause: data },
  );
}

function normalizeServerComment(data: unknown): Comment {
  if (!data || typeof data !== 'object') {
    throw new CommentsAdapterError(
      'Respuesta de comentario inválida: se esperaba un objeto',
      { code: 'server', retryable: true, cause: data },
    );
  }

  const record = data as Record<string, unknown>;
  const validId =
    (typeof record.id === 'string' && record.id.trim().length > 0) ||
    (typeof record.id === 'number' && Number.isFinite(record.id));
  const validText =
    typeof record.text === 'string' && record.text.trim().length > 0;

  if (!validId || !validText) {
    throw new CommentsAdapterError(
      'Respuesta de comentario inválida: faltan id o texto',
      { code: 'server', retryable: true, cause: data },
    );
  }

  return normalizeComment(record);
}

export function defaultParseComment(data: unknown): Comment {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const candidate =
      record.comment && typeof record.comment === 'object'
        ? record.comment
        : data;
    return normalizeServerComment(candidate);
  }

  throw new CommentsAdapterError(
    'Respuesta de comentario inválida: se esperaba un objeto',
    { code: 'server', retryable: true, cause: data },
  );
}

export function defaultParseError(
  data: unknown,
  response: Response,
): RestErrorPayload {
  if (data && typeof data === 'object') {
    const message = (data as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) {
      return { message: message.trim().slice(0, 300) };
    }
  }

  if (typeof data === 'string' && data.trim()) {
    return { message: data.trim().slice(0, 300) };
  }

  return { message: response.statusText || `HTTP ${response.status}` };
}

function appendQuery(
  url: string,
  params: { limit?: number; cursor?: string | null },
): string {
  const query: string[] = [];

  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    query.push(`limit=${encodeURIComponent(String(params.limit))}`);
  }
  if (typeof params.cursor === 'string' && params.cursor) {
    query.push(`cursor=${encodeURIComponent(params.cursor)}`);
  }

  if (query.length === 0) return url;

  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);

  return `${base}${base.includes('?') ? '&' : '?'}${query.join('&')}${hash}`;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null;

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = /(^|[/+])json\b/i.test(contentType);
  if (isJson) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text ? text : null;
}

const TIMEOUT = Symbol('universal-comments-timeout');
const ABORTED = Symbol('universal-comments-aborted');

function wrapCallbackError(
  error: unknown,
  message: string,
  code: CommentsErrorCode,
  retryable: boolean,
): CommentsAdapterError {
  if (isCommentsAdapterError(error)) {
    return toCommentsAdapterError(error);
  }
  return new CommentsAdapterError(message, {
    code,
    retryable,
    cause: error,
  });
}

/**
 * Creates a configurable REST adapter. It deliberately assumes no endpoint
 * shape, response schema or authentication mechanism: URLs, parsers,
 * serializers and headers must be provided by the consumer.
 *
 * Documented defaults (all overridable):
 * - `GET list` response: `Comment[]` or `{ comments: Comment[] }`.
 * - `POST create` body: `{ text, author? }`.
 * - `POST react` body: `{ emoji }`.
 * - `DELETE remove`: a `404` is treated as success (idempotent delete).
 */
export function createRestCommentsAdapter(
  options: RestCommentsAdapterOptions,
): CommentsAdapter {
  if (!options || !options.urls) {
    throw new TypeError('createRestCommentsAdapter requiere { urls }');
  }

  const { urls } = options;
  if (!urls.list) {
    throw new TypeError('urls.list es obligatorio');
  }
  if (!urls.create) {
    throw new TypeError('urls.create es obligatorio');
  }
  if (typeof urls.remove !== 'function') {
    throw new TypeError('urls.remove debe ser una función (id) => string');
  }

  const parseList = options.parseList ?? defaultParseList;
  const parseComment = options.parseComment ?? defaultParseComment;
  const parseError = options.parseError ?? defaultParseError;
  const serializeCreate =
    options.serializeCreate ?? defaultSerializeCreate;
  const serializeReaction =
    options.serializeReaction ?? ((emoji: string) => ({ emoji }));
  function getFetch(): typeof fetch {
    if (options.fetch) return options.fetch;
    if (typeof fetch === 'function') return fetch.bind(globalThis);
    throw new CommentsAdapterError(
      'No hay una implementación de fetch disponible. Proporciona options.fetch.',
      { code: 'unknown', retryable: false },
    );
  }

  async function buildHeaders(hasBody: boolean): Promise<Headers> {
    const headers = new Headers();
    const configured =
      typeof options.headers === 'function'
        ? await options.headers()
        : options.headers;

    if (configured) {
      new Headers(configured).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    if (hasBody && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    return headers;
  }

  async function request(
    url: string,
    init: RequestOptions,
  ): Promise<{ response: Response; data: unknown }> {
    const fetchImpl = getFetch();

    let headers: Headers;
    try {
      headers = await buildHeaders(Boolean(init.hasBody));
    } catch (cause) {
      throw wrapCallbackError(
        cause,
        'No se pudieron preparar las cabeceras de la petición',
        'unknown',
        false,
      );
    }

    const controller = new AbortController();
    const callerSignal = init.signal;
    let abortPromise: Promise<never> | null = null;
    let abortReject: ((reason?: unknown) => void) | undefined;
    const onCallerAbort = (): void => {
      controller.abort(callerSignal?.reason);
      abortReject?.(ABORTED);
    };
    if (callerSignal) {
      abortPromise = new Promise<never>((_, reject) => {
        abortReject = reject;
      });
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason);
      } else {
        callerSignal.addEventListener('abort', onCallerAbort, { once: true });
      }
    }

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timeoutPromise: Promise<never> | null = null;
    const timeoutMs = options.timeoutMs;
    if (
      typeof timeoutMs === 'number' &&
      Number.isFinite(timeoutMs) &&
      timeoutMs > 0
    ) {
      timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(TIMEOUT);
        }, timeoutMs);
      });
    }

    const timeoutError = (): CommentsAdapterError =>
      new CommentsAdapterError(
        'La operación excedió el tiempo de espera',
        { code: 'timeout', retryable: true },
      );

    let response: Response;
    try {
      if (callerSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const fetchPromise = fetchImpl(url, {
        method: init.method,
        headers,
        body: init.body,
        signal: controller.signal,
        credentials: options.credentials,
      });

      const pending: Array<Promise<Response> | Promise<never>> = [fetchPromise];
      if (timeoutPromise) pending.push(timeoutPromise);
      if (abortPromise) pending.push(abortPromise);
      response = pending.length > 1
        ? await Promise.race(pending)
        : await fetchPromise;

      if (timedOut) throw TIMEOUT;
      if (controller.signal.aborted) {
        throw ABORTED;
      }
    } catch (error) {
      if (timedOut || error === TIMEOUT) {
        throw timeoutError();
      }
      if (
        error === ABORTED ||
        isAbortError(error) ||
        controller.signal.aborted ||
        callerSignal?.aborted
      ) {
        throw new CommentsAdapterError('La operación fue cancelada', {
          code: 'aborted',
          retryable: false,
          cause: error,
        });
      }
      throw new CommentsAdapterError(
        'No se pudo conectar con el servidor',
        { code: 'network', retryable: true, cause: error },
      );
    } finally {
      if (timer) clearTimeout(timer);
      if (callerSignal && !callerSignal.aborted) {
        callerSignal.removeEventListener('abort', onCallerAbort);
      }
    }

    let data: unknown;
    try {
      data = await readBody(response);
    } catch (cause) {
      throw new CommentsAdapterError(
        'No se pudo leer la respuesta del servidor',
        { code: 'network', retryable: true, cause },
      );
    }

    if (!response.ok) {
      let parsed: RestErrorPayload | void;
      try {
        parsed = parseError(data, response);
      } catch (cause) {
        const code = statusToCode(response.status);
        throw new CommentsAdapterError(
          `HTTP ${response.status}`,
          {
            code,
            status: response.status,
            retryable: isRetryable(response.status, code),
            cause,
          },
        );
      }

      const code = parsed?.code ?? statusToCode(response.status);
      throw new CommentsAdapterError(
        parsed?.message?.trim() ||
          response.statusText ||
          `HTTP ${response.status}`,
        {
          code,
          status: response.status,
          retryable: isRetryable(response.status, code),
          cause: data,
        },
      );
    }

    return { response, data };
  }

  const adapter: CommentsAdapter = {
    async list(query: CommentQuery = {}): Promise<CommentPage> {
      let url: string;
      try {
        url =
          typeof urls.list === 'function'
            ? urls.list(query)
            : appendQuery(urls.list, {
                limit: query.limit,
                cursor: query.cursor,
              });
      } catch (cause) {
        throw wrapCallbackError(
          cause,
          'No se pudo construir la URL de listado',
          'unknown',
          false,
        );
      }

      const { response, data } = await request(url, {
        method: 'GET',
        signal: query.signal,
      });

      try {
        return parseList(data, response);
      } catch (cause) {
        throw wrapCallbackError(
          cause,
          'Respuesta de listado inválida',
          'server',
          true,
        );
      }
    },

    async create(
      input: NewCommentInput,
      callOptions: AdapterCallOptions = {},
    ): Promise<Comment> {
      let url: string;
      let body: string;
      try {
        url =
          typeof urls.create === 'function' ? urls.create() : urls.create;
        body = JSON.stringify(serializeCreate(input));
      } catch (cause) {
        throw wrapCallbackError(
          cause,
          'No se pudo preparar la petición de creación',
          'unknown',
          false,
        );
      }

      const { response, data } = await request(url, {
        method: 'POST',
        body,
        hasBody: true,
        signal: callOptions.signal,
      });

      try {
        return parseComment(data, response);
      } catch (cause) {
        throw wrapCallbackError(
          cause,
          'Respuesta de comentario inválida',
          'server',
          true,
        );
      }
    },

    async remove(
      id: string,
      callOptions: AdapterCallOptions = {},
    ): Promise<void> {
      let url: string;
      try {
        url = urls.remove(id);
      } catch (cause) {
        throw wrapCallbackError(
          cause,
          'No se pudo construir la URL de eliminación',
          'unknown',
          false,
        );
      }

      try {
        await request(url, {
          method: 'DELETE',
          signal: callOptions.signal,
        });
      } catch (error) {
        if (
          options.treatNotFoundAsSuccess === true &&
          isCommentsAdapterError(error) &&
          toCommentsAdapterError(error).code === 'not-found'
        ) {
          return;
        }
        throw error;
      }
    },
  };

  // Only expose `react` when the consumer configured an endpoint. Otherwise the
  // component keeps reactions local, exactly like in legacy mode.
  const reactUrl = urls.react;
  if (reactUrl) {
    adapter.react = async (
      id: string,
      emoji: string,
      callOptions: AdapterCallOptions = {},
    ): Promise<Comment | void> => {
      let url: string;
      let body: string;
      try {
        url = reactUrl(id);
        body = JSON.stringify(serializeReaction(emoji));
      } catch (cause) {
        throw wrapCallbackError(
          cause,
          'No se pudo preparar la petición de reacción',
          'unknown',
          false,
        );
      }

      const { response, data } = await request(url, {
        method: 'POST',
        body,
        hasBody: true,
        signal: callOptions.signal,
      });

      if (data === null) return;

      try {
        return parseComment(data, response);
      } catch (cause) {
        throw wrapCallbackError(
          cause,
          'Respuesta de reacción inválida',
          'server',
          true,
        );
      }
    };
  }

  return adapter;
}

function defaultSerializeCreate(input: NewCommentInput): unknown {
  return input.author
    ? { text: input.text, author: input.author }
    : { text: input.text };
}
