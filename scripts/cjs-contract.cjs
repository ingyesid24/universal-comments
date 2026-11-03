const assert = require('node:assert/strict');
const { Window } = require('happy-dom');

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

const comment = (id, text) => ({
  id,
  text,
  date: new Date().toISOString(),
  name: 'Ana',
  avatar: '',
  emoji: '👍',
});

// CJS upgrade test: properties assigned before require() must survive.
const preUpgrade = window.document.createElement('universal-comments');
preUpgrade.adapter = {
  list: async () => ({ comments: [comment('seed', 'CJS pre-upgrade')] }),
  create: async (input) => comment('created', input.text),
  remove: async () => undefined,
};
window.document.body.appendChild(preUpgrade);

const main = require('../dist/universal-comments.umd.cjs');
const adapters = require('../dist/adapters.cjs');

assert.equal(typeof main.UniversalComments, 'function');
assert.equal(typeof main.CommentsAdapterError, 'function');
assert.equal(typeof adapters.InMemoryCommentsAdapter, 'function');
assert.equal(typeof adapters.createRestCommentsAdapter, 'function');
assert.notEqual(main.CommentsAdapterError, adapters.CommentsAdapterError);

const settle = async (element) => {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
  }
};

(async () => {
  await settle(preUpgrade);
  assert.match(
    preUpgrade.shadowRoot?.querySelector('.comment-text')?.textContent ?? '',
    /CJS pre-upgrade/,
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

  let detail;
  const element = window.document.createElement('universal-comments');
  element.addEventListener('comments-error', (event) => {
    detail = event.detail;
  });
  element.adapter = rest;
  window.document.body.appendChild(element);
  await settle(element);

  assert.equal(detail?.error?.code, 'unauthorized');
  assert.equal(detail?.error?.status, 401);
  assert.equal(detail?.error?.retryable, false);
  assert.equal(detail?.error?.cause?.message, 'No autorizado');
  assert.ok(detail.error instanceof main.CommentsAdapterError);

  console.log('OK: CJS imports, pre-upgrade properties and error identity');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
