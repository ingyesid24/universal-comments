import { expect } from '@esm-bundle/chai';
import { CommentsAdapterError } from '../errors.js';
import type { Comment } from '../types.js';
import { InMemoryCommentsAdapter } from './in-memory.js';

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

async function rejection(promise: Promise<unknown>): Promise<CommentsAdapterError> {
  try {
    await promise;
  } catch (error) {
    expect(error).to.be.instanceOf(CommentsAdapterError);
    return error as CommentsAdapterError;
  }
  throw new Error('Se esperaba un rechazo y la promesa se resolvió');
}

describe('InMemoryCommentsAdapter', () => {
  it('lists seed comments and paginates with cursor', async () => {
    const adapter = new InMemoryCommentsAdapter({
      comments: [
        makeComment({ id: '1' }),
        makeComment({ id: '2' }),
        makeComment({ id: '3' }),
      ],
    });

    const first = await adapter.list({ limit: 2 });
    expect(first.comments.map((comment) => comment.id)).to.deep.equal([
      '1',
      '2',
    ]);
    expect(first.hasMore).to.equal(true);
    expect(first.nextCursor).to.equal('2');

    const second = await adapter.list({
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.comments.map((comment) => comment.id)).to.deep.equal(['3']);
    expect(second.hasMore).to.equal(false);
  });

  it('creates normalized comments and prepends them', async () => {
    const adapter = new InMemoryCommentsAdapter();
    const created = await adapter.create({
      text: '  Comentario nuevo  ',
      author: { name: '  Eva  ', avatar: 'javascript:alert(1)' },
    });

    expect(created.text).to.equal('Comentario nuevo');
    expect(created.name).to.equal('Eva');
    expect(created.avatar).to.match(/^https:\/\/i\.pravatar\.cc/);
    expect(created.id).to.be.a('string');
    expect(created.id.length).to.be.greaterThan(0);

    const page = await adapter.list();
    expect(page.comments).to.have.length(1);
    expect(page.comments[0]?.text).to.equal('Comentario nuevo');
  });

  it('rejects blank comments with a validation error', async () => {
    const adapter = new InMemoryCommentsAdapter();
    const error = await rejection(adapter.create({ text: '   ' }));
    expect(error.code).to.equal('validation');
  });

  it('removes comments and reports unknown ids', async () => {
    const adapter = new InMemoryCommentsAdapter({
      comments: [makeComment({ id: 'keep' }), makeComment({ id: 'drop' })],
    });

    await adapter.remove('drop');
    const page = await adapter.list();
    expect(page.comments.map((comment) => comment.id)).to.deep.equal(['keep']);

    const error = await rejection(adapter.remove('drop'));
    expect(error.code).to.equal('not-found');
  });

  it('updates reactions and reports unknown ids', async () => {
    const adapter = new InMemoryCommentsAdapter({
      comments: [makeComment({ id: 'r1' })],
    });

    const updated = await adapter.react('r1', '🔥');
    expect(updated.emoji).to.equal('🔥');
    expect(updated.liked).to.equal(true);
    expect(adapter.snapshot()[0]?.emoji).to.equal('🔥');

    const error = await rejection(adapter.react('missing', '🔥'));
    expect(error.code).to.equal('not-found');
  });

  it('honours an aborted signal', async () => {
    const adapter = new InMemoryCommentsAdapter();
    const controller = new AbortController();
    controller.abort();

    const listError = await rejection(
      adapter.list({ signal: controller.signal }),
    );
    expect(listError.code).to.equal('aborted');

    const createError = await rejection(
      adapter.create({ text: 'Hola' }, { signal: controller.signal }),
    );
    expect(createError.code).to.equal('aborted');
  });

  it('returns defensive copies and can be reset', async () => {
    const adapter = new InMemoryCommentsAdapter({
      comments: [makeComment({ id: 'x' })],
    });

    const snapshot = adapter.snapshot();
    snapshot[0]!.text = 'mutated';
    expect((await adapter.list()).comments[0]?.text).to.equal('Hola');

    adapter.reset([makeComment({ id: 'y', text: 'Nuevo' })]);
    const page = await adapter.list();
    expect(page.comments.map((comment) => comment.id)).to.deep.equal(['y']);
  });
});
