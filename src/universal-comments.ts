import { LitElement, html, css } from 'lit';
import { live } from 'lit/directives/live.js';

import {
  CommentsAdapterError,
  toCommentsAdapterError,
} from './errors.js';
import { DEFAULT_MESSAGES } from './messages.js';
import type { CommentsMessages } from './messages.js';
import {
  errorSummary,
  normalizeComment,
  normalizePage,
  uniqueId,
  upsertComment,
  defaultAvatar,
} from './internal/utils.js';
import type {
  Comment,
  CommentAuthor,
  CommentsAdapter,
  NewCommentInput,
} from './types.js';

export type {
  AdapterCallOptions,
  Comment,
  CommentAuthor,
  CommentPage,
  CommentQuery,
  CommentsAdapter,
  CommentsErrorCode,
  NewCommentInput,
} from './types.js';
export {
  CommentsAdapterError,
  isCommentsAdapterError,
  toCommentsAdapterError,
} from './errors.js';export { DEFAULT_MESSAGES } from './messages.js';
export type { CommentsMessages } from './messages.js';

const NAMES = [
  'Ana García', 'Carlos López', 'María Rodríguez', 'José Martínez',
  'Laura Hernández', 'Pedro González', 'Sofía Pérez', 'Juan Sánchez',
  'Valentina Ramírez', 'Diego Torres', 'Isabella Flores', 'Andrés Rivera',
  'Camila Morales', 'Mateo Ortiz', 'Luciana Castillo', 'Santiago Reyes',
  'Gabriela Vargas', 'Emilio Guzmán', 'Daniela Mendoza', 'Benjamín Ruiz',
];

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '💯', '⭐', '👏'];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface ReactionBaseline {
  emoji: string;
  liked?: boolean;
}

/**
 * `<universal-comments>` Web Component
 *
 * Self-contained comment section with emoji reactions,
 * loading skeleton, responsive grid, and no framework dependencies.
 *
 * @element universal-comments
 * @attr {number} max-comments - Visible comments before "Ver más" (default: 6)
 * @attr {string} placeholder - Textarea placeholder (default: "Escribe un comentario...")
 * @attr {string} theme - "dark" | "light" (default: "dark")
 * @attr {number} char-limit - Max characters per comment (default: 500)
 *
 * @property {Array} initialComments - Seed comments programmatically
 * @property {CommentsAdapter} adapter - Storage adapter (JS property only)
 * @property {CommentAuthor} author - Author used for new comments (JS property only)
 * @property {CommentsMessages} messages - UI copy overrides (JS property only)
 *
 * @fires comment-added - Dispatched when a comment has been added (detail: { comment })
 * @fires comment-deleted - Dispatched when a comment has been deleted (detail: { commentId })
 * @fires comments-loaded - Dispatched when an adapter finishes loading (detail: { comments })
 * @fires comments-error - Dispatched when an adapter operation fails (detail: { operation, error, commentId? })
 * @fires comment-reaction-changed - Dispatched after a persisted reaction (detail: { commentId, emoji })
 */
export class UniversalComments extends LitElement {
  static properties = {
    maxcomments: { type: Number, attribute: 'max-comments' },
    placeholder: { type: String },
    theme: { type: String },
    charlimit: { type: Number, attribute: 'char-limit' },
    // Declared so Lit preserves values assigned before the element is upgraded.
    adapter: { attribute: false },
    author: { attribute: false },
    messages: { attribute: false },
    initialComments: { attribute: false },
    _comments: { state: true },
    _newComment: { state: true },
    _error: { state: true },
    _showAll: { state: true },
    _loading: { state: true },
    _emojiPickerOpen: { state: true },
    _emojiPickerForComment: { state: true },
    _loadError: { state: true },
    _submitting: { state: true },
    _actionErrors: { state: true },
    _announcement: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      max-width: 56rem;
      margin: 0 auto;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;

      /* Public customization points (overridable from the light DOM). */
      --uc-accent: #3b82f6;
      --uc-accent-strong: #2563eb;
      --uc-accent-strong-hover: #1d4ed8;
      --uc-error: #ef4444;
      --uc-error-light: #dc2626;
      --uc-radius: 1rem;
    }

    * {
      box-sizing: border-box;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }

    .container {
      padding: 1.5rem;
      border-radius: var(--uc-radius);
      box-shadow:
        0 10px 15px -3px rgba(0, 0, 0, 0.1),
        0 4px 6px -2px rgba(0, 0, 0, 0.05);
    }

    .container.dark {
      --uc-bg: #0b1422;
      --uc-fg: #fff;
      --uc-muted: rgba(255, 255, 255, 0.6);
      --uc-border: #111c2d;
      --uc-card-bg: #0b1422;
      --uc-input-bg: #1e293b;
      --uc-input-border: #334155;
      background: var(--uc-bg);
      color: var(--uc-fg);
    }

    .container.light {
      --uc-bg: #fff;
      --uc-fg: #1f2937;
      --uc-muted: #6b7280;
      --uc-border: #e5e7eb;
      --uc-card-bg: #f9fafb;
      --uc-input-bg: #fff;
      --uc-input-border: #d1d5db;
      --uc-error: var(--uc-error-light);
      background: var(--uc-bg);
      color: var(--uc-fg);
      border: 1px solid var(--uc-border);
    }

    h2 {
      font-size: 1.875rem;
      font-weight: 700;
      margin: 0 0 1.5rem;
      text-align: center;
    }

    .input-area {
      margin-bottom: 1.5rem;
      position: relative;
    }

