import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window();
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  customElements: window.customElements,
  CustomEvent: window.CustomEvent,
  CSSStyleSheet: window.CSSStyleSheet,
  Event: window.Event,
});

const mainUrl = new URL('../dist/universal-comments.es.js', import.meta.url);
const adaptersUrl = new URL('../dist/adapters.es.js', import.meta.url);

async function settle(element) {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
  }
}

const comment = (id, text) => ({
  id,
  text,
  date: new Date().toISOString(),
  name: 'Ana',
  avatar: '',
  emoji: '👍',
});

// This element is created and configured before the custom element is imported.
// It verifies that Lit preserves pre-upgrade properties.
const seedA = comment('seed-a', 'Desde el adaptador');
const seedB = comment('seed-b', 'Desde initialComments');
let createdAuthor;
const preUpgradeAdapter = {
  list: async () => ({ comments: [seedA] }),
  create: async (input) => {
    createdAuthor = input.author;
    return comment('created-a', input.text);
  },
  remove: async () => undefined,
};

const withAdapter = window.document.createElement('universal-comments');
withAdapter.adapter = preUpgradeAdapter;
withAdapter.author = { name: 'Autora pre-upgrade' };
withAdapter.messages = { title: 'Título pre-upgrade' };

const withInitialComments = window.document.createElement('universal-comments');
withInitialComments.initialComments = [seedB];

window.document.body.appendChild(withAdapter);
window.document.body.appendChild(withInitialComments);

const main = await import(mainUrl.href);
await settle(withAdapter);
await settle(withInitialComments);

assert.ok(withAdapter.shadowRoot, 'pre-upgrade element has no shadow root');
assert.equal(
  withAdapter.shadowRoot.querySelector('h2')?.textContent?.trim(),
  'Título pre-upgrade',
);
assert.match(
  withAdapter.shadowRoot.querySelector('.comment-text')?.textContent ?? '',
  /Desde el adaptador/,
);
assert.match(
  withInitialComments.shadowRoot?.querySelector('.comment-text')
    ?.textContent ?? '',
  /Desde initialComments/,
);

const textarea = withAdapter.shadowRoot.querySelector('textarea');
textarea.value = 'Creado tras upgrade';
textarea.dispatchEvent(new window.Event('input'));
withAdapter.shadowRoot.querySelector('.submit-btn').click();
await settle(withAdapter);
assert.equal(createdAuthor?.name, 'Autora pre-upgrade');

// Error identity across the main bundle and the adapters bundle.
const adapters = await import(adaptersUrl.href);
assert.notEqual(
  main.CommentsAdapterError,
  adapters.CommentsAdapterError,
  'expected distinct class identities across bundles',
);

const rest = adapters.createRestCommentsAdapter({
  urls: {
    list: '/comments',
    create: '/comments',
    remove: (id) => `/comments/${id}`,
  },
  fetch: async () =>
    new Response(JSON.stringify({ message: 'No autorizado' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }),
});

const errorElement = window.document.createElement('universal-comments');
let errorDetail;
errorElement.addEventListener('comments-error', (event) => {
  errorDetail = event.detail;
});
errorElement.adapter = rest;
window.document.body.appendChild(errorElement);
await settle(errorElement);

assert.equal(errorDetail?.operation, 'load');
assert.equal(errorDetail?.error?.code, 'unauthorized');
assert.equal(errorDetail?.error?.status, 401);
assert.equal(errorDetail?.error?.retryable, false);
assert.equal(errorDetail?.error?.cause?.message, 'No autorizado');
assert.ok(errorDetail.error instanceof main.CommentsAdapterError);
assert.equal(main.isCommentsAdapterError(errorDetail.error), true);
assert.equal(adapters.isCommentsAdapterError(errorDetail.error), true);

console.log(
  'OK: pre-upgrade properties, adapter flow and cross-bundle REST error identity',
);
