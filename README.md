# universal-comments

[![npm](https://img.shields.io/npm/v/universal-comments?color=3b82f6&label=npm)](https://www.npmjs.com/package/universal-comments)
[![bundle size](https://img.shields.io/bundlephobia/minzip/universal-comments?label=gzip)](https://bundlephobia.com/package/universal-comments)
[![CI](https://github.com/ingyesid24/universal-comments/actions/workflows/ci.yml/badge.svg)](https://github.com/ingyesid24/universal-comments/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/ingyesid24?label=Sponsor&logo=GitHub&color=ea4aaa)](https://github.com/sponsors/ingyesid24)

Web Component de comentarios open source listo para usar en **HTML, React, Astro, Next.js, Vue y cualquier framework**.

> **English:** `universal-comments` is a drop-in, framework-agnostic comments section built as a Web Component (Lit). Emoji reactions, dark/light theme, accessible, and pluggable storage adapters (in-memory, REST or your own). Install with `npm install universal-comments` or load it from a CDN with one `<script type="module">` tag. UI texts default to Spanish and can be replaced via the `messages` property.

📖 **Documentación y demo en vivo:** https://components-comentarios.vercel.app/

- 🌙 Tema dark/light
- 😊 Reacciones con emojis
- 📱 Responsive grid (1–3 columnas)
- ♿ Accesible (ARIA, live regions, foco y `prefers-reduced-motion`)
- 🔌 Adaptadores de almacenamiento (`memory`, `REST` o propios)
- ⚡ ~18 KB gzip el componente principal (adaptadores aparte)
- 📦 TypeScript + Tests

## Vista previa

![universal-comments dark theme](docs/public/preview-dark.svg)

## Instalación

```sh
npm install universal-comments
```

Con otros gestores de paquetes:

```sh
pnpm add universal-comments
bun add universal-comments
yarn add universal-comments
```

## Uso rápido

**HTML plano, sin instalar nada (CDN):**

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/universal-comments@0.1/dist/universal-comments.es.js"></script>
<universal-comments></universal-comments>
```

**Con un bundler (Vite, webpack, Next.js…):**

```js
import "universal-comments";
// y en tu HTML: <universal-comments></universal-comments>
```

**React / Astro / Next.js:**

```jsx
import "universal-comments";

function App() {
  return <universal-comments max-comments="6" placeholder="Deja tu comentario..." theme="dark" />;
}
```

> ⚠️ **SSR / Next.js**: importa el componente solo en el cliente (p. ej. dentro de `useEffect` o con `next/dynamic` con `ssr: false`), ya que los Web Components requieren un navegador.

**CDN (sin npm):** jsDelivr o unpkg. Fija la versión (`@0.1`) para evitar cambios inesperados.

```html
<script type="module" src="https://unpkg.com/universal-comments@0.1/dist/universal-comments.es.js"></script>
<universal-comments theme="light"></universal-comments>

<!-- Adaptadores (REST, memoria) también por CDN -->
<script type="module">
  import { createRestCommentsAdapter } from "https://cdn.jsdelivr.net/npm/universal-comments@0.1/dist/adapters.es.js";
  document.querySelector("universal-comments").adapter = createRestCommentsAdapter({
    urls: {
      list: "/api/comments",
      create: "/api/comments",
      remove: (id) => "/api/comments/" + id,
    },
  });
</script>
```

## Atributos

| Atributo       | Tipo             | Default                         | Descripción                                   |
|----------------|------------------|----------------------------------|-----------------------------------------------|
| `max-comments` | `number`         | `6`                              | Comentarios visibles antes de "Ver más"       |
| `placeholder`  | `string`         | `"Escribe un comentario..."`     | Placeholder del textarea                      |
| `theme`        | `"dark"\|"light"`| `"dark"`                         | Tema del componente                           |
| `char-limit`   | `number`         | `500`                            | Máximo de caracteres por comentario           |

## Propiedades JavaScript

Los objetos y funciones **no** se configuran como atributos HTML.

| Propiedad | Tipo | Descripción |
|---|---|---|
| `initialComments` | `Comment[]` | Comentarios iniciales o semilla. |
| `adapter` | `CommentsAdapter \| null` | Almacenamiento externo. Al asignarlo se cargan los comentarios. |
| `author` | `{ name: string; avatar?: string }` | Autor usado al publicar (la identidad definitiva debe validarla el backend). |
| `messages` | `Partial<CommentsMessages>` | Textos de la interfaz (por defecto, español). |
| `reload()` | `Promise<void>` | Recarga desde el adaptador. |

> Las propiedades asignadas antes del upgrade del custom element se conservan. Aun así, importar primero el componente es el patrón recomendado.

## Adaptadores

El componente **no incluye backend**. Sin `adapter`, funciona en memoria como hasta ahora (incluido el skeleton de demostración de 2 s). Con `adapter`, la carga, la publicación, la eliminación y las reacciones se delegan en el almacenamiento que elijas.

### Adaptador en memoria (demos y tests)

```js
import "universal-comments";
import { InMemoryCommentsAdapter } from "universal-comments/adapters";

const comments = new InMemoryCommentsAdapter({
  comments: [
    {
      id: "1",
      text: "¡Hola!",
      date: new Date().toISOString(),
      name: "Ana",
      avatar: "",
      emoji: "👍",
    },
  ],
});

document.querySelector("universal-comments").adapter = comments;
```

> El adaptador en memoria **no persiste datos**: se pierde al recargar la página. No lo presentes como almacenamiento real.

### Adaptador propio

```js
const adapter = {
  async list({ signal } = {}) {
    const response = await fetch("/api/comments", { signal });
    if (!response.ok) throw new Error("No se pudo cargar");
    return { comments: await response.json() };
  },
  async create({ text, author }, { signal } = {}) {
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, author }),
      signal,
    });
    if (!response.ok) throw new Error("No se pudo publicar");
    return response.json();
  },
  async remove(id, { signal } = {}) {
    const response = await fetch(`/api/comments/${id}`, {
      method: "DELETE",
      signal,
    });
    if (!response.ok) throw new Error("No se pudo eliminar");
  },
  // Opcional:
  async react(id, emoji, { signal } = {}) {
    const response = await fetch(`/api/comments/${id}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
      signal,
    });
    if (!response.ok) throw new Error("No se pudo reaccionar");
    return response.json();
  },
};

document.querySelector("universal-comments").adapter = adapter;
```

### Adaptador REST configurable

```js
import { createRestCommentsAdapter } from "universal-comments/adapters";

const adapter = createRestCommentsAdapter({
  urls: {
    list: "/api/comments",
    create: "/api/comments",
    remove: (id) => `/api/comments/${id}`,
    react: (id) => `/api/comments/${id}/reactions`, // opcional
  },
  headers: async () => ({
    Authorization: `Bearer ${await obtenerToken()}`,
  }),
  parseList: (data) => ({ comments: data.data }), // opcional
  parseComment: (data) => data.data,              // opcional
  timeoutMs: 10_000,                              // opcional
  treatNotFoundAsSuccess: false,                  // opcional
});
```

`createRestCommentsAdapter` **no inventa endpoints, esquemas ni autenticación**: las URLs, cabeceras y parsers son tuyos. Los valores por defecto documentados son:

- `GET list` → `Comment[]` o `{ comments: Comment[] }`.
- `POST create` → cuerpo `{ text, author? }`.
- `POST react` → cuerpo `{ emoji }`.
- `DELETE remove` → un `404` es un error por defecto. Usa `treatNotFoundAsSuccess: true` solo si tu backend elimina de forma idempotente.
- `timeoutMs` → opcional; si expira, la operación falla con `code: "timeout"`.
- `application/json` y `application/*+json` se parsean como JSON.

## Eventos

Todos se emiten con `bubbles: true` y `composed: true`.

| Evento | Detalle | Cuándo |
|---|---|---|
| `comment-added` | `{ comment: Comment }` | Tras confirmar la creación (con adaptador) o inmediatamente en modo local. |
| `comment-deleted` | `{ commentId: string }` | Tras confirmar y animar la eliminación. |
| `comments-loaded` | `{ comments: Comment[] }` | Cuando el adaptador termina de cargar. |
| `comments-error` | `{ operation, error, commentId? }` | Cuando falla una operación del adaptador. |
| `comment-reaction-changed` | `{ commentId, emoji }` | Cuando la reacción se persiste correctamente. |

`error` es una instancia de `CommentsAdapterError` con `code` (`network`, `unauthorized`, `forbidden`, `not-found`, `conflict`, `validation`, `rate-limited`, `timeout`, `server`, `aborted`, `unknown`), `status?` y `retryable`. El componente **no reintenta automáticamente**: muestra el error y ofrece un botón de reintento en la carga. Si importas la entrada principal y el subpath de adaptadores por separado, usa `isCommentsAdapterError()` para reconocer errores entre ambos bundles.

## CommonJS y SSR

La entrada principal es un Web Component y requiere un navegador con DOM (`HTMLElement`); no se puede importar en Node sin un DOM. El subpath `universal-comments/adapters` sí funciona sin DOM. Para TypeScript, `moduleResolution: "bundler"` o `"node16"` en un proyecto ESM es lo recomendado; la resolución de tipos desde un proyecto CommonJS con `node16` puede requerir ESM o `bundler`.

## Seguridad y responsabilidades del backend

- Lit escapa el texto y los nombres: los comentarios se muestran como texto, nunca como HTML.
- Las URLs de avatar se validan; se rechazan esquemas como `javascript:`.
- El componente **no es un mecanismo de autorización**. Ocultar o deshabilitar botones es solo UX.
- El backend del consumidor debe implementar autenticación, autorización de borrado, moderación, validación definitiva, límites de frecuencia y protección contra spam.
- No incluyas secretos en el bundle: las claves se pasan en tiempo de ejecución mediante `headers`/`fetch`.
- Los nombres y avatares enviados por el cliente no son confiables; el servidor debe asociarlos al usuario autenticado.

## Personalización

Variables CSS públicas: `--uc-accent`, `--uc-accent-strong`, `--uc-accent-strong-hover`, `--uc-error`, `--uc-error-light` y `--uc-radius`.

Shadow parts: `container`, `title`, `textarea`, `char-count`, `submit`, `emoji-button`, `comment-card`, `avatar`, `name`, `time`, `text`, `reaction`, `delete`, `show-more`, `empty`, `error`, `retry`.

## Documentación

Visita la [documentación completa](https://components-comentarios.vercel.app/) con ejemplos interactivos, guía rápida, adaptadores y referencia de API.

## Desarrollo

```sh
git clone https://github.com/ingyesid24/universal-comments.git
cd universal-comments
npm install
npm run build        # Compila componente y adaptadores
npm run typecheck    # Comprueba src y tests
npm test             # Ejecuta los tests de navegador
npm run test:types   # Comprueba los tipos públicos consumidos
npm run test:package # Contrato del paquete construido (ESM)
npm run test:package:cjs # Contrato CJS del paquete construido
node scripts/smoke.mjs   # Smoke test del paquete compilado
```

`npm run dev` sirve el demo de `index.html`; `npm run preview` construye ese demo y lo previsualiza.

La suite incluye comprobaciones estructurales de accesibilidad (roles, etiquetas, live regions, foco y `prefers-reduced-motion`). No se ejecuta una auditoría automática con axe; queda como pendiente explícito.

## Docs site

La documentación consume `dist/`, así que compila la librería antes:

```sh
npm install
npm run build
cd docs
npm install
npm run dev      # http://localhost:4321
```

## Contribuir

La rama `main` está protegida. No se permite push directo ni merge sin PR aprobado.

1. Haz fork del repo
2. Crea una rama: `git checkout -b mi-feature`
3. Haz tus cambios y corre los tests: `npm test`
4. Asegúrate de que la build pase: `npm run build`
5. Abre un Pull Request describiendo los cambios
6. Espera la revisión y aprobación

### Reportar bugs

Si encuentras un bug, [abre un issue aquí](https://github.com/ingyesid24/universal-comments/issues/new).

## Apoya el proyecto ♥

universal-comments es gratis y open source (MIT). Si te ahorra tiempo, puedes:

- [**Patrocinarlo en GitHub Sponsors**](https://github.com/sponsors/ingyesid24): financia nuevas funciones, adaptadores y mantenimiento.
- Darle una ⭐ al repo: ayuda a que más desarrolladores lo encuentren.
- Contar cómo lo usas (post, tuit, video) y enlazar a la [documentación](https://components-comentarios.vercel.app/).

## Licencia

MIT — [LICENSE](LICENSE) — Copyright (c) 2026 ingyesid24. Puedes usarlo, modificarlo y distribuirlo libremente.
