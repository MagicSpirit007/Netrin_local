import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { normalizeBasePath } from './src/lib/basePath.ts'

// netrin-cell — Vite + React, PWA-primary (platform.primarySurface = "mobile-web").
// This vite.config.ts stands in for app.json per Cell Contract Rule 3 (non-Expo cell).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appBase = normalizeBasePath(env.NETRIN_BASE_PATH)

  return {
    base: appBase,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,txt,pmtiles,woff2}'],
          maximumFileSizeToCacheInBytes: 80 * 1024 * 1024,
          navigateFallback: 'index.html'
        },
        manifest: {
          name: 'Netrin',
          short_name: 'Netrin',
          description: '校园生态观察路线导览',
          display: 'standalone',
          orientation: 'portrait',
          start_url: appBase,
          scope: appBase,
          background_color: '#0b0c0e',
          theme_color: '#0b0c0e'
        }
      })
    ]
  }
})
