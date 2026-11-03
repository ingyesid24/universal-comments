import { expect } from '@esm-bundle/chai';
import { CommentsAdapterError } from '../errors.js';
import type { Comment, CommentPage } from '../types.js';
import {
  createRestCommentsAdapter,
  defaultParseList,
  type RestCommentsAdapterOptions,
  type RestCommentsAdapterUrls,
} from './rest.js';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    text: 'Hola',
    date: new Date().toISOString(),
    name: 'Ana',
    avatar: 'https://example.com/a.png',
    emoji: '👍',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function fakeFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function baseOptions(
  urls: Partial<RestCommentsAdapterUrls> = {},
  overrides: Partial<RestCommentsAdapterOptions> = {},
): RestCommentsAdapterOptions {
  return {
    ...overrides,
    urls: {
      list: urls.list ?? '/comments',
      create: urls.create ?? '/comments',
      remove: urls.remove ?? ((id: string) => `/comments/${id}`),
      ...(urls.react ? { react: urls.react } : {}),
    },
  };
}

async function rejection(promise: Promise<unknown>): Promise<CommentsAdapterError> {
  try {
    await promise;
  } catch (error) {
    expect(error).to.be.instanceOf(CommentsAdapterError);
    return error as CommentsAdapterError;
  }
  throw new Error('Se esperaba un rechazo y la promesa se resolvió');
}

