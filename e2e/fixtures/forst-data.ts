export { ADMIN_CREDENTIALS } from './test-data';

// --- Project ---
export const FORST_PROJECT = {
	name: 'Forstbetrieb Risikokarte',
	description: 'Zwei-Layer Risikokarte: Befallsueberwachung (Heatmap) + Kaefersichtungen (Zeitwelle)'
};

// --- Roles ---
export const FORST_ROLES = [
	{ name: 'Foerster', description: 'Voller Zugriff auf alle Workflows' },
	{ name: 'Waldarbeiter', description: 'Kann nur Befallsmerkmale melden' }
];

// --- Participants ---
export const FORST_PARTICIPANTS = [
	{ name: 'Heinrich Gruenwald', email: 'heinrich@forst.test', roles: ['Foerster'] },
	{ name: 'Karl Holzmann', email: 'karl@forst.test', roles: ['Waldarbeiter'] },
	{ name: 'Maria Waldner', email: 'maria@forst.test', roles: ['Foerster', 'Waldarbeiter'] }
];

// --- Workflow A: Befallsueberwachung ---
export const WORKFLOW_A = {
	name: 'Befallsueberwachung',
	description: 'Berechnete Heatmap: Befallsindex aus 5 binaeren Indikatoren, multipliziert mit Schadstufe'
};

export const BEFALLS_STAGES = [
	{ name: 'Monitoring', type: 'start' as const, x: 100, y: 200 },
	{ name: 'Verdacht', type: 'intermediate' as const, x: 300, y: 200 },
	{ name: 'Befall bestaetigt', type: 'intermediate' as const, x: 500, y: 200 },
	{ name: 'In Aufarbeitung', type: 'intermediate' as const, x: 700, y: 200 }
];

export const BEFALLS_CONNECTIONS = [
	{ from: null as string | null, to: 'Monitoring', action: 'entry' },
	{ from: 'Monitoring', to: 'Verdacht', action: 'Verdacht melden' },
	{ from: 'Verdacht', to: 'Befall bestaetigt', action: 'Befall bestaetigen' },
	{ from: 'Befall bestaetigt', to: 'In Aufarbeitung', action: 'Aufarbeitung starten' },
	{ from: 'In Aufarbeitung', to: 'Monitoring', action: 'Zurueck zu Monitoring' }
];

// Baumart options (Waldzustandserhebung)
export const BAUMART_OPTIONS = [
	{ label: 'Fichte' },
	{ label: 'Kiefer' },
	{ label: 'Tanne' },
	{ label: 'Laerche' },
	{ label: 'Douglasie' }
];

// Schadstufe (WZE Kronenverlichtung)
export const SCHADSTUFE_OPTIONS = [
	{ label: '0 Ohne Schaedigung' },
	{ label: '1 Warnstufe' },
	{ label: '2 Mittelstark' },
	{ label: '3 Stark' },
	{ label: '4 Abgestorben' }
];

// Befallsmerkmale (multiple_choice -- replaces 5 binary fields)
export const BEFALLSMERKMALE_OPTIONS = [
	{ label: 'Bohrmehl vorhanden' },
	{ label: 'Einbohrlocher vorhanden' },
	{ label: 'Harzfluss vorhanden' },
	{ label: 'Kronenverfaerbung' },
	{ label: 'Spechtabschlaege vorhanden' }
];

// Dringlichkeit (forstlicher Standard A-D)
export const DRINGLICHKEIT_OPTIONS = [
	{ label: 'A' },
	{ label: 'B' },
	{ label: 'C' },
	{ label: 'D' }
];

// --- Workflow B: Kaefersichtungen ---
export const WORKFLOW_B = {
	name: 'Kaefersichtungen',
	description: 'Ausbreitungswelle: Sichtungen verblassen woechentlich (Aktuell -> Letzte Woche -> Vor 2 Wochen -> Historisch)'
};

export const SICHTUNGEN_STAGES = [
	{ name: 'Aktuell', type: 'start' as const, x: 100, y: 200 },
	{ name: 'Letzte Woche', type: 'intermediate' as const, x: 300, y: 200 },
	{ name: 'Vor 2 Wochen', type: 'intermediate' as const, x: 500, y: 200 },
	{ name: 'Historisch', type: 'intermediate' as const, x: 700, y: 200 }
];

export const SICHTUNGEN_CONNECTIONS = [
	{ from: null as string | null, to: 'Aktuell', action: 'entry' }
	// No manual transitions -- all automatic via scheduled automations
];

export const KAEFERART_OPTIONS = [
	{ label: 'Buchdrucker' },
	{ label: 'Kupferstecher' },
	{ label: 'Waldgaertner' }
];

