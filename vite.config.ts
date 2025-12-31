import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const isMiddleware = process.env.VITE_MIDDLEWARE === 'true';

export default defineConfig({
  root: 'src/ui',
  appType: isMiddleware ? 'custom' : 'spa',
  plugins: [tailwindcss(), react()],
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    ...(isMiddleware ? { middlewareMode: true } : {}),
  },
});
