export { ADMIN_CREDENTIALS } from './test-data';

// --- Project ---
export const BRANDSCHUTZ_PROJECT = {
	name: 'Brandschutz Fluchtweg-Kapazitaet',
	description: 'Fluchtweg-Abschnitte mit berechneter Durchlassfaehigkeit nach ASR A2.3'
};

// --- Roles ---
export const BRANDSCHUTZ_ROLES = [
	{ name: 'Brandschutzbeauftragter', description: 'Qualifiziert nach vfdb, fuehrt Begehungen durch' },
	{ name: 'Sicherheitsbeauftragter', description: 'Unterstuetzende Rolle, kann Maengel melden' },
	{ name: 'Evakuierungshelfer', description: 'Sieht Fluchtweg-Status, kann keine Bewertungen aendern' }
];

// --- Participants ---
export const BRANDSCHUTZ_PARTICIPANTS = [
	{ name: 'Klaus Brandmeister', email: 'klaus@brandschutz.test', roles: ['Brandschutzbeauftragter'] },
	{ name: 'Sabine Sicherheit', email: 'sabine@brandschutz.test', roles: ['Sicherheitsbeauftragter'] },
	{ name: 'Tim Helfer', email: 'tim@brandschutz.test', roles: ['Evakuierungshelfer'] }
];

// --- Workflow A: Fluchtweg-Abschnitte ---
export const FLUCHTWEG_STAGES = [
	{ name: 'Konform', type: 'start' as const, x: 100, y: 200 },
	{ name: 'Eingeschraenkt', type: 'intermediate' as const, x: 350, y: 200 },
	{ name: 'Nicht konform', type: 'intermediate' as const, x: 600, y: 200 }
];

export const FLUCHTWEG_CONNECTIONS = [
	{ from: null as string | null, to: 'Konform', action: 'entry' },
	{ from: 'Konform', to: 'Eingeschraenkt', action: 'Als eingeschraenkt melden' },
	{ from: 'Eingeschraenkt', to: 'Nicht konform', action: 'Als nicht konform melden' },
	{ from: 'Nicht konform', to: 'Eingeschraenkt', action: 'Teilweise behoben' },
	{ from: 'Eingeschraenkt', to: 'Konform', action: 'Wieder konform' }
];

export const FLUCHTWEG_TYP_OPTIONS = [
	{ label: 'Hauptfluchtweg' },
	{ label: 'Nebenfluchtweg' }
];

export const HINDERNIS_OPTIONS = [
	{ label: 'Keines' },
	{ label: 'Lagergut' },
	{ label: 'Moebel' },
	{ label: 'Bauarbeiten' },
	{ label: 'Lieferung' },
	{ label: 'Brandlast in Treppenraum' }
];

export const AMPEL_OPTIONS = [
	{ label: 'Gruen' },
	{ label: 'Gelb' },
	{ label: 'Rot' }
];

// --- Workflow B: Brandschutzeinrichtungen ---
export const EINRICHTUNG_STAGES = [
	{ name: 'Geprueft', type: 'start' as const, x: 100, y: 200 },
	{ name: 'Mangel festgestellt', type: 'intermediate' as const, x: 350, y: 200 },
	{ name: 'Instandgesetzt', type: 'intermediate' as const, x: 600, y: 200 }
];

export const EINRICHTUNG_CONNECTIONS = [
	{ from: null as string | null, to: 'Geprueft', action: 'entry' },
	{ from: 'Geprueft', to: 'Mangel festgestellt', action: 'Mangel melden' },
	{ from: 'Mangel festgestellt', to: 'Instandgesetzt', action: 'Instandsetzung dokumentieren' },
	{ from: 'Instandgesetzt', to: 'Geprueft', action: 'Nachpruefung bestanden' }
];

export const EINRICHTUNG_TYP_OPTIONS = [
	{ label: 'Feuerloescher CO2' },
	{ label: 'Feuerloescher ABC-Pulver' },
	{ label: 'Feuerloescher Wasser' },
	{ label: 'Feuerloescher Schaum' },
	{ label: 'Brandschutztuer T30' },
	{ label: 'Brandschutztuer T60' },
	{ label: 'Brandschutztuer T90' },
	{ label: 'Brandschutztuer RS' },
	{ label: 'Rauchmelder' }
];

