import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    open: true,
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,   // expose preview on local network too
    open: true,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,   // don't inline images
    minify: 'esbuild',
  },
});
