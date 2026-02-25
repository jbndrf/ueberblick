// Re-export admin credentials from existing test-data
export { ADMIN_CREDENTIALS } from './test-data';

// --- Project ---
export const REINIGUNG_PROJECT = {
	name: 'Reinigung Demo',
	description: 'Cleaning demo with Tagesplan and Rhythmus workflows'
};

// --- Roles ---
export const REINIGUNG_ROLES = [
	{ name: 'Reinigungskraft', description: 'Fuehrt die Reinigung durch' }
];

// --- Participants ---
export const REINIGUNG_PARTICIPANTS = [
	{ name: 'Max Mustermann', email: 'max@reinigung.test', roles: ['Reinigungskraft'] },
	{ name: 'Erika Musterfrau', email: 'erika@reinigung.test', roles: ['Reinigungskraft'] }
];

// --- Stage icon SVG (shared circle, colored per stage) ---
const CIRCLE_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';

function stageIconConfig(color: string) {
	return {
		icon_config: {
			type: 'svg',
			svgContent: CIRCLE_SVG,
			style: {
				size: 24,
				color,
				borderWidth: 2,
				borderColor: '#ffffff',
				backgroundColor: 'transparent',
				shadow: false,
				shape: 'none'
			}
		}
	};
}

// --- Stages (shared by all workflows) ---
export const REINIGUNG_STAGES = [
	{ name: 'Offen', type: 'start' as const, x: 150, y: 200, visual_config: stageIconConfig('#ef4444') },
	{ name: 'Erledigt', type: 'intermediate' as const, x: 450, y: 200, visual_config: stageIconConfig('#22c55e') }
];

// --- Connections (shared shape, NO forms on any) ---
export const REINIGUNG_CONNECTIONS = [
	{ from: null as string | null, to: 'Offen', action: 'entry' },
	{ from: 'Offen', to: 'Erledigt', action: 'Erledigt markieren' },
	{ from: 'Erledigt', to: 'Offen', action: 'Zuruecksetzen' }
];

// --- Room grid coordinates (9 rooms per floor, 3x3 grid) ---
// Shared by both Demo A and Demo B
export const ROOM_COORDINATES: Array<{ lat: number; lon: number }> = [
	{ lat: 48.13710, lon: 11.57530 },
	{ lat: 48.13710, lon: 11.57560 },
	{ lat: 48.13710, lon: 11.57590 },
	{ lat: 48.13690, lon: 11.57530 },
	{ lat: 48.13690, lon: 11.57560 },
	{ lat: 48.13690, lon: 11.57590 },
	{ lat: 48.13670, lon: 11.57530 },
	{ lat: 48.13670, lon: 11.57560 },
	{ lat: 48.13670, lon: 11.57590 }
];

// --- Demo A: Tagesplan rooms ---
export interface TagesplanRoom {
	name: string;
	floor: 'EG' | '1.OG';
	coordIndex: number;
	reinigungstag: string; // JSON array string: '["Mo","Mi","Fr"]'
}

export const TAGESPLAN_ROOMS_EG: TagesplanRoom[] = [
	{ name: 'Raum 0.01', floor: 'EG', coordIndex: 0, reinigungstag: '["Mo","Mi","Fr"]' },
	{ name: 'Raum 0.02', floor: 'EG', coordIndex: 1, reinigungstag: '["Mo","Di","Do"]' },
	{ name: 'Raum 0.03', floor: 'EG', coordIndex: 2, reinigungstag: '["Di","Do"]' },
	{ name: 'Raum 0.04', floor: 'EG', coordIndex: 3, reinigungstag: '["Mo","Mi","Fr"]' },
	{ name: 'Raum 0.05', floor: 'EG', coordIndex: 4, reinigungstag: '["Mo","Di","Mi","Do","Fr"]' },
	{ name: 'Raum 0.06', floor: 'EG', coordIndex: 5, reinigungstag: '["Mi","Fr"]' },
	{ name: 'Raum 0.07', floor: 'EG', coordIndex: 6, reinigungstag: '["Mo","Do"]' },
	{ name: 'Raum 0.08', floor: 'EG', coordIndex: 7, reinigungstag: '["Di","Mi","Fr"]' },
	{ name: 'Raum 0.09', floor: 'EG', coordIndex: 8, reinigungstag: '["Mo","Mi"]' }
];

