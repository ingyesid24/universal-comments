import { CommentsAdapterError } from '../errors.js';
import {
  defaultAvatar,
  normalizeAvatar,
  normalizeComment,
  uniqueId,
} from '../internal/utils.js';
import type {
  AdapterCallOptions,
  Comment,
  CommentPage,
  CommentQuery,
  CommentsAdapter,
  NewCommentInput,
} from '../types.js';

export interface InMemoryCommentsAdapterOptions {
  /** Optional seed data. Comments are copied and normalized. */
  comments?: Comment[];
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CommentsAdapterError('La operación fue cancelada', {
      code: 'aborted',
      retryable: false,
      cause: signal.reason,
    });
  }
}

/**
 * Minimal adapter for demos, tests and local prototypes.
 *
 * It performs no real persistence: state lives in the adapter instance and is
 * lost when it is discarded. Do not present it as a backend.
 */
export class InMemoryCommentsAdapter implements CommentsAdapter {
  private comments: Comment[];

  constructor(options: InMemoryCommentsAdapterOptions = {}) {
    this.comments = (options.comments ?? []).map(normalizeComment);
  }

  async list(query: CommentQuery = {}): Promise<CommentPage> {
    throwIfAborted(query.signal);

    let start = 0;
    if (query.cursor) {
      const cursorIndex = this.comments.findIndex(
        (comment) => comment.id === query.cursor,
      );
      // Unknown cursors fall back to the first page instead of throwing, which
      // keeps demos resilient when data is reset.
      start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const limit =
      typeof query.limit === 'number' &&
      Number.isFinite(query.limit) &&
      query.limit > 0
        ? Math.floor(query.limit)
        : this.comments.length;

    const slice = this.comments.slice(start, start + limit);
    const nextIndex = start + slice.length;
    const hasMore = nextIndex < this.comments.length;

    return {
      comments: slice.map((comment) => ({ ...comment })),
      hasMore,
      nextCursor:
        hasMore && slice.length > 0
          ? (slice[slice.length - 1]?.id ?? null)
          : null,
    };
  }

  async create(
    input: NewCommentInput,
    options: AdapterCallOptions = {},
  ): Promise<Comment> {
    throwIfAborted(options.signal);

    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) {
      throw new CommentsAdapterError(
        'El comentario no puede estar vacío',
        { code: 'validation', retryable: false },
      );
    }

    const id = uniqueId();
    const authorName =
      typeof input.author?.name === 'string' && input.author.name.trim()
        ? input.author.name.trim()
        : 'Anónimo';

    const comment: Comment = {
      id,
      text,
      date: new Date().toISOString(),
      name: authorName,
      avatar: input.author?.avatar
        ? normalizeAvatar(input.author.avatar, id)
        : defaultAvatar(id),
      emoji: '👍',
      liked: false,
    };

    this.comments = [comment, ...this.comments];
    return { ...comment };
  }

  async remove(id: string, options: AdapterCallOptions = {}): Promise<void> {
    throwIfAborted(options.signal);

    const index = this.comments.findIndex((comment) => comment.id === id);
    if (index === -1) {
      throw new CommentsAdapterError('El comentario no existe', {
        code: 'not-found',
        retryable: false,
      });
    }

    this.comments = [
      ...this.comments.slice(0, index),
      ...this.comments.slice(index + 1),
    ];
  }

  async react(
    id: string,
    emoji: string,
    options: AdapterCallOptions = {},
  ): Promise<Comment> {
    throwIfAborted(options.signal);

    const index = this.comments.findIndex((comment) => comment.id === id);
    if (index === -1) {
      throw new CommentsAdapterError('El comentario no existe', {
        code: 'not-found',
        retryable: false,
      });
    }

    const current = this.comments[index];
    if (!current) {
      throw new CommentsAdapterError('El comentario no existe', {
        code: 'not-found',
        retryable: false,
      });
    }

    const updated: Comment = { ...current, emoji, liked: true };
    const next = this.comments.slice();
    next[index] = updated;
    this.comments = next;

    return { ...updated };
  }

  /** Replaces all stored comments (useful for demos and tests). */
  reset(comments: Comment[] = []): void {
    this.comments = comments.map(normalizeComment);
  }

  /** Returns a defensive copy of the stored comments. */
  snapshot(): Comment[] {
    return this.comments.map((comment) => ({ ...comment }));
  }
}
