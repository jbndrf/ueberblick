import Supercluster from 'supercluster';

type IndexType = 'marker' | 'workflowInstance';

const indexes = new Map<IndexType, Supercluster<any, any>>();

/** Map function for marker features: produces visual key by category */
function mapMarkerProps(props: any): { _counts: Record<string, number> } {
	return { _counts: { [`cat:${props.categoryId}`]: 1 } };
}

/** Map function for workflow instance features: produces visual key by filter value > stage > workflow */
function mapWorkflowInstanceProps(props: any): { _counts: Record<string, number> } {
	const key = props.filterValue
		? `fv:${props.filterValue}`
		: props.currentStageId
			? `stage:${props.currentStageId}`
			: `wf:${props.workflowId}`;
	return { _counts: { [key]: 1 } };
}

/** Shared reduce function: merges _counts frequency maps */
function reduceCounts(accumulated: any, mapped: any): void {
	if (!mapped._counts) return;
	if (!accumulated._counts) accumulated._counts = {};
	for (const key of Object.keys(mapped._counts)) {
		accumulated._counts[key] = (accumulated._counts[key] || 0) + mapped._counts[key];
	}
}

export type WorkerRequest =
	| { type: 'load'; requestId: number; indexType: IndexType; features: any[]; radius: number; maxZoom: number }
	| { type: 'getClusters'; requestId: number; indexType: IndexType; bbox: [number, number, number, number]; zoom: number }
	| { type: 'getLeaves'; requestId: number; indexType: IndexType; clusterId: number; limit: number; offset: number }
	| { type: 'getClusterExpansionZoom'; requestId: number; indexType: IndexType; clusterId: number };

export type WorkerResponse =
	| { type: 'loaded'; requestId: number }
	| { type: 'clusters'; requestId: number; data: any[] }
	| { type: 'leaves'; requestId: number; data: any[] }
	| { type: 'expansionZoom'; requestId: number; zoom: number }
	| { type: 'error'; requestId: number; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
	const msg = e.data;
	try {
		switch (msg.type) {
			case 'load': {
				const mapFn = msg.indexType === 'marker' ? mapMarkerProps : mapWorkflowInstanceProps;
				const index = new Supercluster({
					radius: msg.radius,
					maxZoom: msg.maxZoom,
					map: mapFn,
					reduce: reduceCounts
				});
				index.load(msg.features);
				indexes.set(msg.indexType, index);
				(self as any).postMessage({ type: 'loaded', requestId: msg.requestId } satisfies WorkerResponse);
				break;
			}
			case 'getClusters': {
				const index = indexes.get(msg.indexType);
				if (!index) {
					(self as any).postMessage({ type: 'clusters', requestId: msg.requestId, data: [] } satisfies WorkerResponse);
					break;
				}
				const clusters = index.getClusters(msg.bbox, msg.zoom);
				(self as any).postMessage({ type: 'clusters', requestId: msg.requestId, data: clusters } satisfies WorkerResponse);
				break;
			}
			case 'getLeaves': {
				const index = indexes.get(msg.indexType);
				if (!index) {
					(self as any).postMessage({ type: 'leaves', requestId: msg.requestId, data: [] } satisfies WorkerResponse);
					break;
				}
				const leaves = index.getLeaves(msg.clusterId, msg.limit, msg.offset);
				(self as any).postMessage({ type: 'leaves', requestId: msg.requestId, data: leaves } satisfies WorkerResponse);
				break;
			}
			case 'getClusterExpansionZoom': {
				const index = indexes.get(msg.indexType);
				if (!index) {
					(self as any).postMessage({ type: 'expansionZoom', requestId: msg.requestId, zoom: 0 } satisfies WorkerResponse);
					break;
				}
				const zoom = index.getClusterExpansionZoom(msg.clusterId);
				(self as any).postMessage({ type: 'expansionZoom', requestId: msg.requestId, zoom } satisfies WorkerResponse);
				break;
			}
		}
	} catch (err: any) {
		(self as any).postMessage({ type: 'error', requestId: msg.requestId, message: err.message } satisfies WorkerResponse);
	}
};
