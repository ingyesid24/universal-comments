import type {
  Comment,
  CommentPage,
  CommentQuery,
  CommentsAdapter,
  CommentsMessages,
} from 'universal-comments';
import {
  CommentsAdapterError,
  DEFAULT_MESSAGES,
  isCommentsAdapterError,
  toCommentsAdapterError,
  UniversalComments,
} from 'universal-comments';
import {
  InMemoryCommentsAdapter,
  createRestCommentsAdapter,
  isCommentsAdapterError as isAdapterError,
} from 'universal-comments/adapters';

const comment: Comment = {
  id: '1',
  text: 'Hola',
  date: new Date().toISOString(),
  name: 'Ana',
  avatar: '',
  emoji: '👍',
};
const author = { name: 'Ana', avatar: '/ana.png' };
const query: CommentQuery = { limit: 10, cursor: null };
const page: CommentPage = { comments: [comment], hasMore: false };
const adapter: CommentsAdapter = new InMemoryCommentsAdapter({
  comments: page.comments,
});
const rest = createRestCommentsAdapter({
  urls: {
    list: '/comments',
    create: '/comments',
    remove: (id) => `/comments/${id}`,
  },
  timeoutMs: 1000,
  treatNotFoundAsSuccess: false,
});
const error = new CommentsAdapterError('x', { code: 'network' });
const normalized = toCommentsAdapterError(error);
const messages: CommentsMessages = DEFAULT_MESSAGES;
const element = new UniversalComments();

void query;
void author;
void adapter;
void rest;
void isCommentsAdapterError(normalized);
void isAdapterError(normalized);
void messages;
void element;
