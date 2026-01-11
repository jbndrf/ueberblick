// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type PocketBase from 'pocketbase';
import type { RecordAuthResponse, RecordModel } from 'pocketbase';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			pb: PocketBase;
			user: RecordModel | null;
		}
		interface PageData {
			user: RecordModel | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
