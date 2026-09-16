// Vite build/dev-server configuration for the frontend. Enables the React
// plugin (JSX + fast refresh) and, for local development, proxies /api
// requests to the backend so the frontend can call relative API paths
// without hitting CORS during development.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // proxy /api requests to backend during dev
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
