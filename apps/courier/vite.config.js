import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mode build:
//   default          → build web untuk server demo (base /courier/, PWA)
//   SA7TEIN_MOBILE=1  → build Capacitor/native (base '/', dist-mobile, tanpa SW)
//   SA7TEIN_VERCEL=1  → build deploy Vercel (base '/', dist, PWA di root)
const isMobile = process.env.SA7TEIN_MOBILE === '1';
const isVercel = process.env.SA7TEIN_VERCEL === '1';
const base = isMobile || isVercel ? '/' : '/courier/';

const plugins = [react()];
if (!isMobile) {
  plugins.push(
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Sa7tein — Courier',
        short_name: 'Sa7tein',
        description: 'Pick up and deliver orders with live tracking',
        lang: 'en',
        theme_color: '#e04020',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  );
}

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      '@sa7tein/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  base,
  build: {
    outDir: isMobile ? 'dist-mobile' : 'dist',
  },
  envDir: path.resolve(__dirname, '../..'),
  server: {
    port: 5175,
    host: true,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
});
