import type { WorkerResponse } from './cluster-worker';

type IndexType = 'marker' | 'workflowInstance';

export class ClusterClient {
	private worker: Worker;
	private nextId = 0;
	private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
	private latestClustersId: Record<string, number> = {};

	constructor() {
		this.worker = new Worker(
			new URL('./cluster-worker.ts', import.meta.url),
			{ type: 'module' }
		);
		this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;
			const entry = this.pending.get(msg.requestId);
			if (!entry) return;
			this.pending.delete(msg.requestId);
			if (msg.type === 'error') {
				entry.reject(new Error(msg.message));
			} else {
				entry.resolve(msg);
			}
		};
	}

	private send(msg: Record<string, unknown>): Promise<WorkerResponse> {
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.worker.postMessage({ ...msg, requestId: id });
		});
	}

	async load(
		indexType: IndexType,
		features: any[],
		radius: number,
		maxZoom: number
	): Promise<void> {
		await this.send({ type: 'load', indexType, features, radius, maxZoom });
	}

	/**
	 * Get clusters for the given viewport. Returns null if a newer request
	 * for the same indexType has been sent (staleness protection).
	 */
	async getClusters(
		indexType: IndexType,
		bbox: [number, number, number, number],
		zoom: number
	): Promise<any[] | null> {
		const id = ++this.nextId;
		this.latestClustersId[indexType] = id;
		const result = await new Promise<WorkerResponse>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.worker.postMessage({
				type: 'getClusters',
				requestId: id,
				indexType,
				bbox,
				zoom
			});
		});
		if (id !== this.latestClustersId[indexType]) return null;
		return (result as any).data;
	}

	async getLeaves(
		indexType: IndexType,
		clusterId: number,
		limit = Infinity,
		offset = 0
	): Promise<any[]> {
		// Infinity can't be serialized to JSON -- use a large number instead
		const safeLimit = Number.isFinite(limit) ? limit : 1_000_000;
		const resp = await this.send({
			type: 'getLeaves',
			indexType,
			clusterId,
			limit: safeLimit,
			offset
		});
		return (resp as any).data;
	}

	async getClusterExpansionZoom(
		indexType: IndexType,
		clusterId: number
	): Promise<number> {
		const resp = await this.send({
			type: 'getClusterExpansionZoom',
			indexType,
			clusterId
		});
		return (resp as any).zoom;
	}

	destroy(): void {
		this.worker.terminate();
		for (const [, entry] of this.pending) {
			entry.reject(new Error('Worker terminated'));
		}
		this.pending.clear();
	}
}
