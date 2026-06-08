import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Set DEV_HTTP=true to run the dev server over plain HTTP (no self-signed cert).
// Useful for desktop GIS clients (QGIS/GDAL) that reject the basic-ssl cert.
// Leave unset for the normal HTTPS dev flow (PWA/service worker need a secure context).
const DEV_HTTP = process.env.DEV_HTTP === 'true';

export default defineConfig({
	plugins: [
		...(DEV_HTTP ? [] : [basicSsl()]),
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			injectRegister: false,
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			includeAssets: ['icons/*.png'],
			manifest: {
				name: 'Überblick',
				short_name: 'Überblick',
				description: 'Geographic data collection with offline-first capabilities',
				start_url: '/map',
				scope: '/',
				display: 'standalone',
				background_color: '#ffffff',
				theme_color: '#000000',
				orientation: 'portrait-primary',
				icons: [
					{
						src: '/icons/icon-192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/icon-192-maskable.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable'
					},
					{
						src: '/icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/icon-512-maskable.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				// Ensure autoUpdate works correctly with injectRegister: false
				clientsClaim: true,
				skipWaiting: true,
				// Pre-cache app shell for offline start
				// This includes JS (with fflate bundled), CSS, and HTML
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
				globIgnores: ['**/node_modules/**', '**/sw.js', '**/workbox-*.js', '**/tiles/**'],
				// No navigateFallback -- it creates a NavigationRoute that hijacks
				// ALL navigations before the runtime cache can serve cached pages,
				// causing a redirect loop with offline.html. Instead, let the
				// NetworkFirst runtime cache below handle navigations directly.
				navigateFallback: null,
				runtimeCaching: [
					// Cache participant pages with NetworkFirst strategy.
					// Participant routes live at root: /, /map, /login, /logout.
					// Admin routes (/admin/*) and APIs (/api/*) are excluded.
					{
						urlPattern: /^https?:\/\/[^/]+\/(map|login|logout)(\/.*)?$/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'pages-cache',
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
							},
							networkTimeoutSeconds: 10
						}
					},
					// PocketBase data reads (/api/collections/*) are deliberately
					// NOT cached by the service worker. IndexedDB (src/lib/
					// participant-state/) is the offline data store and owns
					// freshness. A NetworkFirst cache here would hand back a stale
					// 200 indistinguishable from a live response, so the app would
					// show old data while believing it just fetched fresh data.
					// NetworkOnly: a successful read means the server was reached.
					{
						urlPattern: /^https?:\/\/.*\/api\/collections\/.*/,
						handler: 'NetworkOnly'
					},
					// Cache package archive files (ZIP) with CacheFirst
					{
						urlPattern: /^https?:\/\/.*\/api\/files\/.*\.zip$/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'package-files-cache',
							expiration: {
								maxEntries: 10,
								maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
							}
						}
					}
				]
			},
			devOptions: {
				enabled: false
			}
		}),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['cookie', 'preferredLanguage', 'globalVariable', 'baseLocale']
		})
	],
	server: {
		proxy: {
			// Proxy PocketBase API routes to local PocketBase instance during development
			// This allows the frontend to use window.location.origin
			// while still connecting to PocketBase running on port 8090
			'/api/collections': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			},
			'/api/files': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			},
			'/api/admins': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			},
			'/api/realtime': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			},
			'/api/health': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			},
			'/api/batch': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			},
			'/api/custom': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			},
			'/_': {
				target: 'http://127.0.0.1:8090',
				changeOrigin: true
			}
		}
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					environment: 'browser',
					browser: {
						enabled: true,
						provider: 'playwright',
						instances: [{ browser: 'chromium' }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
