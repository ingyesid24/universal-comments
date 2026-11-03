// docs/src/site.ts
// Única fuente de URLs del sitio. Si cambias el dominio de Vercel, cámbialo
// también en astro.config.mjs (`site`) y en package.json (`homepage`).
export const SITE_NAME = "universal-comments";
export const SITE_URL = "https://components-comentarios.vercel.app";
export const REPO_URL = "https://github.com/ingyesid24/universal-comments";
export const ISSUES_URL = `${REPO_URL}/issues/new`;
export const NPM_URL = "https://www.npmjs.com/package/universal-comments";
export const SPONSOR_URL = "https://github.com/sponsors/ingyesid24";
// ESM autocontenido (incluye Lit); fijado a la serie 0.1 para evitar roturas en 0.x.
export const CDN_URL = "https://cdn.jsdelivr.net/npm/universal-comments@0.1/dist/universal-comments.es.js";
