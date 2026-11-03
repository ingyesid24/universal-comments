import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/universal-comments.ts'),
      name: 'UniversalComments',
      formats: ['es', 'umd'],
      fileName: (format) => `universal-comments.${format === 'umd' ? 'umd.cjs' : 'es.js'}`,
    },
  },
  publicDir: false,
  server: {
    open: true,
  },
});
