import type Supercluster from 'supercluster';
import type { BBox } from 'geojson';

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

/** A single leaf point extracted from a cluster */
export interface ClusterLeaf {
	id: string;
	workflowId: string;
	currentStageId?: string;
	filterValue?: string;
	coordinates: [number, number]; // [lng, lat]
}

/** Enhanced cluster detail with leaf data for grouped breakdown */
export interface EnhancedClusterDetail extends ClusterDetail {
	clusterId: number;
	leaves: ClusterLeaf[];
}

/** Per-workflow breakdown within a cluster */
export interface WorkflowClusterGroup {
	workflowId: string;
	workflowName: string;
	filterMode: 'stage' | 'field';
	totalCount: number;
	rows: WorkflowClusterRow[];
}

/** A single row within a workflow group */
export interface WorkflowClusterRow {
	key: string;
	prefixedKey: string;
	label: string;
	color: string;
	count: number;
	percentage: number;
	leafIds: string[];
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
