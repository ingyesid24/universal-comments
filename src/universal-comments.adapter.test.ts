import { expect } from '@esm-bundle/chai';
import { CommentsAdapterError } from './errors.js';
import type {
  Comment,
  CommentPage,
  CommentsAdapter,
  NewCommentInput,
} from './types.js';
import './universal-comments.js';
import type { UniversalComments } from './universal-comments.js';

const mounted: HTMLElement[] = [];

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    text: 'Comentario de prueba',
    date: new Date().toISOString(),
    name: 'Ana García',
    avatar: 'https://example.com/ana.png',
    emoji: '👍',
    ...overrides,
  };
}

function createElement(
  props: Partial<UniversalComments> = {},
): UniversalComments {
  const element = document.createElement(
    'universal-comments',
  ) as UniversalComments;
  Object.assign(element, props);
  return element;
}

function mount(element: UniversalComments): UniversalComments {
  document.body.appendChild(element);
  mounted.push(element);
  return element;
}

async function flush(element: UniversalComments): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function submit(element: UniversalComments, text: string): void {
  const textarea = element.shadowRoot?.querySelector('textarea');
  const button = element.shadowRoot?.querySelector(
    '.submit-btn',
  ) as HTMLButtonElement | null;
  if (!textarea || !button) throw new Error('No se encontró el formulario');
  textarea.value = text;
  textarea.dispatchEvent(new Event('input'));
  button.click();
}

function adapterWith(
  overrides: Partial<CommentsAdapter> = {},
): CommentsAdapter {
  return {
    list: async () => ({ comments: [] }),
    create: async (input: NewCommentInput) =>
      makeComment({ id: 'created', text: input.text }),
    remove: async () => undefined,
    ...overrides,
  };
}

