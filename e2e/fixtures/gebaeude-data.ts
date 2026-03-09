export { ADMIN_CREDENTIALS } from './test-data';

// --- Project ---
export const GEBAEUDE_PROJECT = {
	name: 'Gebaeudemanagement Zustandsindex',
	description: 'Multi-Building Zustandsindex nach DIN 31051 -- 3 Gebaeude auf einer Karte'
};

// --- Roles ---
export const GEBAEUDE_ROLES = [
	{ name: 'Inspekteur', description: 'Fuehrt Zustandsbewertungen durch' },
	{ name: 'Facility Manager', description: 'Ueberblick ueber alle Gebaeude' }
];

// --- Participants ---
export const GEBAEUDE_PARTICIPANTS = [
	{ name: 'Georg Inspektor', email: 'georg@gebaeude.test', roles: ['Inspekteur'] },
	{ name: 'Lisa Verwaltung', email: 'lisa@gebaeude.test', roles: ['Facility Manager'] },
	{ name: 'Martin Technik', email: 'martin@gebaeude.test', roles: ['Inspekteur', 'Facility Manager'] }
];

// --- Workflow definitions (3 buildings) ---
export const GEBAEUDE_WORKFLOWS = [
	{ name: 'Rathaus', description: 'Zustandsbewertung Rathaus', marker_color: '#3b82f6' },
	{ name: 'Schule', description: 'Zustandsbewertung Schule', marker_color: '#22c55e' },
	{ name: 'Sporthalle', description: 'Zustandsbewertung Sporthalle', marker_color: '#f97316' }
];

// --- Stages (identical per workflow, DIN 31051 Zustandsklassen) ---
export const GEBAEUDE_STAGES = [
	{ name: 'A Einwandfrei', type: 'start' as const, x: 100, y: 200 },
	{ name: 'B Gut', type: 'intermediate' as const, x: 300, y: 200 },
	{ name: 'C Mangelhaft', type: 'intermediate' as const, x: 500, y: 200 },
	{ name: 'D Ersatz erforderlich', type: 'intermediate' as const, x: 700, y: 200 }
];

export const GEBAEUDE_CONNECTIONS = [
	{ from: null as string | null, to: 'A Einwandfrei', action: 'entry' },
	{ from: 'A Einwandfrei', to: 'B Gut', action: 'Herabstufen auf B' },
	{ from: 'B Gut', to: 'C Mangelhaft', action: 'Herabstufen auf C' },
	{ from: 'C Mangelhaft', to: 'D Ersatz erforderlich', action: 'Herabstufen auf D' },
	{ from: 'D Ersatz erforderlich', to: 'C Mangelhaft', action: 'Heraufstufen auf C' },
	{ from: 'C Mangelhaft', to: 'B Gut', action: 'Heraufstufen auf B' },
	{ from: 'B Gut', to: 'A Einwandfrei', action: 'Heraufstufen auf A' }
];

// --- Nutzungsart (FM room categories) ---
export const NUTZUNGSART_OPTIONS = [
	{ label: 'Buero' },
	{ label: 'Technikraum' },
	{ label: 'Sanitaer' },
	{ label: 'Versammlungsraum' },
	{ label: 'Lager' }
];

// --- Zustandsklasse ---
export const ZUSTANDSKLASSE_OPTIONS = [
	{ label: 'A' },
	{ label: 'B' },
	{ label: 'C' },
	{ label: 'D' }
];

// --- Coordinates per building ---
export const RATHAUS_COORDINATES: Array<{ lat: number; lon: number }> = [
	{ lat: 48.1370, lon: 11.5755 },
	{ lat: 48.1372, lon: 11.5758 },
	{ lat: 48.1368, lon: 11.5752 },
	{ lat: 48.1374, lon: 11.5760 },
	{ lat: 48.1366, lon: 11.5756 },
	{ lat: 48.1370, lon: 11.5762 }
];

export const SCHULE_COORDINATES: Array<{ lat: number; lon: number }> = [
	{ lat: 48.1390, lon: 11.5780 },
	{ lat: 48.1392, lon: 11.5783 },
	{ lat: 48.1388, lon: 11.5777 },
	{ lat: 48.1394, lon: 11.5785 },
	{ lat: 48.1386, lon: 11.5781 },
	{ lat: 48.1390, lon: 11.5787 }
];

