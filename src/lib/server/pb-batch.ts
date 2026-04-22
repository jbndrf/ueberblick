import type PocketBase from 'pocketbase';

export interface Batcher {
	add(collection: string, data: Record<string, unknown> | FormData, bytesHint?: number): Promise<void>;
	flush(): Promise<void>;
	readonly flushedCount: number;
}

export function createBatcher(
	pb: PocketBase,
	opts: {
		flushAtCount?: number;
		flushAtBytes?: number;
		onFlush?: (count: number, total: number) => void | Promise<void>;
	} = {}
): Batcher {
	const flushAtCount = opts.flushAtCount ?? 50;
	const flushAtBytes = opts.flushAtBytes ?? 25 * 1024 * 1024;

	let current = pb.createBatch();
	let pending = 0;
	let pendingBytes = 0;
	let flushed = 0;

	const flush = async () => {
		if (pending === 0) return;
		const count = pending;
		await current.send();
		flushed += count;
		current = pb.createBatch();
		pending = 0;
		pendingBytes = 0;
		if (opts.onFlush) await opts.onFlush(count, flushed);
	};

	return {
		async add(collection, data, bytesHint) {
			current.collection(collection).create(data as never);
			pending++;
			pendingBytes += bytesHint ?? estimateBytes(data);
			if (pending >= flushAtCount || pendingBytes >= flushAtBytes) {
				await flush();
			}
		},
		flush,
		get flushedCount() {
			return flushed;
		}
	};
}

function estimateBytes(data: Record<string, unknown> | FormData): number {
	if (data instanceof FormData) {
		let total = 0;
		for (const [, value] of data.entries()) {
			if (value instanceof File) total += value.size;
			else total += String(value).length;
		}
		return total;
	}
	try {
		return JSON.stringify(data).length;
	} catch {
		return 1024;
	}
}
