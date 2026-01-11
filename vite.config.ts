
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
  // IMPORTANT: This ensures assets are loaded relatively (e.g., "./assets/index.js")
  // instead of from root ("/assets/index.js"), fixing the GitHub Pages 404 issue.
  base: './', 
  build: {
    outDir: 'dist',
  },
});