export const TAGESPLAN_ROOMS_OG: TagesplanRoom[] = [
	{ name: 'Raum 1.01', floor: '1.OG', coordIndex: 0, reinigungstag: '["Di","Do"]' },
	{ name: 'Raum 1.02', floor: '1.OG', coordIndex: 1, reinigungstag: '["Mo","Mi","Fr"]' },
	{ name: 'Raum 1.03', floor: '1.OG', coordIndex: 2, reinigungstag: '["Mo","Di","Mi","Do","Fr"]' },
	{ name: 'Raum 1.04', floor: '1.OG', coordIndex: 3, reinigungstag: '["Mi","Fr"]' },
	{ name: 'Raum 1.05', floor: '1.OG', coordIndex: 4, reinigungstag: '["Mo","Do"]' },
	{ name: 'Raum 1.06', floor: '1.OG', coordIndex: 5, reinigungstag: '["Mo","Di","Do"]' },
	{ name: 'Raum 1.07', floor: '1.OG', coordIndex: 6, reinigungstag: '["Di","Mi","Fr"]' },
	{ name: 'Raum 1.08', floor: '1.OG', coordIndex: 7, reinigungstag: '["Mo","Mi"]' },
	{ name: 'Raum 1.09', floor: '1.OG', coordIndex: 8, reinigungstag: '["Mo","Di","Mi","Do","Fr"]' }
];

// --- Demo B: Rhythmus rooms ---
export interface RhythmusRoom {
	name: string;
	floor: 'EG' | '1.OG';
	coordIndex: number;
	reinigungsintervall: string; // dropdown value: '1', '2', '3', or '5'
	arbeitstage_seit_reinigung: number; // starting counter (always 0)
}

export const RHYTHMUS_ROOMS_EG: RhythmusRoom[] = [
	{ name: 'Raum 0.01', floor: 'EG', coordIndex: 0, reinigungsintervall: '1', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 0.02', floor: 'EG', coordIndex: 1, reinigungsintervall: '2', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 0.03', floor: 'EG', coordIndex: 2, reinigungsintervall: '3', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 0.04', floor: 'EG', coordIndex: 3, reinigungsintervall: '5', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 0.05', floor: 'EG', coordIndex: 4, reinigungsintervall: '1', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 0.06', floor: 'EG', coordIndex: 5, reinigungsintervall: '2', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 0.07', floor: 'EG', coordIndex: 6, reinigungsintervall: '3', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 0.08', floor: 'EG', coordIndex: 7, reinigungsintervall: '5', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 0.09', floor: 'EG', coordIndex: 8, reinigungsintervall: '1', arbeitstage_seit_reinigung: 0 }
];

export const RHYTHMUS_ROOMS_OG: RhythmusRoom[] = [
	{ name: 'Raum 1.01', floor: '1.OG', coordIndex: 0, reinigungsintervall: '2', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 1.02', floor: '1.OG', coordIndex: 1, reinigungsintervall: '3', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 1.03', floor: '1.OG', coordIndex: 2, reinigungsintervall: '5', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 1.04', floor: '1.OG', coordIndex: 3, reinigungsintervall: '1', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 1.05', floor: '1.OG', coordIndex: 4, reinigungsintervall: '2', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 1.06', floor: '1.OG', coordIndex: 5, reinigungsintervall: '3', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 1.07', floor: '1.OG', coordIndex: 6, reinigungsintervall: '5', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 1.08', floor: '1.OG', coordIndex: 7, reinigungsintervall: '1', arbeitstage_seit_reinigung: 0 },
	{ name: 'Raum 1.09', floor: '1.OG', coordIndex: 8, reinigungsintervall: '2', arbeitstage_seit_reinigung: 0 }
];

// --- Demo A workflow definitions ---
export const DEMO_A_WORKFLOWS = [
	{ name: 'Reinigung EG', description: 'Tagesplan-basierte Reinigung Erdgeschoss' },
	{ name: 'Reinigung 1.OG', description: 'Tagesplan-basierte Reinigung 1. Obergeschoss' }
];

// --- Demo B workflow definitions (per floor, like Demo A) ---
export const DEMO_B_WORKFLOWS = [
	{ name: 'Reinigung EG (Rhythmus)', description: 'Intervall-basierte Reinigung Erdgeschoss' },
	{ name: 'Reinigung 1.OG (Rhythmus)', description: 'Intervall-basierte Reinigung 1. Obergeschoss' }
];
