import Supercluster from 'supercluster';
import type { BBox, Feature, Point } from 'geojson';

export interface MarkerProperties {
	type: 'marker';
	id: string;
	categoryId: string;
}

export interface WorkflowInstanceProperties {
	type: 'workflowInstance';
	id: string;
	workflowId: string;
	currentStageId?: string;
	filterValue?: string;
}

export type ClusterProperties = MarkerProperties | WorkflowInstanceProperties;

export type ClusterFeature = Supercluster.ClusterFeature<Supercluster.AnyProps>;
export type PointFeature<P extends ClusterProperties> = Supercluster.PointFeature<P>;
export type SuperclusterResult<P extends ClusterProperties> = ClusterFeature | PointFeature<P>;

/** Data carried by cluster detail events */
export interface ClusterDetail {
	center: [number, number];
	totalCount: number;
	counts: Record<string, number>;
	clusterType: 'marker' | 'workflowInstance';
}

/** Shared reduce function: merges _counts frequency maps */
export function reduceCounts(accumulated: any, mapped: any): void {
	if (!mapped._counts) return;
	if (!accumulated._counts) accumulated._counts = {};
	for (const key of Object.keys(mapped._counts)) {
		accumulated._counts[key] = (accumulated._counts[key] || 0) + mapped._counts[key];
	}
}

/** Map function for marker features: produces visual key by category */
export function mapMarkerProps(props: MarkerProperties): { _counts: Record<string, number> } {
	return { _counts: { [`cat:${props.categoryId}`]: 1 } };
}

/** Map function for workflow instance features: produces visual key by filter value > stage > workflow */
export function mapWorkflowInstanceProps(props: WorkflowInstanceProperties): { _counts: Record<string, number> } {
	const key = props.filterValue
		? `fv:${props.filterValue}`
		: props.currentStageId
			? `stage:${props.currentStageId}`
			: `wf:${props.workflowId}`;
	return { _counts: { [key]: 1 } };
}

/**
 * Creates a Supercluster index from an array of items with locations.
 * Returns the index instance ready for getClusters() queries.
 */
export function buildIndex<P extends ClusterProperties>(
	features: Supercluster.PointFeature<P>[],
	options?: {
		radius?: number;
		maxZoom?: number;
		map?: (props: P) => any;
		reduce?: (accumulated: any, mapped: any) => void;
	}
): Supercluster<P, Supercluster.AnyProps> {
	const index = new Supercluster<P, Supercluster.AnyProps>({
		radius: options?.radius ?? 80,
		maxZoom: options?.maxZoom ?? 22,
		...(options?.map && { map: options.map }),
		...(options?.reduce && { reduce: options.reduce })
	});
	index.load(features);
	return index;
}

/**
 * Convert marker data to GeoJSON features for Supercluster.
 * Coordinates are [lng, lat] per GeoJSON convention.
 */
export function markersToFeatures(
	markers: Array<{
		id: string;
		category_id: string;
		location?: { lat: number; lon: number };
	}>
): Supercluster.PointFeature<MarkerProperties>[] {
	const features: Supercluster.PointFeature<MarkerProperties>[] = [];
	for (const m of markers) {
		if (!m.location?.lat || !m.location?.lon) continue;
		features.push({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [m.location.lon, m.location.lat]
			},
			properties: {
				type: 'marker',
				id: m.id,
				categoryId: m.category_id
			}
		});
	}
	return features;
}

/**
 * Convert workflow instance data to GeoJSON features for Supercluster.
 */
export function workflowInstancesToFeatures(
	instances: Array<{
		id: string;
		workflow_id: string;
		current_stage_id?: string;
		location?: { lat: number; lon: number };
	}>,
	filterableValues: Map<string, string>
): Supercluster.PointFeature<WorkflowInstanceProperties>[] {
	const features: Supercluster.PointFeature<WorkflowInstanceProperties>[] = [];
	for (const i of instances) {
		if (!i.location?.lat || !i.location?.lon) continue;
		features.push({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [i.location.lon, i.location.lat]
			},
			properties: {
				type: 'workflowInstance',
				id: i.id,
				workflowId: i.workflow_id,
				currentStageId: i.current_stage_id,
				filterValue: filterableValues.get(i.id)
			}
		});
	}
	return features;
}

/**
 * Get the bounding box from a Leaflet map in GeoJSON BBox format [west, south, east, north].
 */
export function getMapBBox(map: { getBounds: () => { getWest: () => number; getSouth: () => number; getEast: () => number; getNorth: () => number } }): BBox {
	const b = map.getBounds();
	return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

/**
 * Check if a feature returned by getClusters is a cluster (vs individual point).
 */
export function isCluster(feature: ClusterFeature | Supercluster.PointFeature<any>): feature is ClusterFeature {
	return feature.properties.cluster === true;
}

/**
 * Get a unique key for a feature (cluster or point) for diffing rendered markers.
 */
export function getFeatureKey(feature: ClusterFeature | Supercluster.PointFeature<any>): string {
	if (isCluster(feature)) {
		return `cluster_${feature.properties.cluster_id}`;
	}
	return `point_${feature.properties.id}`;
}
