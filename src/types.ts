/**
 * Public data contracts for `universal-comments`.
 *
 * These types are shared by the component, the built-in adapters and
 * consumer-provided adapters. Keeping them in a separate module makes the
 * storage contract independent from the rendering layer.
 */

export interface Comment {
  id: string;
  text: string;
  date: string;
  name: string;
  avatar: string;
  emoji: string;
  liked?: boolean;
}

export interface CommentAuthor {
  name: string;
  avatar?: string;
}

export interface NewCommentInput {
  text: string;
  author?: CommentAuthor;
}

export interface CommentQuery {
  /** Maximum number of comments to return for this page. */
  limit?: number;
  /** Opaque cursor returned by the previous page (`nextCursor`). */
  cursor?: string | null;
  signal?: AbortSignal;
}

export interface CommentPage {
  comments: Comment[];
  /** Cursor to request the next page, when the backend supports it. */
  nextCursor?: string | null;
  /** Whether more comments are available. */
  hasMore?: boolean;
}

export interface AdapterCallOptions {
  signal?: AbortSignal;
}

export type CommentsErrorCode =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'rate-limited'
  | 'timeout'
  | 'server'
  | 'aborted'
  | 'unknown';

export type CommentsOperation = 'load' | 'create' | 'delete' | 'react';

/**
 * Storage contract consumed by `<universal-comments>`.
 *
 * `list`, `create` and `remove` are required. `react` is optional so that a
 * read-only or minimal backend does not have to implement reactions; when it
 * is absent, reactions keep working locally (the component's legacy behaviour).
 *
 * Implementations must be asynchronous and should honour the provided
 * `AbortSignal` where possible.
 */
export interface CommentsAdapter {
  list(query?: CommentQuery): Promise<CommentPage>;
  create(input: NewCommentInput, options?: AdapterCallOptions): Promise<Comment>;
  remove(id: string, options?: AdapterCallOptions): Promise<void>;
  react?(
    id: string,
    emoji: string,
    options?: AdapterCallOptions,
  ): Promise<Comment | void>;
}
