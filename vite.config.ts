import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built app works on any static host (GitHub Pages, Cloudflare Pages, Netlify).
export default defineConfig({
  base: './',
  plugins: [react()],
});
