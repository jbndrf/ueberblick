import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
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
