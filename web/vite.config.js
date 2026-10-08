import { defineConfig } from 'vite';
export default defineConfig({
  server: {proxy: {'/api/jobs': 'http://127.0.0.1:8001', '/api': 'http://127.0.0.1:8000'}},
  preview: {proxy: {'/api/jobs': 'http://127.0.0.1:8001', '/api': 'http://127.0.0.1:8000'}},
  build: {sourcemap: false},
});
