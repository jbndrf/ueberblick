/**
 * Marker action handlers
 * High-level API for creating and managing markers offline-first
 */

import { dispatch, createAction, type CreateMarkerPayload } from '$lib/offline';

/**
 * Create a new marker (offline-first)
 * Returns the marker ID immediately, queues for sync
 */
export async function createMarker(params: {
	categoryId: string;
	latitude: number;
	longitude: number;
	title?: string;
	description?: string;
	properties?: Record<string, unknown>;
}): Promise<string> {
	const payload: CreateMarkerPayload = {
		category_id: params.categoryId,
		latitude: params.latitude,
		longitude: params.longitude,
		title: params.title,
		description: params.description,
		properties: params.properties
	};

	const action = createAction('CREATE_MARKER', payload);
	return await dispatch(action);
}

/**
 * Create a marker at the user's current location
 */
export async function createMarkerAtCurrentLocation(params: {
	categoryId: string;
	title?: string;
	description?: string;
	properties?: Record<string, unknown>;
}): Promise<string> {
	return new Promise((resolve, reject) => {
		if (!navigator.geolocation) {
			reject(new Error('Geolocation is not supported by this browser'));
			return;
		}

		navigator.geolocation.getCurrentPosition(
			async (position) => {
				try {
					const markerId = await createMarker({
						categoryId: params.categoryId,
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
						title: params.title,
						description: params.description,
						properties: params.properties
					});
					resolve(markerId);
				} catch (error) {
					reject(error);
				}
			},
			(error) => {
				reject(new Error(`Geolocation error: ${error.message}`));
			},
			{
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge: 0
			}
		);
	});
}

/**
 * Create a marker with validation
 */
export async function createValidatedMarker(params: {
	categoryId: string;
	latitude: number;
	longitude: number;
	title?: string;
	description?: string;
	properties?: Record<string, unknown>;
}): Promise<string> {
	// Validate coordinates
	if (params.latitude < -90 || params.latitude > 90) {
		throw new Error('Latitude must be between -90 and 90');
	}
	if (params.longitude < -180 || params.longitude > 180) {
		throw new Error('Longitude must be between -180 and 180');
	}

	// Validate category ID
	if (!params.categoryId || params.categoryId.trim() === '') {
		throw new Error('Category ID is required');
	}

	return await createMarker(params);
}