export const BEFALLSSTADIUM_OPTIONS = [
	{ label: 'Bohrmehl sichtbar' },
	{ label: 'Larven unter Rinde' },
	{ label: 'Jungkaefer hell' },
	{ label: 'Jungkaefer dunkel' },
	{ label: 'Ausgeflogen' }
];

// --- Coordinates: Bavarian Forest area (Bayerischer Wald) ---
export const FORST_COORDINATES: Array<{ lat: number; lon: number }> = [
	// Cluster 1: Northern section (healthy)
	{ lat: 48.9520, lon: 13.3780 },
	{ lat: 48.9535, lon: 13.3810 },
	{ lat: 48.9510, lon: 13.3840 },
	// Cluster 2: Central section (moderate risk)
	{ lat: 48.9480, lon: 13.3790 },
	{ lat: 48.9465, lon: 13.3820 },
	{ lat: 48.9490, lon: 13.3850 },
	// Cluster 3: Southern section (high risk)
	{ lat: 48.9440, lon: 13.3800 },
	{ lat: 48.9425, lon: 13.3830 },
	{ lat: 48.9450, lon: 13.3860 }
];

// Sample instances for Befallsueberwachung
export interface BefallsInstance {
	coordIndex: number;
	baumart: string;
	schadstufe: string;
	befallsmerkmale: string[]; // selected labels from BEFALLSMERKMALE_OPTIONS
}

export const BEFALLS_INSTANCES: BefallsInstance[] = [
	// Healthy trees (north)
	{ coordIndex: 0, baumart: 'Fichte', schadstufe: '0 Ohne Schaedigung', befallsmerkmale: [] },
	{ coordIndex: 1, baumart: 'Kiefer', schadstufe: '0 Ohne Schaedigung', befallsmerkmale: [] },
	{ coordIndex: 2, baumart: 'Tanne', schadstufe: '1 Warnstufe', befallsmerkmale: ['Harzfluss vorhanden'] },
	// Moderate risk (center)
	{ coordIndex: 3, baumart: 'Fichte', schadstufe: '2 Mittelstark', befallsmerkmale: ['Bohrmehl vorhanden', 'Einbohrlocher vorhanden', 'Kronenverfaerbung'] },
	{ coordIndex: 4, baumart: 'Fichte', schadstufe: '1 Warnstufe', befallsmerkmale: ['Bohrmehl vorhanden', 'Harzfluss vorhanden'] },
	{ coordIndex: 5, baumart: 'Douglasie', schadstufe: '2 Mittelstark', befallsmerkmale: ['Einbohrlocher vorhanden', 'Kronenverfaerbung', 'Spechtabschlaege vorhanden'] },
	// High risk (south)
	{ coordIndex: 6, baumart: 'Fichte', schadstufe: '3 Stark', befallsmerkmale: ['Bohrmehl vorhanden', 'Einbohrlocher vorhanden', 'Harzfluss vorhanden', 'Kronenverfaerbung', 'Spechtabschlaege vorhanden'] },
	{ coordIndex: 7, baumart: 'Fichte', schadstufe: '4 Abgestorben', befallsmerkmale: ['Bohrmehl vorhanden', 'Einbohrlocher vorhanden', 'Harzfluss vorhanden', 'Kronenverfaerbung'] },
	{ coordIndex: 8, baumart: 'Laerche', schadstufe: '3 Stark', befallsmerkmale: ['Bohrmehl vorhanden', 'Einbohrlocher vorhanden', 'Harzfluss vorhanden', 'Kronenverfaerbung', 'Spechtabschlaege vorhanden'] }
];

// Sample instances for Kaefersichtungen
export interface SichtungsInstance {
	coordIndex: number;
	kaeferart: string;
	befallsstadium: string;
}

export const SICHTUNGEN_INSTANCES: SichtungsInstance[] = [
	{ coordIndex: 6, kaeferart: 'Buchdrucker', befallsstadium: 'Larven unter Rinde' },
	{ coordIndex: 7, kaeferart: 'Buchdrucker', befallsstadium: 'Jungkaefer dunkel' },
	{ coordIndex: 8, kaeferart: 'Kupferstecher', befallsstadium: 'Bohrmehl sichtbar' },
	{ coordIndex: 4, kaeferart: 'Buchdrucker', befallsstadium: 'Bohrmehl sichtbar' },
	{ coordIndex: 5, kaeferart: 'Waldgaertner', befallsstadium: 'Ausgeflogen' },
	{ coordIndex: 3, kaeferart: 'Kupferstecher', befallsstadium: 'Jungkaefer hell' }
];
