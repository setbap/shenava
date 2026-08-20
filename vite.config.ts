import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const root = path.dirname(fileURLToPath(import.meta.url))

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

const ORT_FILES = [
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
]

function copyOrtWasm(): Plugin {
  return {
    name: 'copy-ort-wasm',
    async buildStart() {
      const destDir = path.join(root, 'public/ort')
      await mkdir(destDir, { recursive: true })
      for (const file of ORT_FILES) {
        await copyFile(
          path.join(root, 'node_modules/onnxruntime-web/dist', file),
          path.join(destDir, file),
        )
      }
    },
  }
}

export default defineConfig({
  plugins: [
    copyOrtWasm(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192.png',
        'pwa-512.png',
        'og.png',
        'screenshots/desktop.png',
        'screenshots/mobile.png',
      ],
      manifest: {
        name: 'شنوا کوچیک',
        short_name: 'شنوا کوچیک',
        description:
          'یادداشت صوتی فارسی. حرف بزن یا فایل بذار، متنش همون‌جا تو مرورگر نوشته می‌شه. آفلاین هم کار می‌کنه و صدا از دستگاهت بیرون نمی‌ره.',
        lang: 'fa',
        dir: 'rtl',
        categories: ['utilities', 'productivity'],
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        start_url: '/',
        screenshots: [
          {
            src: '/screenshots/desktop.png',
            sizes: '1024x863',
            type: 'image/png',
            form_factor: 'wide',
            label: 'صفحه اصلی روی دسکتاپ',
          },
          {
            src: '/screenshots/mobile.png',
            sizes: '540x1024',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'صفحه اصلی روی موبایل',
          },
        ],
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2,wasm,mjs,json}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        navigateFallback: '/index.html',
        globIgnores: ['**/models/*.onnx', '**/models/*.onnx.data'],
        runtimeCaching: [
          {
            urlPattern: /\/models\/.*\.(?:onnx|json)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'shenava-koochik-v1.0-onnx-fp16',
              expiration: {
                maxEntries: 12,
              },
            },
          },
          {
            urlPattern: /\/ort\/.*\.(?:wasm|mjs)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'shenava-ort-wasm',
              expiration: {
                maxEntries: 12,
              },
            },
          },
          {
            urlPattern: /ort-wasm-simd-threaded.*\.(?:wasm|mjs)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'shenava-ort-wasm',
              expiration: {
                maxEntries: 12,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
    },
  },
  server: {
    headers: isolation,
  },
  preview: {
    headers: isolation,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})