describe('createRestCommentsAdapter', () => {
  it('requires explicit URLs', () => {
    expect(() =>
      createRestCommentsAdapter({ urls: {} as never }),
    ).to.throw(TypeError);
    expect(() =>
      createRestCommentsAdapter({
        urls: { list: '/c', create: '/c', remove: 'bad' as never },
      }),
    ).to.throw(TypeError);
  });

  it('builds list query params for string URLs', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      jsonResponse([makeComment()]),
    );
    const adapter = createRestCommentsAdapter(
      baseOptions(
        { list: '/comments?draft=1#top' },
        { fetch: fetchImpl },
      ),
    );

    const page = await adapter.list({ limit: 2, cursor: 'a b' });

    expect(calls[0]?.url).to.equal(
      '/comments?draft=1&limit=2&cursor=a%20b#top',
    );
    expect(page.comments[0]?.text).to.equal('Hola');
  });

  it('supports a list URL function and page-shaped responses', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      jsonResponse({
        comments: [makeComment({ id: 'p1' })],
        hasMore: true,
        nextCursor: 'p1',
      }),
    );
    const adapter = createRestCommentsAdapter(
      baseOptions(
        {
          list: (query) => `/custom?limit=${query.limit ?? 10}`,
        },
        { fetch: fetchImpl },
      ),
    );

    const page = await adapter.list({ limit: 3 });

    expect(calls[0]?.url).to.equal('/custom?limit=3');
    expect(page.hasMore).to.equal(true);
    expect(page.nextCursor).to.equal('p1');
  });

  it('creates comments with auth headers and the default body', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      jsonResponse(makeComment({ id: 'new-1', text: 'Nuevo' }), 201),
    );
    const adapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          fetch: fetchImpl,
          headers: async () => ({ Authorization: 'Bearer test' }),
        },
      ),
    );

    const created = await adapter.create({
      text: 'Nuevo',
      author: { name: 'Eva' },
    });

    const call = calls[0];
    expect(call?.init?.method).to.equal('POST');
    const headers = new Headers(call?.init?.headers);
    expect(headers.get('authorization')).to.equal('Bearer test');
    expect(headers.get('content-type')).to.equal('application/json');
    expect(JSON.parse(String(call?.init?.body))).to.deep.equal({
      text: 'Nuevo',
      author: { name: 'Eva' },
    });
    expect(created.id).to.equal('new-1');
  });

  it('supports custom serializers and parsers', async () => {
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse({ data: { id: 'x', content: 'Custom' } }),
    );
    const adapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          fetch: fetchImpl,
          serializeCreate: (input) => ({ body: input.text }),
          parseComment: (data) => {
            const record = data as {
              data: { id: string; content: string };
            };
            return makeComment({
              id: record.data.id,
              text: record.data.content,
            });
          },
        },
      ),
    );

    const created = await adapter.create({ text: 'ignored' });
    expect(created.id).to.equal('x');
    expect(created.text).to.equal('Custom');
  });

  it('rejects DELETE 404 by default and can opt into idempotent deletes', async () => {
    const { fetchImpl } = fakeFetch((_url, init) => {
      if (init?.method === 'DELETE' && _url.endsWith('/missing')) {
        return jsonResponse({ message: 'Not found' }, 404);
      }
      return new Response(null, { status: 204 });
    });
    const adapter = createRestCommentsAdapter(
      baseOptions({}, { fetch: fetchImpl }),
    );

    await adapter.remove('1');
    const error = await rejection(adapter.remove('missing'));
    expect(error.code).to.equal('not-found');

    const idempotent = createRestCommentsAdapter(
      baseOptions(
        {},
        { fetch: fetchImpl, treatNotFoundAsSuccess: true },
      ),
    );
    await idempotent.remove('missing');
  });

  it('reacts when urls.react is configured and rejects otherwise', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      jsonResponse(makeComment({ emoji: '🔥' })),
    );
    const adapter = createRestCommentsAdapter(
      baseOptions(
        { react: (id) => `/comments/${id}/reactions` },
        { fetch: fetchImpl },
      ),
    );

    expect(adapter.react).to.be.a('function');
    if (!adapter.react) throw new Error('react method missing');
    const updated = await adapter.react('c1', '🔥');
    expect(calls[0]?.url).to.equal('/comments/c1/reactions');
    expect(JSON.parse(String(calls[0]?.init?.body))).to.deep.equal({
      emoji: '🔥',
    });
    expect(updated && 'emoji' in updated ? updated.emoji : undefined).to.equal(
      '🔥',
    );

    const withoutReact = createRestCommentsAdapter(
      baseOptions({}, { fetch: fetchImpl }),
    );
    expect(withoutReact.react).to.equal(undefined);
  });

  it('maps HTTP statuses to normalized errors', async () => {
    const cases: Array<[number, string, boolean]> = [
      [401, 'unauthorized', false],
      [403, 'forbidden', false],
      [408, 'timeout', true],
      [409, 'conflict', false],
      [422, 'validation', false],
      [425, 'rate-limited', true],
      [429, 'rate-limited', true],
      [500, 'server', true],
    ];

    for (const [status, code, retryable] of cases) {
      const { fetchImpl } = fakeFetch(() =>
        jsonResponse({ message: `failure-${status}` }, status),
      );
      const adapter = createRestCommentsAdapter(
        baseOptions({}, { fetch: fetchImpl }),
      );
      const error = await rejection(adapter.list());
      expect(error.code).to.equal(code);
      expect(error.status).to.equal(status);
      expect(error.retryable).to.equal(retryable);
      expect(error.message).to.equal(`failure-${status}`);
    }
  });

  it('supports custom error parsing', async () => {
    const { fetchImpl } = fakeFetch(() =>
      jsonResponse({ err: 'Teapot' }, 418),
    );
    const adapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          fetch: fetchImpl,
          parseError: (data) => ({
            message: (data as { err: string }).err,
            code: 'validation',
          }),
        },
      ),
    );

    const error = await rejection(adapter.create({ text: 'x' }));
    expect(error.message).to.equal('Teapot');
    expect(error.code).to.equal('validation');
  });

  it('normalizes network and abort failures', async () => {
    const network = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          fetch: (async () => {
            throw new TypeError('offline');
          }) as typeof fetch,
        },
      ),
    );
    const networkError = await rejection(network.list());
    expect(networkError.code).to.equal('network');
    expect(networkError.retryable).to.equal(true);

    const aborted = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          fetch: (async () => {
            throw new DOMException('Aborted', 'AbortError');
          }) as typeof fetch,
        },
      ),
    );
    const abortError = await rejection(aborted.list());
    expect(abortError.code).to.equal('aborted');
    expect(abortError.retryable).to.equal(false);
  });

  it('rejects invalid list payloads', async () => {
    const { fetchImpl } = fakeFetch(() => jsonResponse({ nope: true }));
    const adapter = createRestCommentsAdapter(
      baseOptions({}, { fetch: fetchImpl }),
    );

    const error = await rejection(adapter.list());
    expect(error.code).to.equal('server');
  });

  it('rejects invalid list items and created comments', async () => {
    const invalidItems: unknown[] = [
      null,
      {},
      { id: 'only-id' },
      { text: 'only-text' },
      { id: 'x', text: '   ' },
    ];

    for (const item of invalidItems) {
      const listAdapter = createRestCommentsAdapter(
        baseOptions(
          {},
          {
            fetch: fakeFetch(() => jsonResponse([item])).fetchImpl,
          },
        ),
      );
      const listError = await rejection(listAdapter.list());
      expect(listError.code).to.equal('server');

      const createAdapter = createRestCommentsAdapter(
        baseOptions(
          {},
          {
            fetch: fakeFetch(() => jsonResponse(item)).fetchImpl,
          },
        ),
      );
      const createError = await rejection(createAdapter.create({ text: 'x' }));
      expect(createError.code).to.equal('server');
    }

    const emptyAdapter = createRestCommentsAdapter(
      baseOptions(
        {},
        { fetch: fakeFetch(() => jsonResponse([])).fetchImpl },
      ),
    );
    const page = await emptyAdapter.list();
    expect(page.comments).to.have.length(0);
  });

  it('parses application/problem+json errors', async () => {
    const { fetchImpl } = fakeFetch(
      () =>
        new Response(JSON.stringify({ message: 'expired' }), {
          status: 401,
          headers: { 'content-type': 'application/problem+json' },
        }),
    );
    const adapter = createRestCommentsAdapter(
      baseOptions({}, { fetch: fetchImpl }),
    );

    const error = await rejection(adapter.list());
    expect(error.code).to.equal('unauthorized');
    expect(error.status).to.equal(401);
    expect(error.message).to.equal('expired');
  });

  it('normalizes errors thrown by headers, serializers and parsers', async () => {
    const headersAdapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          headers: () => {
            throw new Error('headers boom');
          },
          fetch: fakeFetch(() => jsonResponse([])).fetchImpl,
        },
      ),
    );
    const headersError = await rejection(headersAdapter.list());
    expect(headersError.code).to.equal('unknown');
    expect((headersError.cause as Error).message).to.equal('headers boom');

    const serializerAdapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          serializeCreate: () => {
            throw new Error('serialize boom');
          },
          fetch: fakeFetch(() => jsonResponse(makeComment())).fetchImpl,
        },
      ),
    );
    const serializerError = await rejection(
      serializerAdapter.create({ text: 'x' }),
    );
    expect(serializerError.code).to.equal('unknown');
    expect((serializerError.cause as Error).message).to.equal(
      'serialize boom',
    );

    const parserAdapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          parseList: () => {
            throw new Error('parser boom');
          },
          fetch: fakeFetch(() => jsonResponse([])).fetchImpl,
        },
      ),
    );
    const parserError = await rejection(parserAdapter.list());
    expect(parserError.code).to.equal('server');
    expect((parserError.cause as Error).message).to.equal('parser boom');

    const errorParserAdapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          parseError: () => {
            throw new Error('error parser boom');
          },
          fetch: fakeFetch(() => jsonResponse({}, 500)).fetchImpl,
        },
      ),
    );
    const errorParserFailure = await rejection(errorParserAdapter.list());
    expect(errorParserFailure.code).to.equal('server');
    expect(errorParserFailure.status).to.equal(500);
    expect((errorParserFailure.cause as Error).message).to.equal(
      'error parser boom',
    );
  });

  it('enforces a configurable timeout', async () => {
    const adapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          timeoutMs: 20,
          fetch: (() => new Promise<Response>(() => undefined)) as typeof fetch,
        },
      ),
    );

    const error = await rejection(adapter.list());
    expect(error.code).to.equal('timeout');
    expect(error.retryable).to.equal(true);
    expect(error.message).to.include('tiempo de espera');
  });

  it('honours a pre-aborted caller signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          fetch: (() => new Promise<Response>(() => undefined)) as typeof fetch,
        },
      ),
    );

    const error = await rejection(adapter.list({ signal: controller.signal }));
    expect(error.code).to.equal('aborted');
    expect(error.retryable).to.equal(false);
  });

  it('surfaces caller cancellation even if fetch ignores the signal', async () => {
    const controller = new AbortController();
    const adapter = createRestCommentsAdapter(
      baseOptions(
        {},
        {
          fetch: (() => new Promise<Response>(() => undefined)) as typeof fetch,
        },
      ),
    );

    const promise = adapter.list({ signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    const error = await rejection(promise);
    expect(error.code).to.equal('aborted');
    expect(error.retryable).to.equal(false);
  });

  it('defaultParseList normalizes safe avatars and unsafe ones', () => {
    const page: CommentPage = defaultParseList([
      makeComment({ id: 'a', avatar: 'javascript:alert(1)' }),
      makeComment({ id: 'b', avatar: '/local.png' }),
    ]);

    expect(page.comments[0]?.avatar).to.match(/^https:\/\/i\.pravatar\.cc/);
    expect(page.comments[1]?.avatar).to.equal('/local.png');
  });
});
