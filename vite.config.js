import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Backend API — Routes, Geocoding (server-side Google key)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // SerpAPI proxy for Google Flights (CORS bypass)
      '/serpapi': {
        target: 'https://serpapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/serpapi/, '/search.json'),
        headers: {
          'Accept': 'application/json',
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
