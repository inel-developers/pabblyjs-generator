import { defineConfig } from 'vite';

// base: './' genera rutas relativas, válidas tanto en local como en
// https://usuario.github.io/nombre-del-repositorio/
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  },
  preview: {
    port: 4173
  }
});
