// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type PocketBase from 'pocketbase';
import type { RecordAuthResponse, RecordModel } from 'pocketbase';

// PWA virtual module types
declare module 'virtual:pwa-register' {
	export interface RegisterSWOptions {
		onNeedRefresh?: () => void;
		onOfflineReady?: () => void;
		onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
		onRegisterError?: (error: Error) => void;
	}

	export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			pb: PocketBase;
			user: RecordModel | null;
		}
		interface PageData {
			user?: RecordModel | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
