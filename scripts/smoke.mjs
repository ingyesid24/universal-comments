import { Window } from 'happy-dom';

const w = new Window();
globalThis.window = w;
globalThis.document = w.document;
globalThis.HTMLElement = w.HTMLElement;
globalThis.customElements = w.customElements;
globalThis.CustomEvent = w.CustomEvent;
globalThis.CSSStyleSheet = w.CSSStyleSheet;

async function flush(el) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await el.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await el.updateComplete;
}

const main = await import('universal-comments');
if (typeof main.UniversalComments !== 'function') {
  throw new Error('UniversalComments export missing');
}
if (typeof main.CommentsAdapterError !== 'function') {
  throw new Error('CommentsAdapterError export missing');
}

const adaptersModule = await import('universal-comments/adapters');
const { InMemoryCommentsAdapter, createRestCommentsAdapter } = adaptersModule;
if (typeof InMemoryCommentsAdapter !== 'function') {
  throw new Error('InMemoryCommentsAdapter export missing');
}
if (typeof createRestCommentsAdapter !== 'function') {
  throw new Error('createRestCommentsAdapter export missing');
}

const seed = {
  id: 'seed-1',
  text: 'Comentario inicial',
  date: new Date().toISOString(),
  name: 'Ana García',
  avatar: '',
  emoji: '👍',
};

const adapter = new InMemoryCommentsAdapter({ comments: [seed] });
const el = w.document.createElement('universal-comments');
el.adapter = adapter;
w.document.body.appendChild(el);
await flush(el);

if (!el.shadowRoot.querySelector('.comment-card')) {
  throw new Error('adapter list did not render comments');
}

let added = null;
el.addEventListener('comment-added', (event) => {
  added = event.detail.comment;
});

const textarea = el.shadowRoot.querySelector('textarea');
textarea.value = 'Smoke test adapter';
textarea.dispatchEvent(new w.Event('input'));
el.shadowRoot.querySelector('.submit-btn').click();
await flush(el);

if (!added || added.text !== 'Smoke test adapter') {
  throw new Error('comment-added event failed with adapter');
}
if (!adapter.snapshot().some((comment) => comment.text === 'Smoke test adapter')) {
  throw new Error('adapter create was not persisted in memory');
}

const legacy = w.document.createElement('universal-comments');
legacy.initialComments = [];
w.document.body.appendChild(legacy);
await flush(legacy);

let legacyAdded = null;
legacy.addEventListener('comment-added', (event) => {
  legacyAdded = event.detail.comment;
});

const legacyTextarea = legacy.shadowRoot.querySelector('textarea');
legacyTextarea.value = 'Smoke test legacy';
legacyTextarea.dispatchEvent(new w.Event('input'));
legacy.shadowRoot.querySelector('.submit-btn').click();
await flush(legacy);

if (!legacyAdded || legacyAdded.text !== 'Smoke test legacy') {
  throw new Error('comment-added event failed in legacy mode');
}

const rest = createRestCommentsAdapter({
  urls: {
    list: '/comments',
    create: '/comments',
    remove: (id) => `/comments/${id}`,
  },
});
if (typeof rest.list !== 'function' || typeof rest.create !== 'function') {
  throw new Error('REST adapter factory returned an invalid adapter');
}

console.log('OK: main + adapters import, adapter flow, legacy flow and REST factory');
