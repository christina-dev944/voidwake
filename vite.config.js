import { defineConfig } from 'vite';

// Project Pages site is served at https://christina-dev944.github.io/voidwake/
// so assets must resolve under the /voidwake/ base.
export default defineConfig({
  base: '/voidwake/',
  build: { outDir: 'dist', target: 'es2020' },
});