// --- Coordinates: Large office building (Munich Bogenhausen) ---
export const BRANDSCHUTZ_COORDINATES: Array<{ lat: number; lon: number }> = [
	// Fluchtweg-Abschnitte (along corridors)
	{ lat: 48.1480, lon: 11.6100 },
	{ lat: 48.1482, lon: 11.6105 },
	{ lat: 48.1484, lon: 11.6110 },
	{ lat: 48.1478, lon: 11.6103 },
	{ lat: 48.1476, lon: 11.6108 },
	{ lat: 48.1480, lon: 11.6115 },
	// Einrichtungen (scattered throughout)
	{ lat: 48.1481, lon: 11.6102 },
	{ lat: 48.1483, lon: 11.6107 },
	{ lat: 48.1479, lon: 11.6112 },
	{ lat: 48.1477, lon: 11.6105 },
	{ lat: 48.1485, lon: 11.6100 },
	{ lat: 48.1475, lon: 11.6110 }
];

// --- Sample Fluchtweg instances ---
export interface FluchtwegInstance {
	coordIndex: number;
	bezeichnung: string;
	fluchtweg_typ: string;
	personen_einzugsgebiet: number;
	soll_breite: number;
	gemessene_breite: number;
	hindernis: string;
}

export const FLUCHTWEG_INSTANCES: FluchtwegInstance[] = [
	{ coordIndex: 0, bezeichnung: 'EG Flur Nord Abschnitt 1', fluchtweg_typ: 'Hauptfluchtweg', personen_einzugsgebiet: 120, soll_breite: 2.0, gemessene_breite: 1.9, hindernis: 'Keines' },
	{ coordIndex: 1, bezeichnung: 'EG Flur Nord Abschnitt 2', fluchtweg_typ: 'Hauptfluchtweg', personen_einzugsgebiet: 120, soll_breite: 2.0, gemessene_breite: 1.2, hindernis: 'Lagergut' },
	{ coordIndex: 2, bezeichnung: 'EG Flur Sued Abschnitt 1', fluchtweg_typ: 'Hauptfluchtweg', personen_einzugsgebiet: 80, soll_breite: 1.5, gemessene_breite: 1.4, hindernis: 'Keines' },
	{ coordIndex: 3, bezeichnung: '1.OG Treppenhaus A', fluchtweg_typ: 'Hauptfluchtweg', personen_einzugsgebiet: 60, soll_breite: 1.2, gemessene_breite: 0.5, hindernis: 'Brandlast in Treppenraum' },
	{ coordIndex: 4, bezeichnung: '1.OG Nebenflur West', fluchtweg_typ: 'Nebenfluchtweg', personen_einzugsgebiet: 25, soll_breite: 1.0, gemessene_breite: 0.7, hindernis: 'Moebel' },
	{ coordIndex: 5, bezeichnung: '2.OG Flur Hauptgang', fluchtweg_typ: 'Hauptfluchtweg', personen_einzugsgebiet: 90, soll_breite: 1.8, gemessene_breite: 1.5, hindernis: 'Lieferung' }
];

// --- Sample Einrichtung instances ---
export interface EinrichtungInstance {
	coordIndex: number;
	typ: string;
	standort: string;
}

export const EINRICHTUNG_INSTANCES: EinrichtungInstance[] = [
	{ coordIndex: 6, typ: 'Feuerloescher CO2', standort: 'EG Flur Nord, Pfeiler 3' },
	{ coordIndex: 7, typ: 'Feuerloescher ABC-Pulver', standort: 'EG Werkstatt Eingang' },
	{ coordIndex: 8, typ: 'Brandschutztuer T30', standort: '1.OG Treppenhaus A' },
	{ coordIndex: 9, typ: 'Brandschutztuer T90', standort: 'EG Serverraum' },
	{ coordIndex: 10, typ: 'Rauchmelder', standort: '2.OG Flur Hauptgang' },
	{ coordIndex: 11, typ: 'Feuerloescher Schaum', standort: 'UG Tiefgarage Zufahrt' }
];
