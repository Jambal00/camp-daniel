import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A short build id (the git commit on GitHub, otherwise a timestamp) so the app
// can tell which version it is and notice when a newer one has been deployed.
const build = (process.env.GITHUB_SHA ?? '').slice(0, 7) || new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

export default defineConfig({
  // Relative base so the built app works on any static host (GitHub Pages, Cloudflare Pages, Netlify).
  base: './',
  define: {
    __BUILD__: JSON.stringify(build),
  },
  plugins: [
    react(),
    {
      // Publishes version.json next to the app; the running app polls it to offer updates.
      name: 'camp-daniel-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) });
      },
    },
  ],
});
