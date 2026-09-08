import { defineConfig } from 'vite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function versionServiceWorker() {
  return {
    name: 'version-service-worker',
    closeBundle() {
      const swPath = resolve(process.cwd(), 'dist/sw.js');
      // Vite may call closeBundle before copying the public directory in a
      // container build. Fall back to the source worker so every release still
      // ships /sw.js instead of failing the whole web deployment.
      const sourcePath = existsSync(swPath) ? swPath : resolve(process.cwd(), 'public/sw.js');
      const source = readFileSync(sourcePath, 'utf8');
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
