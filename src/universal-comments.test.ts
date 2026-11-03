import { expect } from '@esm-bundle/chai';
import type { Comment } from './types.js';
import { UniversalComments } from './universal-comments.js';

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

function makeComments(count: number): Comment[] {
  return Array.from({ length: count }, (_, index) =>
    makeComment({
      id: `c${index + 1}`,
      text: `Comentario ${index + 1}`,
      name: `Persona ${index + 1}`,
    }),
  );
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
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
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

describe('universal-comments (legacy mode)', () => {
  afterEach(() => {
    while (mounted.length > 0) {
      mounted.pop()?.remove();
    }
  });

  it('renders the title and loses the skeleton after initialComments', async () => {
    const element = mount(createElement({ initialComments: [] }));
    await flush(element);

    expect(element.shadowRoot?.querySelector('h2')?.textContent?.trim()).to.equal(
      'Comentarios',
    );
    expect(element.shadowRoot?.querySelector('.skeleton-grid')).to.not.exist;
  });

  it('shows the loading skeleton initially', async () => {
    const element = mount(createElement());
    await element.updateComplete;

    const skeleton = element.shadowRoot?.querySelector('.skeleton-grid');
    expect(skeleton).to.exist;
    expect(skeleton?.getAttribute('aria-hidden')).to.equal('true');

    const container = element.shadowRoot?.querySelector('.container');
    expect(container?.getAttribute('aria-busy')).to.equal('true');
    expect(
      (element.shadowRoot?.querySelector('.submit-btn') as HTMLButtonElement)
        .disabled,
    ).to.equal(true);
  });

  it('transitions from the legacy skeleton to the empty state', async () => {
    const element = mount(createElement());
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await flush(element);

    expect(element.shadowRoot?.querySelector('.skeleton-grid')).to.not.exist;
    expect(element.shadowRoot?.querySelector('.empty-state')?.textContent).to.include(
      'No hay comentarios',
    );
    expect(
      element.shadowRoot?.querySelector('[role="status"]')?.textContent,
    ).to.include('No hay comentarios');
  });

  it('adds a comment and emits comment-added synchronously', async () => {
    const element = mount(createElement({ initialComments: [] }));
    await flush(element);

    let payload!: { comment?: Comment };
    element.addEventListener('comment-added', (event) => {
      payload = (event as CustomEvent).detail;
    });

    submit(element, 'Hola mundo');
    await flush(element);

    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      1,
    );
    expect(payload?.comment?.text).to.equal('Hola mundo');
    expect(
      (element.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement)
        .value,
    ).to.equal('');
    expect(
      element.shadowRoot?.querySelector('[role="status"]')?.textContent,
    ).to.include('Comentario publicado');
  });

  it('formats relative dates in Spanish and allows overriding them', async () => {
    const element = mount(createElement({ initialComments: [makeComment()] }));
    await flush(element);

    const time = () =>
      element.shadowRoot?.querySelector('[part="time"]')?.textContent?.trim();
    expect(time()).to.equal('justo ahora');

    element.messages = { timeAgo: () => 'hace un rato' };
    await flush(element);
    expect(time()).to.equal('hace un rato');
  });

  it('accepts initialComments via property after connecting', async () => {
    const element = mount(createElement({ initialComments: [] }));
    await flush(element);

    element.initialComments = [
      makeComment({ id: 'prop-1', text: 'Desde propiedad' }),
    ];
    await flush(element);

    const cards = element.shadowRoot?.querySelectorAll('.comment-card');
    expect(cards).to.have.length(1);
    expect(cards?.[0]?.textContent).to.include('Desde propiedad');
  });

  it('normalizes initial comments and rejects unsafe avatar URLs', async () => {
    const element = mount(
      createElement({
        initialComments: [
          makeComment({
            id: 'safe-1',
            avatar: 'javascript:alert(1)',
            text: '<img src=x onerror="alert(1)">',
          }),
        ],
      }),
    );
    await flush(element);

    const text = element.shadowRoot?.querySelector('.comment-text');
    expect(text?.textContent).to.equal('<img src=x onerror="alert(1)">');
    expect(text?.querySelector('img')).to.not.exist;

    const avatar = element.shadowRoot?.querySelector(
      '.avatar',
    ) as HTMLImageElement;
    expect(avatar.src).to.match(/^https:\/\/i\.pravatar\.cc/);
  });

  it('deletes a comment and emits comment-deleted', async () => {
    const element = mount(
      createElement({ initialComments: [makeComment({ id: 'del-1' })] }),
    );
    await flush(element);

    let payload!: { commentId?: string };
    element.addEventListener('comment-deleted', (event) => {
      payload = (event as CustomEvent).detail;
    });

    element.shadowRoot?.querySelector<HTMLButtonElement>('.delete-btn')?.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flush(element);

    expect(payload?.commentId).to.equal('del-1');
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      0,
    );
  });

  it('validates the minimum length', async () => {
    const element = mount(createElement({ initialComments: [] }));
    await flush(element);

    submit(element, 'ab');
    await flush(element);

    const error = element.shadowRoot?.querySelector('.error[role="alert"]');
    expect(error?.textContent).to.include('al menos 3');
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      0,
    );
  });

  it('validates the character limit', async () => {
    const element = mount(
      createElement({ initialComments: [], charlimit: 5 }),
    );
    await flush(element);

    submit(element, '123456');
    await flush(element);

    const error = element.shadowRoot?.querySelector('.error[role="alert"]');
    expect(error?.textContent).to.include('exceder 5');
  });

  it('paginates comments with Ver más / Ver menos', async () => {
    const element = mount(
      createElement({ initialComments: makeComments(8), maxcomments: 2 }),
    );
    await flush(element);

    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      2,
    );

    let button = element.shadowRoot?.querySelector(
      '.show-more-btn',
    ) as HTMLButtonElement;
    expect(button.textContent?.trim()).to.equal('Ver más');
    button.click();
    await flush(element);

    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      8,
    );
    button = element.shadowRoot?.querySelector(
      '.show-more-btn',
    ) as HTMLButtonElement;
    expect(button.textContent?.trim()).to.equal('Ver menos');

    button.click();
    await flush(element);
    expect(element.shadowRoot?.querySelectorAll('.comment-card')).to.have.length(
      2,
    );
  });

  it('updates reactions locally', async () => {
    const element = mount(
      createElement({ initialComments: [makeComment({ id: 'r1' })] }),
    );
    await flush(element);

    element.shadowRoot?.querySelector<HTMLButtonElement>('.reaction-btn')?.click();
    await flush(element);

    const buttons = Array.from(
      element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
        '.reaction-picker button',
      ) ?? [],
    );
    const fire = buttons.find((button) => button.textContent?.trim() === '🔥');
    expect(fire).to.exist;
    fire?.click();
    await flush(element);

    const reaction = element.shadowRoot?.querySelector('.reaction-btn');
    expect(reaction?.textContent?.trim()).to.equal('🔥');
    expect(reaction?.getAttribute('aria-pressed')).to.equal('true');
  });

  it('applies the light theme', async () => {
    const element = mount(
      createElement({ initialComments: [], theme: 'light' }),
    );
    await flush(element);
    expect(
      element.shadowRoot?.querySelector('.container')?.classList.contains('light'),
    ).to.equal(true);
  });

  it('maps HTML attributes to properties', async () => {
    const element = document.createElement(
      'universal-comments',
    ) as UniversalComments;
    element.setAttribute('max-comments', '2');
    element.setAttribute('char-limit', '10');
    element.setAttribute('theme', 'light');
    element.initialComments = [];
    mount(element);
    await flush(element);

    expect(element.maxcomments).to.equal(2);
    expect(element.charlimit).to.equal(10);
    expect(element.theme).to.equal('light');
  });

  it('emits bubbling and composed events', async () => {
    const element = mount(createElement({ initialComments: [] }));
    await flush(element);

    let received!: Event;
    const handler = (event: Event) => {
      received = event;
    };
    document.body.addEventListener('comment-added', handler);

    try {
      submit(element, 'Evento compuesto');
      await flush(element);
    } finally {
      document.body.removeEventListener('comment-added', handler);
    }

    expect(received).to.exist;
    expect(received?.bubbles).to.equal(true);
    expect((received as CustomEvent | null)?.composed).to.equal(true);
  });

  it('exposes accessible labels, roles and a live region', async () => {
    const element = mount(
      createElement({ initialComments: [makeComment({ id: 'a11y' })] }),
    );
    await flush(element);

    const textarea = element.shadowRoot?.querySelector('textarea');
    expect(textarea?.getAttribute('aria-label')).to.equal(
      'Escribe un comentario',
    );
    expect(textarea?.getAttribute('aria-describedby')).to.equal('char-hint');

    expect(
      element.shadowRoot?.querySelector('.comment-grid')?.getAttribute('role'),
    ).to.equal('list');
    expect(
      element.shadowRoot
        ?.querySelector('.comment-card')
        ?.getAttribute('role'),
    ).to.equal('listitem');
    expect(
      element.shadowRoot?.querySelector('.delete-btn')?.getAttribute('aria-label'),
    ).to.include('Ana García');
    expect(
      element.shadowRoot?.querySelector('[role="status"]')?.getAttribute(
        'aria-live',
      ),
    ).to.equal('polite');
    expect(
      element.shadowRoot?.querySelector('.reaction-btn')?.getAttribute(
        'aria-haspopup',
      ),
    ).to.equal(null);
    expect(
      element.shadowRoot?.querySelector('.emoji-btn')?.getAttribute(
        'aria-haspopup',
      ),
    ).to.equal(null);
    expect(
      element.shadowRoot?.querySelector('.avatar')?.getAttribute('alt'),
    ).to.equal('');
    expect(UniversalComments.styles.cssText).to.include('.comment-card:focus');
  });

  it('honours prefers-reduced-motion', () => {
    expect(UniversalComments.styles.cssText).to.include(
      'prefers-reduced-motion',
    );
    expect(UniversalComments.styles.cssText).to.include('--uc-error-light');
    expect(UniversalComments.styles.cssText).to.include('.comment-card:focus');
  });
});
