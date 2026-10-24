import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/PocketFile/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pocketfile.svg', 'pocketfile-192.png', 'pocketfile-512.png'],
      manifest: {
        name: 'PocketFile — เครื่องมือจัดการไฟล์ส่วนตัว',
        short_name: 'PocketFile',
        description: 'เครื่องมือรูปภาพและ PDF ที่ประมวลผลบนอุปกรณ์ของคุณ',
        lang: 'th',
        theme_color: '#f5f8ff',
        background_color: '#f5f8ff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pocketfile.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'pocketfile-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'pocketfile-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