    textarea {
      width: 100%;
      padding: 1rem;
      border-radius: 0.75rem;
      min-height: 100px;
      resize: vertical;
      font-family: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    textarea:focus {
      outline: none;
      box-shadow: 0 0 0 2px var(--uc-accent);
    }

    button:focus-visible,
    textarea:focus-visible {
      outline: 2px solid var(--uc-accent);
      outline-offset: 2px;
    }

    .light textarea {
      background: var(--uc-input-bg);
      color: var(--uc-fg);
      border: 1px solid var(--uc-input-border);
    }

    .light textarea:focus {
      border-color: var(--uc-accent);
    }

    .dark textarea {
      background: var(--uc-input-bg);
      color: var(--uc-fg);
      border: 1px solid var(--uc-input-border);
    }

    .dark textarea:focus {
      border-color: var(--uc-accent);
    }

    .char-count {
      text-align: right;
      font-size: 0.75rem;
      margin-top: 0.25rem;
    }

    .dark .char-count {
      color: var(--uc-muted);
    }

    .light .char-count {
      color: var(--uc-muted);
    }

    .char-count.over {
      color: var(--uc-error);
    }

    .error {
      color: var(--uc-error);
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }

    .action-error {
      margin-top: 0.75rem;
    }

    .error-state {
      text-align: center;
      padding: 2.5rem 1rem;
    }

    .error-state p {
      margin: 0 0 0.5rem;
    }

    .error-detail {
      font-size: 0.875rem;
      color: var(--uc-muted);
    }

    .retry-btn {
      margin-top: 0.5rem;
      padding: 0.625rem 1rem;
      border-radius: 0.625rem;
      border: 1px solid var(--uc-accent);
      background: var(--uc-accent-strong);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.875rem;
    }

    .retry-btn:hover {
      background: var(--uc-accent-strong-hover);
    }

    .button-row {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
      flex-wrap: wrap;
    }

    .emoji-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 0.75rem;
      background: transparent;
      cursor: pointer;
      font-size: 1.25rem;
      transition: background 0.15s;
      border: 1px solid #d1d5db;
    }

    .dark .emoji-btn {
      border-color: #334155;
    }

    .light .emoji-btn {
      border-color: #d1d5db;
    }

    .emoji-btn:hover {
      background: rgba(59, 130, 246, 0.15);
    }

    .submit-btn {
      padding: 0.75rem 1.5rem;
      background: var(--uc-accent-strong);
      color: #fff;
      border: none;
      border-radius: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      font-family: inherit;
      font-size: 0.875rem;
    }

    .submit-btn:hover {
      background: var(--uc-accent-strong-hover);
    }

    .submit-btn:active {
      transform: scale(0.97);
    }

    .submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .emoji-picker-wrapper {
      position: absolute;
      bottom: 3.5rem;
      left: 0;
      z-index: 10;
    }

    .emoji-picker-grid {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      padding: 0.5rem;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0.25rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
    }

    .input-spotlight {
      position: relative;
    }

    .input-spotlight-overlay {
      pointer-events: none;
      position: absolute;
      inset: 0;
      border-radius: 0.75rem;
      opacity: 0;
      transition: opacity 0.5s;
    }

    .input-spotlight-overlay.visible {
      opacity: 1;
    }

    .light .emoji-picker-grid {
      background: #fff;
      border-color: #e5e7eb;
    }

    .emoji-picker-grid button {
      background: none;
      border: none;
      font-size: 1.5rem;
      padding: 0.25rem;
      cursor: pointer;
      border-radius: 0.375rem;
      transition: background 0.15s;
    }

    .emoji-picker-grid button:hover {
      background: rgba(59, 130, 246, 0.2);
    }

    .comment-area {
      position: relative;
    }