describe('universal-comments (adapter mode)', () => {
  afterEach(() => {
    while (mounted.length > 0) {
      mounted.pop()?.remove();
    }
  });

  it('loads comments and emits comments-loaded', async () => {
    let detail!: { comments: Comment[] };
    const adapter = adapterWith({
      list: async () => ({ comments: [makeComment({ id: 'a' })] }),
    });
    const element = createElement();
    element.addEventListener('comments-loaded', (event) => {
      detail = (event as CustomEvent).detail;
    });

    element.adapter = adapter;
    mount(element);
    await flush(element);

    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      1,
    );
    expect(detail?.comments).to.have.length(1);
    expect(
      element.shadowRoot?.querySelector('.container')?.getAttribute('aria-busy'),
    ).to.equal('false');
  });

  it('shows an accessible skeleton while loading', async () => {
    const pending = deferred<CommentPage>();
    const adapter = adapterWith({ list: () => pending.promise });
    const element = createElement({ adapter });
    mount(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector('.skeleton-grid')).to.exist;
    expect(
      element.shadowRoot?.querySelector('.container')?.getAttribute('aria-busy'),
    ).to.equal('true');
    expect(
      element.shadowRoot?.querySelector('[role="status"]')?.textContent,
    ).to.include('Cargando comentarios');

    pending.resolve({ comments: [makeComment({ id: 'loaded' })] });
    await flush(element);
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      1,
    );
  });

  it('shows a load error and retries manually', async () => {
    let calls = 0;
    const adapter = adapterWith({
      list: async () => {
        calls += 1;
        if (calls === 1) {
          throw new CommentsAdapterError('Servidor no disponible', {
            code: 'network',
          });
        }
        return { comments: [makeComment({ id: 'retry-ok' })] };
      },
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    const error = element.shadowRoot?.querySelector('.error-state');
    expect(error?.getAttribute('role')).to.equal('alert');
    expect(error?.textContent).to.include('No se pudieron cargar');
    expect(error?.textContent).to.include('Servidor no disponible');

    const retry = element.shadowRoot?.querySelector(
      '.retry-btn',
    ) as HTMLButtonElement;
    expect(retry.textContent?.trim()).to.equal('Reintentar');
    retry.click();
    await flush(element);

    expect(calls).to.equal(2);
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      1,
    );
    expect(element.shadowRoot?.querySelector('.error-state')).to.not.exist;
  });

  it('ignores stale responses after a reload', async () => {
    const first = deferred<CommentPage>();
    const second = deferred<CommentPage>();
    let calls = 0;
    const adapter = adapterWith({
      list: () => {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      },
    });

    const element = createElement({ adapter });
    mount(element);
    await element.updateComplete;

    const reload = element.reload();
    second.resolve({
      comments: [makeComment({ id: 'new', text: 'Respuesta nueva' })],
    });
    await reload;
    await flush(element);

    first.resolve({
      comments: [makeComment({ id: 'old', text: 'Respuesta vieja' })],
    });
    await flush(element);

    const text = element.shadowRoot?.querySelector('.comment-text')?.textContent;
    expect(text).to.include('Respuesta nueva');
    expect(text).to.not.include('Respuesta vieja');
  });

  it('creates a comment only after the adapter confirms it', async () => {
    let received!: NewCommentInput;
    const created: Comment[] = [];
    const adapter = adapterWith({
      create: async (input) => {
        received = input;
        const comment = makeComment({
          id: 'new-1',
          text: input.text,
          name: input.author?.name ?? 'Anónimo',
        });
        created.push(comment);
        return comment;
      },
    });

    const element = createElement({ author: { name: 'Eva' } });
    element.adapter = adapter;
    mount(element);
    await flush(element);

    let added!: { comment: Comment };
    element.addEventListener('comment-added', (event) => {
      added = (event as CustomEvent).detail;
    });

    submit(element, 'Comentario persistido');
    await flush(element);

    expect(received?.text).to.equal('Comentario persistido');
    expect(received?.author?.name).to.equal('Eva');
    expect(created).to.have.length(1);
    expect(added?.comment.text).to.equal('Comentario persistido');
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      1,
    );
    expect(
      (element.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement)
        .value,
    ).to.equal('');
  });

  it('keeps the draft and reports a publish error without emitting success', async () => {
    const adapter = adapterWith({
      create: async () => {
        throw new CommentsAdapterError('Servidor caído', { code: 'server' });
      },
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    let added = false;
    let errorDetail!: { operation: string; error: CommentsAdapterError };
    element.addEventListener('comment-added', () => {
      added = true;
    });
    element.addEventListener('comments-error', (event) => {
      errorDetail = (event as CustomEvent).detail;
    });

    submit(element, 'No se debe perder');
    await flush(element);

    expect(added).to.equal(false);
    expect(errorDetail?.operation).to.equal('create');
    expect(errorDetail?.error.code).to.equal('server');
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      0,
    );
    expect(
      (element.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement)
        .value,
    ).to.equal('No se debe perder');
    const error = element.shadowRoot?.querySelector('.error[role="alert"]');
    expect(error?.textContent).to.include('No se pudo publicar');
  });

  it('blocks a second submit while the first one is pending', async () => {
    const pending = deferred<Comment>();
    let calls = 0;
    const adapter = adapterWith({
      create: () => {
        calls += 1;
        return pending.promise;
      },
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    submit(element, 'Doble clic');
    submit(element, 'Doble clic');
    await element.updateComplete;

    expect(calls).to.equal(1);
    const button = element.shadowRoot?.querySelector(
      '.submit-btn',
    ) as HTMLButtonElement;
    expect(button.disabled).to.equal(true);
    expect(button.textContent?.trim()).to.equal('Publicando...');

    pending.resolve(makeComment({ id: 'double', text: 'Doble clic' }));
    await flush(element);
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      1,
    );
  });

  it('cancels pending operations on disconnect', async () => {
    const pendingCreate = deferred<Comment>();
    const pendingReaction = deferred<Comment>();
    let createSignal: AbortSignal | undefined;
    let reactionSignal: AbortSignal | undefined;
    const seed = makeComment({ id: 'disc', text: 'Desconectar' });
    const adapter = adapterWith({
      list: async () => ({ comments: [seed] }),
      create: (_input, options) => {
        createSignal = options?.signal;
        return pendingCreate.promise;
      },
      react: (_id, _emoji, options) => {
        reactionSignal = options?.signal;
        return pendingReaction.promise;
      },
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    let added = false;
    let changed = false;
    element.addEventListener('comment-added', () => {
      added = true;
    });
    element.addEventListener('comment-reaction-changed', () => {
      changed = true;
    });

    submit(element, 'Pendiente');
    await element.updateComplete;
    element._setCommentEmoji(new Event('click'), 'disc', '🔥');
    await new Promise((resolve) => setTimeout(resolve, 0));

    element.remove();

    expect(createSignal?.aborted).to.equal(true);
    expect(reactionSignal?.aborted).to.equal(true);

    pendingCreate.resolve(makeComment({ id: 'created', text: 'Pendiente' }));
    pendingReaction.resolve(
      makeComment({ id: 'disc', text: 'Desconectar', emoji: '🔥' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(added).to.equal(false);
    expect(changed).to.equal(false);
  });

  it('ignores a pending create from the previous adapter', async () => {
    const pendingCreate = deferred<Comment>();
    let createSignal: AbortSignal | undefined;
    const adapterA = adapterWith({
      list: async () => ({ comments: [] }),
      create: (_input, options) => {
        createSignal = options?.signal;
        return pendingCreate.promise;
      },
    });
    const adapterB = adapterWith({
      list: async () => ({
        comments: [makeComment({ id: 'from-b', text: 'Adaptador B' })],
      }),
    });

    const element = createElement({ adapter: adapterA });
    mount(element);
    await flush(element);

    let added = false;
    element.addEventListener('comment-added', () => {
      added = true;
    });

    submit(element, 'Pendiente en A');
    await element.updateComplete;

    element.adapter = adapterB;
    await flush(element);

    expect(createSignal?.aborted).to.equal(true);
    expect(
      (element.shadowRoot?.querySelector('.submit-btn') as HTMLButtonElement)
        .disabled,
    ).to.equal(false);

    pendingCreate.resolve(makeComment({ id: 'from-a', text: 'Adaptador A' }));
    await flush(element);

    const texts = Array.from(
      element.shadowRoot?.querySelectorAll('.comment-text') ?? [],
    ).map((node) => node.textContent);
    expect(texts).to.deep.equal(['Adaptador B']);
    expect(added).to.equal(false);
    expect(
      (element.shadowRoot?.querySelector('.submit-btn') as HTMLButtonElement)
        .disabled,
    ).to.equal(false);
  });

  it('ignores a pending delete from the previous adapter', async () => {
    const pendingDelete = deferred<void>();
    let deleteSignal: AbortSignal | undefined;
    const comment = makeComment({ id: 'shared', text: 'Compartido' });
    const adapterA = adapterWith({
      list: async () => ({ comments: [comment] }),
      remove: (_id, options) => {
        deleteSignal = options?.signal;
        return pendingDelete.promise;
      },
    });
    const adapterB = adapterWith({
      list: async () => ({ comments: [comment] }),
    });

    const element = createElement({ adapter: adapterA });
    mount(element);
    await flush(element);

    let deleted = false;
    element.addEventListener('comment-deleted', () => {
      deleted = true;
    });

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('.delete-btn')
      ?.click();
    await element.updateComplete;

    element.adapter = adapterB;
    await flush(element);

    expect(deleteSignal?.aborted).to.equal(true);
    expect(
      element.shadowRoot?.querySelector('.comment-card')?.classList.contains(
        'deleting',
      ),
    ).to.equal(false);

    pendingDelete.resolve();
    await flush(element);

    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      1,
    );
    expect(deleted).to.equal(false);
  });

  it('deletes a comment after the adapter confirms it', async () => {
    const removed: string[] = [];
    const adapter = adapterWith({
      list: async () => ({
        comments: [makeComment({ id: 'del-1' }), makeComment({ id: 'del-2' })],
      }),
      remove: async (id) => {
        removed.push(id);
      },
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    let deleted!: { commentId: string };
    element.addEventListener('comment-deleted', (event) => {
      deleted = (event as CustomEvent).detail;
    });

    element.shadowRoot
      ?.querySelectorAll<HTMLButtonElement>('.delete-btn')[0]
      ?.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flush(element);

    expect(removed).to.deep.equal(['del-1']);
    expect(deleted?.commentId).to.equal('del-1');
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      1,
    );
    expect(element.shadowRoot?.activeElement?.classList.contains('comment-card')).to.equal(
      true,
    );
  });

  it('rolls back a failed delete and reports the error', async () => {
    const adapter = adapterWith({
      list: async () => ({ comments: [makeComment({ id: 'keep' })] }),
      remove: async () => {
        throw new CommentsAdapterError('Sin permisos', { code: 'forbidden' });
      },
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    let deleted = false;
    let errorDetail!: { operation: string; error: CommentsAdapterError };
    element.addEventListener('comment-deleted', () => {
      deleted = true;
    });
    element.addEventListener('comments-error', (event) => {
      errorDetail = (event as CustomEvent).detail;
    });

    element.shadowRoot
      ?.querySelector<HTMLButtonElement>('.delete-btn')
      ?.click();
    await flush(element);

    expect(deleted).to.equal(false);
    expect(errorDetail?.operation).to.equal('delete');
    expect(errorDetail?.error.code).to.equal('forbidden');
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      1,
    );
    expect(
      element.shadowRoot?.querySelector('.action-error')?.textContent,
    ).to.include('No se pudo eliminar');
  });

  it('persists a reaction and emits comment-reaction-changed', async () => {
    const reactions: Array<[string, string]> = [];
    const adapter = adapterWith({
      list: async () => ({ comments: [makeComment({ id: 'r1' })] }),
      react: async (id, emoji) => {
        reactions.push([id, emoji]);
        return makeComment({ id, emoji, liked: true });
      },
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    let changed!: { commentId: string; emoji: string };
    element.addEventListener('comment-reaction-changed', (event) => {
      changed = (event as CustomEvent).detail;
    });

    element.shadowRoot?.querySelector<HTMLButtonElement>('.reaction-btn')?.click();
    await flush(element);
    const fire = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        '.reaction-picker button',
      ) ?? [],
    ).find((button) => button.textContent?.trim() === '🔥');
    fire?.click();
    await flush(element);

    expect(reactions).to.deep.equal([['r1', '🔥']]);
    expect(changed?.emoji).to.equal('🔥');
    const reaction = element.shadowRoot?.querySelector('.reaction-btn');
    expect(reaction?.textContent?.trim()).to.equal('🔥');
    expect(reaction?.getAttribute('aria-pressed')).to.equal('true');
  });

  it('rolls back a failed reaction', async () => {
    const adapter = adapterWith({
      list: async () => ({ comments: [makeComment({ id: 'r1' })] }),
      react: async () => {
        throw new CommentsAdapterError('Reacción rechazada', {
          code: 'forbidden',
        });
      },
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    let errorDetail!: { operation: string; error: CommentsAdapterError };
    element.addEventListener('comments-error', (event) => {
      errorDetail = (event as CustomEvent).detail;
    });

    element.shadowRoot?.querySelector<HTMLButtonElement>('.reaction-btn')?.click();
    await flush(element);
    const fire = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        '.reaction-picker button',
      ) ?? [],
    ).find((button) => button.textContent?.trim() === '🔥');
    fire?.click();
    await flush(element);

    expect(errorDetail?.operation).to.equal('react');
    expect(errorDetail?.error.code).to.equal('forbidden');
    expect(
      element.shadowRoot?.querySelector('.reaction-btn')?.textContent?.trim(),
    ).to.equal('👍');
    expect(
      element.shadowRoot?.querySelector('.action-error')?.textContent,
    ).to.include('No se pudo guardar la reacción');
  });

  it('keeps local reactions when the adapter has no react method', async () => {
    const adapter = adapterWith({
      list: async () => ({ comments: [makeComment({ id: 'local' })] }),
    });
    delete (adapter as { react?: unknown }).react;

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    element.shadowRoot?.querySelector<HTMLButtonElement>('.reaction-btn')?.click();
    await flush(element);
    const fire = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        '.reaction-picker button',
      ) ?? [],
    ).find((button) => button.textContent?.trim() === '🔥');
    fire?.click();
    await flush(element);

    expect(
      element.shadowRoot?.querySelector('.reaction-btn')?.textContent?.trim(),
    ).to.equal('🔥');
    expect(element.shadowRoot?.querySelector('.action-error')).to.not.exist;
  });

  it('reverts to the original reaction when two queued reactions fail', async () => {
    const pending: Array<{
      emoji: string;
      resolve: (comment: Comment) => void;
      reject: (error: unknown) => void;
    }> = [];
    const adapter = adapterWith({
      list: async () => ({
        comments: [makeComment({ id: 'r1', text: 'Texto actual' })],
      }),
      react: (_id, emoji) =>
        new Promise<Comment>((resolve, reject) => {
          pending.push({ emoji, resolve, reject });
        }),
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    element._setCommentEmoji(new Event('click'), 'r1', '🔥');
    element._setCommentEmoji(new Event('click'), 'r1', '❤️');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pending).to.have.length(1);
    expect(pending[0]?.emoji).to.equal('🔥');

    pending[0]?.reject(new Error('first failed'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pending).to.have.length(2);
    expect(pending[1]?.emoji).to.equal('❤️');

    pending[1]?.reject(new Error('second failed'));
    await flush(element);

    expect(
      element.shadowRoot?.querySelector('.reaction-btn')?.textContent?.trim(),
    ).to.equal('👍');
    expect(
      element.shadowRoot?.querySelector('.comment-text')?.textContent,
    ).to.include('Texto actual');
    expect(element.shadowRoot?.querySelector('.action-error')).to.exist;
  });

  it('merges only reaction fields from a stale response', async () => {
    const pending: Array<{
      resolve: (comment: Comment) => void;
      reject: (error: unknown) => void;
    }> = [];
    const adapter = adapterWith({
      list: async () => ({
        comments: [makeComment({ id: 'r1', text: 'Texto actual' })],
      }),
      react: () =>
        new Promise<Comment>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    let changed = 0;
    element.addEventListener('comment-reaction-changed', () => {
      changed += 1;
    });

    element._setCommentEmoji(new Event('click'), 'r1', '❤️');
    await new Promise((resolve) => setTimeout(resolve, 0));

    pending[0]?.resolve(
      makeComment({ id: 'r1', text: 'Texto viejo', emoji: '❤️', liked: true }),
    );
    await flush(element);

    expect(
      element.shadowRoot?.querySelector('.comment-text')?.textContent,
    ).to.include('Texto actual');
    expect(
      element.shadowRoot?.querySelector('.reaction-btn')?.textContent?.trim(),
    ).to.equal('❤️');
    expect(changed).to.equal(1);
  });

  it('ignores a reaction response that arrives after a reload', async () => {
    const pending: Array<{
      resolve: (comment: Comment) => void;
      reject: (error: unknown) => void;
    }> = [];
    let listCalls = 0;
    const adapter = adapterWith({
      list: async () => {
        listCalls += 1;
        return {
          comments: [
            makeComment({
              id: 'r1',
              text:
                listCalls === 1 ? 'Texto original' : 'Texto recargado',
            }),
          ],
        };
      },
      react: () =>
        new Promise<Comment>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    });

    const element = createElement({ adapter });
    mount(element);
    await flush(element);

    let changed = 0;
    element.addEventListener('comment-reaction-changed', () => {
      changed += 1;
    });

    element._setCommentEmoji(new Event('click'), 'r1', '🔥');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.reload();
    await flush(element);

    pending[0]?.resolve(
      makeComment({ id: 'r1', text: 'Texto original', emoji: '🔥' }),
    );
    await flush(element);

    expect(
      element.shadowRoot?.querySelector('.comment-text')?.textContent,
    ).to.include('Texto recargado');
    expect(
      element.shadowRoot?.querySelector('.reaction-btn')?.textContent?.trim(),
    ).to.equal('👍');
    expect(changed).to.equal(0);
  });

  it('ignores a pending reaction after an adapter switch', async () => {
    const pending = deferred<Comment>();
    let reactionSignal: AbortSignal | undefined;
    const adapterA = adapterWith({
      list: async () => ({
        comments: [makeComment({ id: 'r1', text: 'Desde A' })],
      }),
      react: (_id, _emoji, options) => {
        reactionSignal = options?.signal;
        return pending.promise;
      },
    });
    const adapterB = adapterWith({
      list: async () => ({
        comments: [makeComment({ id: 'r1', text: 'Desde B' })],
      }),
    });

    const element = createElement({ adapter: adapterA });
    mount(element);
    await flush(element);

    let changed = false;
    element.addEventListener('comment-reaction-changed', () => {
      changed = true;
    });

    element._setCommentEmoji(new Event('click'), 'r1', '🔥');
    await new Promise((resolve) => setTimeout(resolve, 0));

    element.adapter = adapterB;
    await flush(element);

    expect(reactionSignal?.aborted).to.equal(true);

    pending.resolve(makeComment({ id: 'r1', text: 'Desde A', emoji: '🔥' }));
    await flush(element);

    expect(
      element.shadowRoot?.querySelector('.comment-text')?.textContent,
    ).to.include('Desde B');
    expect(changed).to.equal(false);
  });

  it('shows initialComments while the adapter loads and replaces them', async () => {
    const pending = deferred<CommentPage>();
    const adapter = adapterWith({ list: () => pending.promise });
    const element = createElement({
      initialComments: [makeComment({ id: 'seed', text: 'Semilla' })],
      adapter,
    });
    mount(element);
    await element.updateComplete;

    expect(
      element.shadowRoot?.querySelector('.comment-text')?.textContent,
    ).to.include('Semilla');
    expect(
      element.shadowRoot?.querySelector('.container')?.getAttribute('aria-busy'),
    ).to.equal('true');

    pending.resolve({
      comments: [makeComment({ id: 'server', text: 'Del servidor' })],
    });
    await flush(element);

    const text = element.shadowRoot?.querySelector('.comment-text')?.textContent;
    expect(text).to.include('Del servidor');
    expect(text).to.not.include('Semilla');
  });

  it('allows overriding UI messages', async () => {
    const element = mount(
      createElement({
        initialComments: [],
        messages: {
          title: 'Opiniones',
          empty: 'Todavía no hay nada',
          submit: 'Enviar',
          composerLabel: 'Cuéntanos algo',
        },
      }),
    );
    await flush(element);

    expect(element.shadowRoot?.querySelector('h2')?.textContent?.trim()).to.equal(
      'Opiniones',
    );
    expect(
      element.shadowRoot?.querySelector('.empty-state')?.textContent,
    ).to.include('Todavía no hay nada');
    expect(
      element.shadowRoot?.querySelector('.submit-btn')?.textContent?.trim(),
    ).to.equal('Enviar');
    expect(
      element.shadowRoot?.querySelector('textarea')?.getAttribute('aria-label'),
    ).to.equal('Cuéntanos algo');
  });
});
