import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/superpowering-with-files/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