    .comment-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.75rem;
      padding-bottom: 4rem;
      transition: max-height 0.3s ease;
    }

    @media (min-width: 640px) {
      .comment-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (min-width: 768px) {
      .comment-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .comment-grid.truncated {
      max-height: 400px;
      overflow: hidden;
    }

    .comment-card {
      border: 1px solid var(--uc-border);
      border-radius: var(--uc-radius);
      padding: 1.25rem;
      animation: fadeInUp 0.3s ease;
      break-inside: avoid;
      margin-bottom: 0;
      transition: opacity 0.3s ease, transform 0.3s ease, height 0.3s ease, padding 0.3s ease, margin 0.3s ease;
      overflow: hidden;
    }

    .comment-card.deleting {
      opacity: 0;
      transform: translateX(100px);
      padding: 0 1.25rem;
      margin: 0;
      border-width: 0;
    }

    .comment-card:focus {
      outline: 2px solid var(--uc-accent);
      outline-offset: 2px;
    }

    .dark .comment-card {
      background: var(--uc-card-bg);
    }

    .light .comment-card {
      border-color: var(--uc-border);
      background: var(--uc-card-bg);
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }

    .avatar {
      width: 4rem;
      height: 4rem;
      border-radius: 50%;
      object-fit: cover;
    }

    .name {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0;
    }

    .time {
      margin: 0;
      font-size: 0.875rem;
    }

    .dark .time {
      color: var(--uc-muted);
    }

    .light .time {
      color: var(--uc-muted);
    }

    .comment-text {
      margin-top: 0.625rem;
    }

    .dark .comment-text {
      color: rgba(255, 255, 255, 0.7);
    }

    .light .comment-text {
      color: #4b5563;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1rem;
      position: relative;
    }

    .reaction-btn {
      background: none;
      border: none;
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 0.5rem;
      transition: background 0.15s, transform 0.1s;
      line-height: 1;
    }

    .reaction-btn:hover {
      background: rgba(59, 130, 246, 0.15);
    }

    .reaction-btn:active {
      transform: scale(0.9);
    }

    .delete-btn {
      background: none;
      border: none;
      font-size: 1rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 0.5rem;
      opacity: 1;
      transition: background 0.15s;
      line-height: 1;
    }

    .delete-btn:hover {
      background: rgba(239, 68, 68, 0.12);
    }

    .gradient-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 6rem;
      pointer-events: none;
    }

    .dark .gradient-overlay {
      background: linear-gradient(to top, var(--uc-bg), transparent);
    }

    .light .gradient-overlay {
      background: linear-gradient(to top, var(--uc-bg), transparent);
    }

    .show-more-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.625rem;
      padding: 0.625rem 1rem;
      border-radius: 0.625rem;
      font-weight: 700;
      border: 1px solid var(--uc-accent);
      background: var(--uc-accent-strong);
      color: #fff;
      cursor: pointer;
      transition: transform 0.3s, box-shadow 0.2s;
      font-family: inherit;
      font-size: 0.875rem;
      position: absolute;
      bottom: 1rem;
      left: 50%;
      transform: translateX(-50%);
    }

    .show-more-btn:hover {
      background: var(--uc-accent-strong-hover);
      transform: translateX(-50%) scale(1.05);
    }

    .show-more-btn:active {
      transform: translateX(-50%) scale(0.97);
    }

    .skeleton-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.75rem;
      padding-bottom: 4rem;
    }

    @media (min-width: 640px) {
      .skeleton-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (min-width: 768px) {
      .skeleton-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .skeleton-card {
      border: 1px solid var(--uc-border);
      border-radius: var(--uc-radius);
      padding: 1.25rem;
    }

    .skeleton-avatar {
      width: 4rem;
      height: 4rem;
      border-radius: 50%;
      background: #4b5563;
      margin-bottom: 1rem;
    }

    .skeleton-line {
      height: 1rem;
      border-radius: 0.25rem;
      margin-bottom: 0.5rem;
    }

    .skeleton-line.short {
      width: 75%;
    }

    .skeleton-line.full {
      width: 100%;
    }

    .skeleton-line.medium {
      width: 83%;
    }

    .animate-pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
    }

    .dark .empty-state {
      color: var(--uc-muted);
    }

    .light .empty-state {
      color: var(--uc-muted);
    }

    .empty-state p {
      font-size: 1.125rem;
      margin: 0;
    }

    .reaction-wrapper {
      position: relative;
    }

    .reaction-picker {
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 0.5rem;
      z-index: 10;
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
  `;

  declare maxcomments: number;
  declare placeholder: string;
  declare theme: 'dark' | 'light';
  declare charlimit: number;
  declare _comments: Comment[];
  declare _newComment: string;
  declare _error: string;
  declare _showAll: boolean;
  declare _loading: boolean;
  declare _emojiPickerOpen: boolean;
  declare _emojiPickerForComment: string | null;
  declare _lastSubmit: number;
  declare _deletingIds: Set<string>;
  declare _boundOnDocumentClick: (e: MouseEvent) => void;
  declare _spotlightVisible: boolean;
  declare _spotlightStyle: string;
  declare _loadError: string;
  declare _submitting: boolean;
  declare _actionErrors: Map<string, string>;
  declare _announcement: string;

  private _adapter: CommentsAdapter | null = null;
  private _author?: CommentAuthor;
  private _messages?: Partial<CommentsMessages>;
  private _loadController: AbortController | null = null;
  private _createController: AbortController | null = null;
  private _loadSeq = 0;
  private _adapterVersion = 0;
  private _commentsVersion = 0;
  private _legacyTimer: number | null = null;
  private _deleteControllers = new Map<string, AbortController>();
  private _reactionBaselines = new Map<string, ReactionBaseline>();
  private _reactionDesired = new Map<string, string>();
  private _reactionRunning = new Set<string>();
  private _reactionRunToken = new Map<string, number>();
  private _reactionTokenCounter = 0;
  private _reactionControllers = new Map<string, AbortController>();
  private _boundOnDocumentKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    super();
    this.maxcomments = 6;
    this.placeholder = 'Escribe un comentario...';
    this.theme = 'dark';
    this.charlimit = 500;
    this._comments = [];
    this._newComment = '';
    this._error = '';
    this._showAll = false;
    this._loading = true;
    this._emojiPickerOpen = false;
    this._emojiPickerForComment = null;
    this._lastSubmit = 0;
    this._deletingIds = new Set();
    this._spotlightVisible = false;
    this._spotlightStyle = '';
    this._loadError = '';
    this._submitting = false;
    this._actionErrors = new Map();
    this._announcement = '';
    this._boundOnDocumentClick = this._onDocumentClick.bind(this);
    this._boundOnDocumentKeyDown = this._onDocumentKeyDown.bind(this);
  }

  /**
   * Storage adapter. JS property only: objects are never serialized as HTML
   * attributes. Assigning it triggers a load; assigning `null` keeps the
   * current comments and returns to local-only behaviour.
   */
  get adapter(): CommentsAdapter | null {
    return this._adapter;
  }

  set adapter(value: CommentsAdapter | null | undefined) {
    const next = value ?? null;
    if (next === this._adapter) return;

    this._abortLoad();
    this._adapterVersion += 1;
    this._commentsVersion += 1;
    this._abortCreate();
    this._abortDeletes();
    this._cancelReactions();
    this._adapter = next;
    this._loadError = '';
    this._error = '';
    this._actionErrors = new Map();
    this._deletingIds.clear();
    this._submitting = false;
    this._emojiPickerOpen = false;
    this._emojiPickerForComment = null;

    if (next) {
      this._clearLegacyTimer();
      this._loading = true;
      this._showAll = false;
      this.requestUpdate();
      if (this.isConnected) void this._loadComments();
    } else {
      this._loading = false;
      this.requestUpdate();
    }
  }

  /** Optional author used when a comment is created. JS property only. */
  get author(): CommentAuthor | undefined {
    return this._author;
  }

  set author(value: CommentAuthor | undefined) {
    this._author = value;
  }

  /** Optional UI copy overrides. JS property only. */
  get messages(): Partial<CommentsMessages> | undefined {
    return this._messages;
  }

  set messages(value: Partial<CommentsMessages> | undefined) {
    this._messages = value;
    this.requestUpdate();
  }

  private get _m(): CommentsMessages {
    return { ...DEFAULT_MESSAGES, ...(this._messages ?? {}) };
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._boundOnDocumentClick);
    document.addEventListener('keydown', this._boundOnDocumentKeyDown);

    if (this._adapter) {
      void this._loadComments();
      return;
    }

    if (this._loading && this._comments.length === 0) {
      this._clearLegacyTimer();
      this._announce(this._m.loading);
      this._legacyTimer = window.setTimeout(() => {
        this._legacyTimer = null;
        this._loading = false;
        this._announce(
          this._comments.length === 0
            ? this._m.empty
            : this._m.commentCount(this._comments.length),
        );
        this.requestUpdate();
      }, 2000);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._boundOnDocumentClick);
    document.removeEventListener('keydown', this._boundOnDocumentKeyDown);
    this._clearLegacyTimer();
    this._abortLoad();
    this._abortCreate();
    this._abortDeletes();
    this._cancelReactions();
    this._deletingIds.clear();
    this._submitting = false;
  }

  private _clearLegacyTimer(): void {
    if (this._legacyTimer !== null) {
      window.clearTimeout(this._legacyTimer);
      this._legacyTimer = null;
    }
  }

  private _abortLoad(): void {
    this._loadController?.abort();
    this._loadController = null;
    this._loadSeq += 1;
  }

  private _abortCreate(): void {
    this._createController?.abort();
    this._createController = null;
  }

  private _abortDeletes(): void {
    for (const controller of this._deleteControllers.values()) {
      controller.abort();
    }
    this._deleteControllers.clear();
  }

  private _cancelReaction(commentId: string): void {
    this._reactionControllers.get(commentId)?.abort();
    this._reactionControllers.delete(commentId);
    this._reactionDesired.delete(commentId);
    this._reactionBaselines.delete(commentId);
    this._reactionRunning.delete(commentId);
    this._reactionRunToken.delete(commentId);
  }

  private _cancelReactions(): void {
    for (const controller of this._reactionControllers.values()) {
      controller.abort();
    }
    this._reactionControllers.clear();
    this._reactionDesired.clear();
    this._reactionBaselines.clear();
    this._reactionRunning.clear();
    this._reactionRunToken.clear();
  }

  set initialComments(comments: Comment[]) {
    this._commentsVersion += 1;
    this._cancelReactions();
    this._abortDeletes();
    this._deletingIds.clear();
    this._comments = Array.isArray(comments)
      ? comments.map(normalizeComment)
      : [];
    this._loading = false;
    this._loadError = '';
    this._error = '';
    this._actionErrors = new Map();
    this._announcement = '';
    this._clearLegacyTimer();
    this.requestUpdate();
  }

  get initialComments(): Comment[] {
    return this._comments;
  }

  /** Reloads comments from the configured adapter (no-op without one). */
  async reload(): Promise<void> {
    if (!this._adapter) return;
    await this._loadComments();
  }

  _emit(name: string, detail: Record<string, unknown>) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }

  private _announce(message: string): void {
    this._announcement = message;
  }

  private _describeError(
    prefix: string,
    error: CommentsAdapterError,
  ): string {
    const detail = errorSummary(error);
    return detail ? `${prefix}: ${detail}` : prefix;
  }

  private _setActionError(commentId: string, message: string): void {
    const next = new Map(this._actionErrors);
    next.set(commentId, message);
    this._actionErrors = next;
    this._announce(message);
  }

  private _clearActionError(commentId: string): void {
    if (!this._actionErrors.has(commentId)) return;
    const next = new Map(this._actionErrors);
    next.delete(commentId);
    this._actionErrors = next;
  }

  private _focusInput(): void {
    this.updateComplete.then(() => {
      this.renderRoot
        .querySelector<HTMLTextAreaElement>('textarea')
        ?.focus();
    });
  }

  private _focusEmojiTrigger(): void {
    this.updateComplete.then(() => {
      this.renderRoot
        .querySelector<HTMLButtonElement>('.emoji-btn')
        ?.focus();
    });
  }

  private _focusReactionTrigger(commentId: string): void {
    this.updateComplete.then(() => {
      const buttons = Array.from(
        this.renderRoot.querySelectorAll<HTMLButtonElement>('.reaction-btn'),
      );
      buttons
        .find((button) => button.dataset.commentId === commentId)
        ?.focus();
    });
  }

  private _focusAfterDelete(index: number): void {
    this.updateComplete.then(() => {
      const cards = Array.from(
        this.renderRoot.querySelectorAll<HTMLElement>('.comment-card'),
      );
      if (cards.length === 0) {
        this._focusInput();
        return;
      }
      const targetIndex = Math.min(Math.max(index, 0), cards.length - 1);
      cards[targetIndex]?.focus();
    });
  }

  _onInput(e: Event) {
    this._newComment = (e.target as HTMLTextAreaElement).value;
    if (this._error && this._newComment.trim().length >= 3) {
      this._error = '';
    }
  }

  _onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void this._addComment();
    }
  }

  private _onDocumentKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (!this._emojiPickerOpen && this._emojiPickerForComment === null) {
      return;
    }

    const commentId = this._emojiPickerForComment;
    this._emojiPickerOpen = false;
    this._emojiPickerForComment = null;
    this.requestUpdate();

    if (commentId) {
      this._focusReactionTrigger(commentId);
    } else {
      this._focusEmojiTrigger();
    }
  }

  _addComment() {
    const now = Date.now();
    if (this._submitting) return;
    if (now - this._lastSubmit < 500) return;

    const text = this._newComment.trim();
    const messages = this._m;

    if (text.length < 3) {
      this._error = messages.tooShort(3);
      this.requestUpdate();
      return;
    }

    if (text.length > this.charlimit) {
      this._error = messages.tooLong(this.charlimit);
      this.requestUpdate();
      return;
    }

    this._lastSubmit = now;
    const draft = this._newComment;

    if (!this._adapter) {
      const comment = {
        id: uniqueId(),
        text,
        date: new Date().toISOString(),
        likes: 0,
        liked: false,
        emoji: '👍',
        avatar: defaultAvatar(uniqueId()),
        name: randomItem(NAMES),
      };
      this._comments = [comment, ...this._comments];
      this._newComment = '';
      this._error = '';
      this._emojiPickerOpen = false;
      this._emit('comment-added', { comment });
      this._announce(this._m.published);
      this.requestUpdate();
      return;
    }

    void this._createWithAdapter(text, draft);
  }

  /**
   * Pessimistic create: the comment is rendered and `comment-added` is emitted
   * only after the adapter confirms the operation.
   */
  private async _createWithAdapter(
    text: string,
    draft: string,
  ): Promise<void> {
    const adapter = this._adapter;
    if (!adapter) return;

    const adapterVersion = this._adapterVersion;
    const controller = new AbortController();
    this._createController?.abort();
    this._createController = controller;
    this._submitting = true;
    this._error = '';
    this._announce(this._m.submitting);
    this.requestUpdate();

    const input: NewCommentInput = this._author
      ? { text, author: this._author }
      : { text };

    try {
      const created = await adapter.create(input, {
        signal: controller.signal,
      });
      if (
        controller.signal.aborted ||
        this._adapter !== adapter ||
        this._adapterVersion !== adapterVersion
      ) {
        return;
      }

      const comment = normalizeComment(created);
      this._comments = upsertComment(this._comments, comment);
      if (this._newComment === draft) {
        this._newComment = '';
      }
      this._error = '';
      this._emojiPickerOpen = false;
      this._emit('comment-added', { comment });
      this._announce(this._m.published);
      this.requestUpdate();
      this._focusInput();
    } catch (error) {
      if (
        controller.signal.aborted ||
        this._adapter !== adapter ||
        this._adapterVersion !== adapterVersion
      ) {
        return;
      }
      const normalized = toCommentsAdapterError(error);
      this._error = this._describeError(
        this._m.publishError,
        normalized,
      );
      this._emit('comments-error', {
        operation: 'create',
        error: normalized,
      });
      this._announce(this._error);
      this.requestUpdate();
    } finally {
      if (this._createController === controller) {
        this._createController = null;
        this._submitting = false;
        this.requestUpdate();
      }
    }
  }

  private async _loadComments(): Promise<void> {
    const adapter = this._adapter;
    if (!adapter) return;

    this._loadController?.abort();
    const controller = new AbortController();
    this._loadController = controller;
    const seq = ++this._loadSeq;

    this._loading = true;
    this._loadError = '';
    this._actionErrors = new Map();
    this._announce(this._m.loading);
    this.requestUpdate();

    try {
      const page = normalizePage(
        await adapter.list({ signal: controller.signal }),
      );
      if (seq !== this._loadSeq || controller.signal.aborted) return;

      this._commentsVersion += 1;
      this._cancelReactions();
      this._comments = page.comments;
      this._error = '';
      this._showAll = false;
      this._emit('comments-loaded', {
        comments: page.comments.map((comment) => ({ ...comment })),
      });
      this._announce(this._m.commentCount(page.comments.length));
    } catch (error) {
      if (seq !== this._loadSeq || controller.signal.aborted) return;

      const normalized = toCommentsAdapterError(error);
      if (normalized.code === 'aborted') return;

      this._loadError = errorSummary(normalized) || this._m.loadError;
      this._emit('comments-error', {
        operation: 'load',
        error: normalized,
      });
      this._announce(this._m.loadError);
    } finally {
      if (seq === this._loadSeq) {
        this._loading = false;
        this._loadController = null;
        this.requestUpdate();
      }
    }
  }

  _toggleEmojiPicker(e: MouseEvent) {
    e.stopPropagation();
    this._emojiPickerOpen = !this._emojiPickerOpen;
    this._emojiPickerForComment = null;
    this.requestUpdate();
  }

  _handleTextEmojiSelect(e: Event, emoji: string) {
    e.stopPropagation();
    this._newComment += emoji;
    this._emojiPickerOpen = false;
    this.requestUpdate();
    this._focusInput();
  }

  _toggleCommentEmoji(e: Event, commentId: string) {
    e.stopPropagation();
    this._emojiPickerForComment =
      this._emojiPickerForComment === commentId ? null : commentId;
    this._emojiPickerOpen = false;
    this.requestUpdate();
  }

  _setCommentEmoji(e: Event, commentId: string, emoji: string) {
    e.stopPropagation();

    const previous = this._comments.find(
      (comment) => comment.id === commentId,
    );
    if (!previous) return;

    if (!this._reactionBaselines.has(commentId)) {
      this._reactionBaselines.set(commentId, {
        emoji: previous.emoji,
        liked: previous.liked,
      });
    }

    // Optimistic reaction; rolled back if the adapter rejects it.
    this._comments = this._comments.map((comment) =>
      comment.id === commentId ? { ...comment, emoji, liked: true } : comment,
    );
    this._emojiPickerForComment = null;
    this._clearActionError(commentId);
    this.requestUpdate();
    this._focusReactionTrigger(commentId);

    const adapter = this._adapter;
    if (!adapter?.react) {
      this._reactionBaselines.delete(commentId);
      return;
    }

    this._reactionDesired.set(commentId, emoji);
    if (!this._reactionRunning.has(commentId)) {
      const token = ++this._reactionTokenCounter;
      this._reactionRunToken.set(commentId, token);
      this._reactionRunning.add(commentId);
      void this._drainReactions(commentId, adapter, token);
    }
  }

  private async _drainReactions(
    commentId: string,
    adapter: CommentsAdapter,
    token: number,
  ): Promise<void> {
    const react = adapter.react?.bind(adapter);
    if (!react) return;

    try {
      while (
        this._adapter === adapter &&
        this._reactionRunToken.get(commentId) === token &&
        this._reactionDesired.has(commentId)
      ) {
        const requestedEmoji = this._reactionDesired.get(commentId) as string;
        this._reactionDesired.delete(commentId);
        const version = this._commentsVersion;
        const controller = new AbortController();
        this._reactionControllers.set(commentId, controller);

        let updated: Comment | void;
        try {
          updated = await react(commentId, requestedEmoji, {
            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted || this._adapter !== adapter) return;
          if (
            this._reactionRunToken.get(commentId) !== token ||
            this._commentsVersion !== version
          ) {
            this._clearReactionState(commentId);
            return;
          }
          // A newer reaction is queued: its result is authoritative.
          if (this._reactionDesired.has(commentId)) continue;

          const normalized = toCommentsAdapterError(error);
          this._revertReaction(commentId);
          this._setActionError(
            commentId,
            this._describeError(this._m.reactionError, normalized),
          );
          this._emit('comments-error', {
            operation: 'react',
            error: normalized,
            commentId,
            emoji: requestedEmoji,
          });
          this._clearReactionState(commentId);
          this.requestUpdate();
          return;
        } finally {
          if (this._reactionControllers.get(commentId) === controller) {
            this._reactionControllers.delete(commentId);
          }
        }

        if (controller.signal.aborted || this._adapter !== adapter) return;
        if (
          this._reactionRunToken.get(commentId) !== token ||
          this._commentsVersion !== version
        ) {
          this._clearReactionState(commentId);
          return;
        }

        this._applyReaction(commentId, requestedEmoji, updated);

        if (!this._reactionDesired.has(commentId)) {
          const appliedEmoji = this._currentEmoji(
            commentId,
            requestedEmoji,
          );
          this._reactionBaselines.delete(commentId);
          this._emit('comment-reaction-changed', {
            commentId,
            emoji: appliedEmoji,
          });
          this.requestUpdate();
          return;
        }
      }
    } finally {
      if (this._reactionRunToken.get(commentId) === token) {
        this._reactionRunning.delete(commentId);
        this._reactionControllers.delete(commentId);
      }
      if (this._adapter !== adapter) {
        this._clearReactionState(commentId);
      }
    }
  }

  private _applyReaction(
    commentId: string,
    requestedEmoji: string,
    updated: Comment | void,
  ): void {
    const raw =
      updated && typeof updated === 'object'
        ? (updated as Partial<Comment>)
        : undefined;
    const emoji =
      raw && typeof raw.emoji === 'string' && raw.emoji.trim()
        ? raw.emoji
        : requestedEmoji;
    const liked =
      raw && typeof raw.liked === 'boolean' ? raw.liked : true;

    // Merge only reaction fields: the rest of the comment is not replaced.
    this._comments = this._comments.map((comment) =>
      comment.id === commentId ? { ...comment, emoji, liked } : comment,
    );

    const baseline = this._reactionBaselines.get(commentId);
    if (baseline) {
      this._reactionBaselines.set(commentId, { emoji, liked });
    }
  }

  private _revertReaction(commentId: string): void {
    const baseline = this._reactionBaselines.get(commentId);
    if (!baseline) return;

    this._comments = this._comments.map((comment) =>
      comment.id === commentId
        ? { ...comment, emoji: baseline.emoji, liked: baseline.liked }
        : comment,
    );
  }

  private _currentEmoji(commentId: string, fallback: string): string {
    return (
      this._comments.find((comment) => comment.id === commentId)?.emoji ??
      fallback
    );
  }

  private _clearReactionState(commentId: string): void {
    this._reactionControllers.get(commentId)?.abort();
    this._reactionControllers.delete(commentId);
    this._reactionDesired.delete(commentId);
    this._reactionBaselines.delete(commentId);
  }

  _toggleShowAll() {
    this._showAll = !this._showAll;
  }

  _deleteComment(e: Event, commentId: string) {
    e.stopPropagation();
    if (this._deletingIds.has(commentId)) return;
    if (!this._comments.some((comment) => comment.id === commentId)) return;

    this._deletingIds.add(commentId);
    this._clearActionError(commentId);
    this.requestUpdate();

    const controller = new AbortController();
    this._deleteControllers.set(commentId, controller);
    void this._removeComment(
      commentId,
      this._adapter,
      this._adapterVersion,
      controller,
    );
  }

  private _exitDelay(): number {
    return typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : 300;
  }

  private async _removeComment(
    commentId: string,
    adapter: CommentsAdapter | null,
    adapterVersion: number,
    controller: AbortController,
  ): Promise<void> {
    const isObsolete = (): boolean =>
      controller.signal.aborted ||
      this._adapter !== adapter ||
      this._adapterVersion !== adapterVersion;

    try {
      if (adapter) {
        await adapter.remove(commentId, { signal: controller.signal });
        if (isObsolete()) return;
        // Keep the existing exit animation before removing the node.
        await new Promise((resolve) =>
          setTimeout(resolve, this._exitDelay()),
        );
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, this._exitDelay()),
        );
      }

      if (isObsolete()) return;
      this._finishDelete(commentId);
    } catch (error) {
      if (isObsolete()) return;

      const normalized = toCommentsAdapterError(error);
      this._deletingIds.delete(commentId);
      this._setActionError(
        commentId,
        this._describeError(this._m.deleteError, normalized),
      );
      this._emit('comments-error', {
        operation: 'delete',
        error: normalized,
        commentId,
      });
      this.requestUpdate();
    } finally {
      if (this._deleteControllers.get(commentId) === controller) {
        this._deleteControllers.delete(commentId);
      }
    }
  }

  private _finishDelete(commentId: string): void {
    if (!this._comments.some((comment) => comment.id === commentId)) {
      this._deletingIds.delete(commentId);
      this._cancelReaction(commentId);
      return;
    }

    const index = this._comments.findIndex(
      (comment) => comment.id === commentId,
    );

    this._comments = this._comments.filter(
      (comment) => comment.id !== commentId,
    );
    this._deletingIds.delete(commentId);
    this._cancelReaction(commentId);
    this._clearActionError(commentId);

    if (this._emojiPickerForComment === commentId) {
      this._emojiPickerForComment = null;
    }
    if (this._emojiPickerOpen) {
      this._emojiPickerOpen = false;
    }

    this._emit('comment-deleted', { commentId });
    this._announce(this._m.deleted);
    this.requestUpdate();
    this._focusAfterDelete(index);
  }

  _onDocumentClick(e: MouseEvent) {
    const path = e.composedPath();
    if (path.includes(this)) return;
    if (this._emojiPickerOpen || this._emojiPickerForComment !== null) {
      this._emojiPickerOpen = false;
      this._emojiPickerForComment = null;
      this.requestUpdate();
    }
  }

  _onInputSpotlightMove(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this._spotlightStyle = `background: radial-gradient(300px circle at ${x}px ${y}px, rgba(120,119,198,0.15), transparent 40%);`;
    this._spotlightVisible = true;
    this.requestUpdate();
  }

  _onInputSpotlightLeave() {
    this._spotlightVisible = false;
    this._spotlightStyle = '';
    this.requestUpdate();
  }

  _renderSkeleton() {
    return html`
      <div class="skeleton-grid" aria-hidden="true">
        ${[1, 2, 3, 4, 5, 6].map(
          () => html`
            <div class="skeleton-card">
              <div class="skeleton-avatar animate-pulse"></div>
              <div class="skeleton-line short animate-pulse"></div>
              <div class="skeleton-line full animate-pulse"></div>
              <div class="skeleton-line medium animate-pulse"></div>
            </div>
          `,
        )}
      </div>
    `;
  }

  _renderEmpty() {
    return html`
      <div class="empty-state" part="empty">
        <p>${this._m.empty}</p>
      </div>
    `;
  }

  private _renderLoadError() {
    const messages = this._m;
    const detail =
      this._loadError && this._loadError !== messages.loadError
        ? this._loadError
        : '';

    return html`
      <div class="error-state" part="error" role="alert">
        <p>${messages.loadError}</p>
        ${detail ? html`<p class="error-detail">${detail}</p>` : ''}
        <button
          class="retry-btn"
          part="retry"
          type="button"
          @click="${() => void this.reload()}"
        >
          ${messages.retry}
        </button>
      </div>
    `;
  }

  _renderComments() {
    const messages = this._m;
    const visible = this._showAll
      ? this._comments
      : this._comments.slice(0, this.maxcomments);
    const truncated =
      !this._showAll && this._comments.length > this.maxcomments;

    return html`
      <div class="comment-area">
        <div
          class="comment-grid${truncated ? ' truncated' : ''}"
          role="list"
        >
          ${visible.map((c) => {
            const deleting = this._deletingIds.has(c.id);
            const actionError = this._actionErrors.get(c.id);
            const pickerOpen = this._emojiPickerForComment === c.id;

            return html`
              <div
                class="comment-card${deleting ? ' deleting' : ''}"
                role="listitem"
                tabindex="-1"
                part="comment-card"
                data-comment-id="${c.id}"
                aria-busy="${deleting ? 'true' : 'false'}"
              >
                <div class="card-header">
                  <img
                    class="avatar"
                    part="avatar"
                    src="${c.avatar}"
                    alt=""
                    loading="lazy"
                    width="64"
                    height="64"
                  />
                  <div>
                    <p class="name" part="name">${c.name}</p>
                    <p class="time" part="time">${messages.timeAgo(c.date)}</p>
                  </div>
                </div>
                <p class="comment-text" part="text">${c.text}</p>
                <div class="card-footer">
                  <div class="reaction-wrapper">
                    <button
                      class="reaction-btn"
                      part="reaction"
                      type="button"
                      data-comment-id="${c.id}"
                      @click="${(e: Event) => this._toggleCommentEmoji(e, c.id)}"
                      aria-label="${messages.reactionLabel} ${c.name}"
                      aria-expanded="${pickerOpen ? 'true' : 'false'}"
                      aria-pressed="${c.liked === true ? 'true' : 'false'}"
                    >
                      ${c.emoji}
                    </button>
                    ${pickerOpen
                      ? html`
                          <div class="reaction-picker">
                            <div
                              class="emoji-picker-grid"
                              role="group"
                              aria-label="${messages.reactionLabel}"
                            >
                              ${EMOJIS.map(
                                (emoji) => html`
                                  <button
                                    type="button"
                                    @click="${(ev: Event) =>
                                      this._setCommentEmoji(ev, c.id, emoji)}"
                                    aria-label="${emoji}"
                                  >
                                    ${emoji}
                                  </button>
                                `,
                              )}
                            </div>
                          </div>
                        `
                      : ''}
                  </div>
                  <button
                    class="delete-btn"
                    part="delete"
                    type="button"
                    ?disabled="${deleting}"
                    @click="${(e: Event) => this._deleteComment(e, c.id)}"
                    aria-label="${messages.deleteLabel} ${c.name}"
                    title="${messages.deleteLabel} ${c.name}"
                  >
                    🗑
                  </button>
                </div>
                ${actionError
                  ? html`<p class="error action-error" role="alert">
                      ${actionError}
                    </p>`
                  : ''}
              </div>
            `;
          })}
        </div>
        ${truncated
          ? html`<div class="gradient-overlay" aria-hidden="true"></div>`
          : ''}
      </div>
      ${this._comments.length > this.maxcomments
        ? html`
            <button
              class="show-more-btn"
              part="show-more"
              type="button"
              aria-expanded="${this._showAll ? 'true' : 'false'}"
              @click="${this._toggleShowAll}"
            >
              ${this._showAll ? messages.showLess : messages.showMore}
            </button>
          `
        : ''}
    `;
  }

  render() {
    const messages = this._m;
    const busy = this._loading || this._submitting;
    const showSkeleton = this._loading && this._comments.length === 0;
    const theme = this.theme === 'light' ? 'light' : 'dark';

    return html`
      <div
        class="container ${theme}"
        part="container"
        aria-busy="${busy ? 'true' : 'false'}"
      >
        <p
          class="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          ${this._announcement}
        </p>
        <h2 part="title">${messages.title}</h2>

        <div class="input-area">
          <div class="input-spotlight"
            @mousemove="${this._onInputSpotlightMove}"
            @mouseleave="${this._onInputSpotlightLeave}">
            <textarea
              .value="${live(this._newComment)}"
              @input="${this._onInput}"
              @keydown="${this._onKeyDown}"
              placeholder="${this.placeholder}"
              maxlength="${this.charlimit}"
              aria-label="${messages.composerLabel}"
              aria-describedby="char-hint"
              part="textarea"
            ></textarea>
            <div class="input-spotlight-overlay${this._spotlightVisible ? ' visible' : ''}" style="${this._spotlightStyle}"></div>
          </div>
          <span id="char-hint" class="sr-only">
            ${messages.charLimitHint(this.charlimit)}
          </span>
          <div class="char-count${this._newComment.length > this.charlimit * 0.9
            ? ' over'
            : ''}" part="char-count" aria-hidden="true">
            ${this._newComment.length}/${this.charlimit}
          </div>
          ${this._error
            ? html`<p class="error" role="alert" part="error">
                ${this._error}
              </p>`
            : ''}
          <div class="button-row">
            <button
              class="emoji-btn"
              part="emoji-button"
              type="button"
              @click="${this._toggleEmojiPicker}"
              title="${messages.emojiPickerLabel}"
              aria-label="${messages.emojiPickerLabel}"
              aria-expanded="${this._emojiPickerOpen ? 'true' : 'false'}"
            >
              😊
            </button>
            <button
              class="submit-btn"
              part="submit"
              type="button"
              @click="${this._addComment}"
              ?disabled="${busy}"
            >
              ${this._submitting ? messages.submitting : messages.submit}
            </button>
          </div>
          ${this._emojiPickerOpen
            ? html`
                <div class="emoji-picker-wrapper">
                  <div
                    class="emoji-picker-grid"
                    role="group"
                    aria-label="${messages.emojiPickerLabel}"
                  >
                    ${EMOJIS.map(
                      (emoji) => html`
                        <button
                          type="button"
                          @click="${(ev: Event) =>
                            this._handleTextEmojiSelect(ev, emoji)}"
                          aria-label="${emoji}"
                        >
                          ${emoji}
                        </button>
                      `,
                    )}
                  </div>
                </div>
              `
            : ''}
        </div>

        ${showSkeleton
          ? this._renderSkeleton()
          : html`
              ${this._loadError ? this._renderLoadError() : ''}
              ${this._comments.length === 0
                ? this._loadError
                  ? ''
                  : this._renderEmpty()
                : this._renderComments()}
            `}
      </div>
    `;
  }
}

if (
  typeof customElements !== 'undefined' &&
  !customElements.get('universal-comments')
) {
  customElements.define('universal-comments', UniversalComments);
}

declare global {
  interface HTMLElementTagNameMap {
    'universal-comments': UniversalComments;
  }
}
