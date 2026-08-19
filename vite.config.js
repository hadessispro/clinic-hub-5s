import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function versionServiceWorker() {
  return {
    name: 'version-service-worker',
    closeBundle() {
      const swPath = resolve(process.cwd(), 'dist/sw.js');
      const source = readFileSync(swPath, 'utf8');
      writeFileSync(swPath, source.replace('__BUILD_VERSION__', `${Date.now()}`));
    },
  };
}

export default defineConfig({
  plugins: [versionServiceWorker()],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
