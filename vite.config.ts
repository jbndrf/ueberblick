import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
	plugins: [
		basicSsl(),
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			includeAssets: ['icons/*.png', 'icons/*.svg'],
			manifest: {
				name: 'Karte',
				short_name: 'Karte',
				description: 'Geographic data collection with offline-first capabilities',
				start_url: '/participant/map',
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
						purpose: 'any maskable'
					},
					{
						src: '/icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable'
					}
				]
			},
			workbox: {
				// Pre-cache app shell for offline start
				// This includes JS (with fflate bundled), CSS, and HTML
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
				globIgnores: ['**/node_modules/**', '**/sw.js', '**/workbox-*.js'],
				navigateFallback: null,
				navigateFallbackDenylist: [/^\/api\//, /^\/_\//],
				runtimeCaching: [
					// Cache participant pages with NetworkFirst strategy
					{
						urlPattern: /^https:\/\/.*\/participant\/.*/,
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
					// Cache PocketBase API responses for offline access
					{
						urlPattern: /^https?:\/\/.*\/api\/collections\/.*/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 60 * 60 * 24 // 24 hours
							},
							networkTimeoutSeconds: 10
						}
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
				enabled: true,
				type: 'classic',
				navigateFallbackAllowlist: [/^\/$/]
			}
		}),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
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
