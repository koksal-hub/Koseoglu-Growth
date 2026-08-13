import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Dev-only proxy so the frontend can call the API on the same origin
    // (avoids CORS during local development). In production this is the
    // reverse proxy's job.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
