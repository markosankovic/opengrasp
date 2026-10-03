import { copyFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Production is served from https://markosankovic.github.io/opengrasp/ (SPEC.md §3); the dev server uses the root.
const PAGES_BASE = '/opengrasp/'

/**
 * GitHub Pages has no SPA fallback: a direct visit to /opengrasp/read/<slug> would 404. Pages serves 404.html for
 * unknown paths, so a copy of index.html there boots the app on any route (SPEC.md §4.8).
 */
function githubPagesSpaFallback(): Plugin {
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    closeBundle() {
      copyFileSync('dist/index.html', 'dist/404.html')
    },
  }
}

export default defineConfig(({ command }) => {
  const base = command === 'build' ? PAGES_BASE : '/'
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      githubPagesSpaFallback(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: 'OpenGrasp',
          short_name: 'OpenGrasp',
          description: 'Open-source, local-first PDF reader built for deep technical study.',
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#ffffff',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Precache the app shell and the lazily loaded PDF.js chunks/worker so the app works offline.
          globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,wasm,woff2}'],
          globIgnores: ['404.html'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
    ],
  }
})