export const SPORTHALLE_COORDINATES: Array<{ lat: number; lon: number }> = [
	{ lat: 48.1350, lon: 11.5730 },
	{ lat: 48.1352, lon: 11.5733 },
	{ lat: 48.1348, lon: 11.5727 },
	{ lat: 48.1354, lon: 11.5735 },
	{ lat: 48.1346, lon: 11.5731 },
	{ lat: 48.1350, lon: 11.5737 }
];

export const BUILDING_COORDINATES = [RATHAUS_COORDINATES, SCHULE_COORDINATES, SPORTHALLE_COORDINATES];

// --- Sample rooms per building ---
export interface GebaeudeRoom {
	coordIndex: number;
	raumnummer: string;
	nutzungsart: string;
	baukonstruktion: number; // 1-4
	tga: number;            // 1-4
	raumausstattung: number; // 1-4
}

// Rathaus: mostly good condition, one problematic bathroom
export const RATHAUS_ROOMS: GebaeudeRoom[] = [
	{ coordIndex: 0, raumnummer: 'R.001', nutzungsart: 'Buero', baukonstruktion: 1, tga: 1, raumausstattung: 2 },
	{ coordIndex: 1, raumnummer: 'R.002', nutzungsart: 'Versammlungsraum', baukonstruktion: 1, tga: 2, raumausstattung: 1 },
	{ coordIndex: 2, raumnummer: 'R.003', nutzungsart: 'Sanitaer', baukonstruktion: 2, tga: 3, raumausstattung: 2 },
	{ coordIndex: 3, raumnummer: 'R.101', nutzungsart: 'Buero', baukonstruktion: 1, tga: 1, raumausstattung: 1 },
	{ coordIndex: 4, raumnummer: 'R.102', nutzungsart: 'Technikraum', baukonstruktion: 2, tga: 2, raumausstattung: 3 },
	{ coordIndex: 5, raumnummer: 'R.K01', nutzungsart: 'Lager', baukonstruktion: 3, tga: 3, raumausstattung: 3 }
];

// Schule: mixed condition, aging TGA
export const SCHULE_ROOMS: GebaeudeRoom[] = [
	{ coordIndex: 0, raumnummer: 'S.001', nutzungsart: 'Versammlungsraum', baukonstruktion: 2, tga: 3, raumausstattung: 2 },
	{ coordIndex: 1, raumnummer: 'S.002', nutzungsart: 'Buero', baukonstruktion: 2, tga: 2, raumausstattung: 2 },
	{ coordIndex: 2, raumnummer: 'S.003', nutzungsart: 'Sanitaer', baukonstruktion: 2, tga: 4, raumausstattung: 3 },
	{ coordIndex: 3, raumnummer: 'S.101', nutzungsart: 'Versammlungsraum', baukonstruktion: 3, tga: 3, raumausstattung: 3 },
	{ coordIndex: 4, raumnummer: 'S.102', nutzungsart: 'Technikraum', baukonstruktion: 2, tga: 4, raumausstattung: 2 },
	{ coordIndex: 5, raumnummer: 'S.K01', nutzungsart: 'Lager', baukonstruktion: 4, tga: 4, raumausstattung: 4 }
];

// Sporthalle: generally poor, needs investment
export const SPORTHALLE_ROOMS: GebaeudeRoom[] = [
	{ coordIndex: 0, raumnummer: 'H.001', nutzungsart: 'Versammlungsraum', baukonstruktion: 3, tga: 3, raumausstattung: 3 },
	{ coordIndex: 1, raumnummer: 'H.002', nutzungsart: 'Sanitaer', baukonstruktion: 3, tga: 4, raumausstattung: 3 },
	{ coordIndex: 2, raumnummer: 'H.003', nutzungsart: 'Technikraum', baukonstruktion: 4, tga: 4, raumausstattung: 3 },
	{ coordIndex: 3, raumnummer: 'H.004', nutzungsart: 'Lager', baukonstruktion: 3, tga: 3, raumausstattung: 4 },
	{ coordIndex: 4, raumnummer: 'H.005', nutzungsart: 'Buero', baukonstruktion: 2, tga: 2, raumausstattung: 2 },
	{ coordIndex: 5, raumnummer: 'H.006', nutzungsart: 'Sanitaer', baukonstruktion: 2, tga: 3, raumausstattung: 2 }
];

export const BUILDING_ROOMS = [RATHAUS_ROOMS, SCHULE_ROOMS, SPORTHALLE_ROOMS];
