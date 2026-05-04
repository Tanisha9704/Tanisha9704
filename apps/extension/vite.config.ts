import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' assert { type: 'json' };
import path from 'node:path';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@uno/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
  },
});
