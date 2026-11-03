import { CommentsAdapterError } from '../errors.js';
import type { Comment, CommentPage } from '../types.js';

let idCounter = 0;

export function uniqueId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `uc-${++idCounter}-${Date.now()}`;
  }
}

const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif);/i;

/**
 * Accepts absolute http(s) URLs, same-origin relative paths and safe inline
 * bitmap images. Anything else (notably `javascript:` URLs) is rejected.
 */
export function isSafeAvatarUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  if (SAFE_DATA_IMAGE.test(url)) return true;

  try {
    // The base is only used to resolve relative URLs.
    const parsed = new URL(url, 'https://universal-comments.invalid');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function defaultAvatar(seed: string): string {
  return `https://i.pravatar.cc/80?u=${encodeURIComponent(seed)}`;
}

export function normalizeAvatar(value: unknown, seed: string): string {
  return isSafeAvatarUrl(value) ? value.trim() : defaultAvatar(seed);
}

/**
 * Defensive normalization for data received from `initialComments` or from an
 * adapter. It never interprets user content as HTML: text is always a string.
 */
export function normalizeComment(input: unknown): Comment {
  const raw =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {};

  const rawId =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : typeof raw.id === 'number'
        ? String(raw.id)
        : '';
  const id = rawId || uniqueId();
  const text = typeof raw.text === 'string' ? raw.text : '';
  const date =
    typeof raw.date === 'string' && !Number.isNaN(Date.parse(raw.date))
      ? raw.date
      : new Date().toISOString();
  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : 'Anónimo';
  const emoji =
    typeof raw.emoji === 'string' && raw.emoji.trim() ? raw.emoji : '👍';

  const comment: Comment = {
    id,
    text,
    date,
    name,
    avatar: normalizeAvatar(raw.avatar, id),
    emoji,
  };

  if (typeof raw.liked === 'boolean') comment.liked = raw.liked;

  return comment;
}

export function dedupeComments(comments: Comment[]): Comment[] {
  const seen = new Set<string>();
  const result: Comment[] = [];

  for (const comment of comments) {
    if (seen.has(comment.id)) continue;
    seen.add(comment.id);
    result.push(comment);
  }

  return result;
}

export function upsertComment(comments: Comment[], comment: Comment): Comment[] {
  const index = comments.findIndex((item) => item.id === comment.id);
  if (index === -1) return [comment, ...comments];

  const next = comments.slice();
  next[index] = comment;
  return next;
}

export function normalizePage(value: unknown): CommentPage {
  if (Array.isArray(value)) {
    return { comments: dedupeComments(value.map(normalizeComment)) };
  }

  if (value && typeof value === 'object') {
    const page = value as {
      comments?: unknown;
      nextCursor?: unknown;
      hasMore?: unknown;
    };

    if (Array.isArray(page.comments)) {
      return {
        comments: dedupeComments(page.comments.map(normalizeComment)),
        nextCursor:
          typeof page.nextCursor === 'string' ? page.nextCursor : null,
        hasMore:
          typeof page.hasMore === 'boolean' ? page.hasMore : undefined,
      };
    }
  }

  throw new CommentsAdapterError(
    'El adaptador devolvió una página de comentarios inválida',
    { code: 'unknown', retryable: false },
  );
}

export function errorSummary(error: CommentsAdapterError): string {
  const message = error.message.trim();
  return message.length > 200 ? `${message.slice(0, 197)}...` : message;
}
