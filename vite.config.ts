import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
        '/api': {
          target: 'https://uo3kq9at2j.execute-api.us-east-1.amazonaws.com/dev',
          changeOrigin: true,
          secure: true,
          timeout: 120000,
          proxyTimeout: 120000,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
