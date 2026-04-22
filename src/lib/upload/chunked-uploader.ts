export type UploadProgress = {
	phase: 'uploading' | 'processing';
	loaded?: number;
	total?: number;
	percent: number;
	label?: string;
};

export type ChunkedUploadOpts = {
	file: File;
	initUrl: string;
	initBody: Record<string, unknown>;
	chunkUrl: (id: string, index: number) => string;
	chunksUrl: (id: string) => string;
	finalizeUrl: (id: string) => string;
	idField?: string;
	onProgress?: (p: UploadProgress) => void;
	chunkSizeFallback?: number;
};

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;

async function putChunk(url: string, buf: ArrayBuffer): Promise<void> {
	let lastErr: unknown = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/octet-stream' },
				body: buf
			});
			if (res.ok) return;
			lastErr = new Error(`HTTP ${res.status}`);
		} catch (e) {
			lastErr = e;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw lastErr ?? new Error('Chunk upload failed');
}

export async function chunkedUpload(opts: ChunkedUploadOpts): Promise<{ id: string }> {
	const {
		file,
		initUrl,
		initBody,
		chunkUrl,
		chunksUrl,
		finalizeUrl,
		idField = 'id',
		onProgress,
		chunkSizeFallback = DEFAULT_CHUNK_SIZE
	} = opts;

	const totalSize = file.size;
	const fallbackChunks = Math.max(1, Math.ceil(totalSize / chunkSizeFallback));

	onProgress?.({ phase: 'uploading', loaded: 0, total: totalSize, percent: 0 });

	const initRes = await fetch(initUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			...initBody,
			total_size: totalSize,
			total_chunks: fallbackChunks
		})
	});
	if (!initRes.ok) {
		throw new Error(`Upload init failed: HTTP ${initRes.status}`);
	}
	const initJson = (await initRes.json()) as Record<string, unknown>;
	const id = initJson[idField] as string;
	if (!id) throw new Error(`Init response missing "${idField}"`);
	const chunkSize = (initJson.chunk_size as number) || chunkSizeFallback;
	const totalChunks = Math.max(1, Math.ceil(totalSize / chunkSize));

	const statusRes = await fetch(chunksUrl(id));
	const chunksInfo = (await statusRes.json().catch(() => ({ received: [] }))) as {
		received?: number[];
	};
	const received = new Set<number>(chunksInfo.received ?? []);

	const chunkLen = (i: number) => Math.min(chunkSize, totalSize - i * chunkSize);
	let loaded = 0;
	for (const i of received) loaded += chunkLen(i);
	onProgress?.({
		phase: 'uploading',
		loaded,
		total: totalSize,
		percent: totalSize ? Math.round((loaded / totalSize) * 100) : 0
	});

	for (let i = 0; i < totalChunks; i++) {
		if (received.has(i)) continue;
		const start = i * chunkSize;
		const end = Math.min(start + chunkSize, totalSize);
		const buf = await file.slice(start, end).arrayBuffer();
		await putChunk(chunkUrl(id, i), buf);
		loaded += chunkLen(i);
		onProgress?.({
			phase: 'uploading',
			loaded,
			total: totalSize,
			percent: totalSize ? Math.round((loaded / totalSize) * 100) : 0
		});
	}

	for (let pass = 0; pass < 3; pass++) {
		const finRes = await fetch(finalizeUrl(id), { method: 'POST' });
		const finJson = (await finRes.json().catch(() => ({}))) as { ok?: boolean; missing?: number[] };
		if (finRes.ok && finJson.ok) {
			return { id };
		}
		if (Array.isArray(finJson.missing) && finJson.missing.length > 0 && pass < 2) {
			for (const idx of finJson.missing) {
				const start = idx * chunkSize;
				const end = Math.min(start + chunkSize, totalSize);
				const buf = await file.slice(start, end).arrayBuffer();
				await putChunk(chunkUrl(id, idx), buf);
			}
			continue;
		}
		throw new Error('Finalize failed');
	}
	throw new Error('Finalize failed after retries');
}
