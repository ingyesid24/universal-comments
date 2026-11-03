import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/adapters/index.ts'),
      name: 'UniversalCommentsAdapters',
      formats: ['es', 'cjs'],
      fileName: (format) =>
        format === 'cjs' ? 'adapters.cjs' : 'adapters.es.js',
    },
    // The main build has already populated dist/; do not erase it.
    emptyOutDir: false,
  },
  publicDir: false,
});
