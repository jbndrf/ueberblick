export { ADMIN_CREDENTIALS } from './test-data';

// --- Project ---
export const SICHERHEIT_PROJECT = {
	name: 'Sicherheitsbegehung',
	description: 'Gefaehrdungsbeurteilung nach Nohl-Methodik (DGUV/IFA Standard)'
};

// --- Roles ---
export const SICHERHEIT_ROLES = [
	{ name: 'Sicherheitsbeauftragter', description: 'Fuehrt Begehungen durch und bewertet Risiken' },
	{ name: 'Fachkraft fuer Arbeitssicherheit', description: 'Prueft und genehmigt Massnahmen' }
];

// --- Participants ---
export const SICHERHEIT_PARTICIPANTS = [
	{ name: 'Thomas Sicher', email: 'thomas@sicherheit.test', roles: ['Sicherheitsbeauftragter'] },
	{ name: 'Anna Prueferin', email: 'anna@sicherheit.test', roles: ['Fachkraft fuer Arbeitssicherheit'] },
	{ name: 'Peter Meister', email: 'peter@sicherheit.test', roles: ['Sicherheitsbeauftragter', 'Fachkraft fuer Arbeitssicherheit'] }
];

// --- Stages ---
export const SICHERHEIT_STAGES = [
	{ name: 'Erfasst', type: 'start' as const, x: 100, y: 200 },
	{ name: 'Bewertet', type: 'intermediate' as const, x: 250, y: 200 },
	{ name: 'Massnahme geplant', type: 'intermediate' as const, x: 400, y: 200 },
	{ name: 'Behoben', type: 'intermediate' as const, x: 550, y: 200 },
	{ name: 'Nachkontrolle', type: 'intermediate' as const, x: 700, y: 200 }
];

export const SICHERHEIT_CONNECTIONS = [
	{ from: null as string | null, to: 'Erfasst', action: 'entry' },
	{ from: 'Erfasst', to: 'Bewertet', action: 'Bewertung abschliessen' },
	{ from: 'Bewertet', to: 'Massnahme geplant', action: 'Massnahme planen' },
	{ from: 'Massnahme geplant', to: 'Behoben', action: 'Als behoben markieren' },
	{ from: 'Behoben', to: 'Nachkontrolle', action: 'Nachkontrolle einleiten' }
];

// --- Gefaehrdungsfaktor (5 of 11 official DGUV categories) ---
export const GEFAEHRDUNGSFAKTOR_OPTIONS = [
	{ label: 'Mechanische Gefaehrdungen' },
	{ label: 'Elektrische Gefaehrdungen' },
	{ label: 'Gefahrstoffe' },
	{ label: 'Brand und Explosion' },
	{ label: 'Physische Belastungen' }
];

// --- Detailtyp smart_dropdown mappings ---
export const DETAILTYP_MAPPINGS = [
	{
		when: 'Mechanische Gefaehrdungen',
		options: [
			{ label: 'Sturzgefahr' },
			{ label: 'Absturzgefahr' },
			{ label: 'Stolperstellen' },
			{ label: 'Quetschgefahr' }
		]
	},
	{
		when: 'Elektrische Gefaehrdungen',
		options: [
			{ label: 'Offene Leitungen' },
			{ label: 'Fehlender FI-Schutz' },
			{ label: 'Ueberlastete Steckdosen' }
		]
	},
	{
		when: 'Gefahrstoffe',
		options: [
			{ label: 'Fehlende Kennzeichnung' },
			{ label: 'Lagerung nicht TRGS-konform' },
			{ label: 'Fehlende Absaugung' }
		]
	},
	{
		when: 'Brand und Explosion',
		options: [
			{ label: 'Fehlender Loescher' },
			{ label: 'Blockierter Fluchtweg' },
			{ label: 'Defekte Brandtuer' }
		]
	},
	{
		when: 'Physische Belastungen',
		options: [
			{ label: 'Schwere Lasten' },
			{ label: 'Zwangshaltungen' },
			{ label: 'Repetitive Bewegungen' }
		]
	}
];

// --- Nohl scale ---
export const EINTRITTSWAHRSCHEINLICHKEIT_OPTIONS = [
	{ label: '1 Sehr gering' },
	{ label: '2 Gering' },
	{ label: '3 Mittel' },
	{ label: '4 Hoch' }
];

export const SCHADENSSCHWERE_OPTIONS = [
	{ label: '1 Leichte Verletzung' },
	{ label: '2 Mittelschwere Verletzung' },
	{ label: '3 Schwere Verletzung' },
	{ label: '4 Moeglicher Tod' }
];

export const RISIKOKLASSE_OPTIONS = [
	{ label: 'Gering' },
	{ label: 'Erheblich' },
	{ label: 'Hoch' }
];

// --- T-O-P Massnahmenart ---
export const MASSNAHMENART_OPTIONS = [
	{ label: 'Technische Massnahme' },
	{ label: 'Organisatorische Massnahme' },
	{ label: 'Personenbezogene Massnahme' }
];

// --- Custom Table: Massnahmenkatalog ---
export const MASSNAHMENKATALOG_COLUMNS = [
	{ column_name: 'kategorie', column_type: 'text' as const, is_required: true },
	{ column_name: 'massnahme', column_type: 'text' as const, is_required: true },
	{ column_name: 'top_prinzip', column_type: 'text' as const, is_required: true },
	{ column_name: 'prioritaet', column_type: 'number' as const, is_required: false }
];

export const MASSNAHMENKATALOG_DATA = [
	{ kategorie: 'Mechanische Gefaehrdungen', massnahme: 'Gelaender nachruesten', top_prinzip: 'Technische Massnahme', prioritaet: 1 },
	{ kategorie: 'Mechanische Gefaehrdungen', massnahme: 'Rutschfeste Belaege anbringen', top_prinzip: 'Technische Massnahme', prioritaet: 2 },
	{ kategorie: 'Mechanische Gefaehrdungen', massnahme: 'Stolperstellen markieren', top_prinzip: 'Organisatorische Massnahme', prioritaet: 3 },
	{ kategorie: 'Elektrische Gefaehrdungen', massnahme: 'FI-Schutzschalter installieren', top_prinzip: 'Technische Massnahme', prioritaet: 1 },
	{ kategorie: 'Elektrische Gefaehrdungen', massnahme: 'Elektrische Pruefung durchfuehren', top_prinzip: 'Organisatorische Massnahme', prioritaet: 2 },
	{ kategorie: 'Gefahrstoffe', massnahme: 'GHS-Kennzeichnung anbringen', top_prinzip: 'Organisatorische Massnahme', prioritaet: 1 },
	{ kategorie: 'Gefahrstoffe', massnahme: 'Absauganlage installieren', top_prinzip: 'Technische Massnahme', prioritaet: 2 },
	{ kategorie: 'Brand und Explosion', massnahme: 'Feuerloescher bereitstellen', top_prinzip: 'Technische Massnahme', prioritaet: 1 },
	{ kategorie: 'Brand und Explosion', massnahme: 'Fluchtweg freiraeumen', top_prinzip: 'Organisatorische Massnahme', prioritaet: 1 },
	{ kategorie: 'Physische Belastungen', massnahme: 'Hebehilfen bereitstellen', top_prinzip: 'Technische Massnahme', prioritaet: 1 },
	{ kategorie: 'Physische Belastungen', massnahme: 'Ergonomie-Schulung', top_prinzip: 'Personenbezogene Massnahme', prioritaet: 2 }
];

// --- Coordinates: Office building area (Munich Schwabing) ---
export const SICHERHEIT_COORDINATES: Array<{ lat: number; lon: number }> = [
	{ lat: 48.1550, lon: 11.5820 },
	{ lat: 48.1552, lon: 11.5825 },
	{ lat: 48.1548, lon: 11.5830 },
	{ lat: 48.1546, lon: 11.5822 },
	{ lat: 48.1554, lon: 11.5828 },
	{ lat: 48.1550, lon: 11.5835 },
	{ lat: 48.1544, lon: 11.5818 },
	{ lat: 48.1556, lon: 11.5832 }
];

// --- Sample instances ---
export interface SicherheitInstance {
	coordIndex: number;
	raum: string;
	gefaehrdungsfaktor: string;
	detailtyp: string;
	eintrittswahrscheinlichkeit: string;
	schadensschwere: string;
	beschreibung: string;
}

export const SICHERHEIT_INSTANCES: SicherheitInstance[] = [
	{ coordIndex: 0, raum: 'Treppenhaus A', gefaehrdungsfaktor: 'Mechanische Gefaehrdungen', detailtyp: 'Absturzgefahr', eintrittswahrscheinlichkeit: '3 Mittel', schadensschwere: '3 Schwere Verletzung', beschreibung: 'Gelaender im 2. OG locker, Absturzgefahr bei Belastung' },
	{ coordIndex: 1, raum: 'Serverraum', gefaehrdungsfaktor: 'Elektrische Gefaehrdungen', detailtyp: 'Ueberlastete Steckdosen', eintrittswahrscheinlichkeit: '2 Gering', schadensschwere: '4 Moeglicher Tod', beschreibung: 'Mehrfachsteckdosen in Reihe geschaltet, Brandgefahr' },
	{ coordIndex: 2, raum: 'Lager Keller', gefaehrdungsfaktor: 'Gefahrstoffe', detailtyp: 'Lagerung nicht TRGS-konform', eintrittswahrscheinlichkeit: '2 Gering', schadensschwere: '2 Mittelschwere Verletzung', beschreibung: 'Reinigungsmittel und Loesungsmittel gemeinsam gelagert' },
	{ coordIndex: 3, raum: 'Werkstatt', gefaehrdungsfaktor: 'Mechanische Gefaehrdungen', detailtyp: 'Quetschgefahr', eintrittswahrscheinlichkeit: '3 Mittel', schadensschwere: '2 Mittelschwere Verletzung', beschreibung: 'Schutzabdeckung an Standbohrmaschine fehlt' },
	{ coordIndex: 4, raum: 'Fluchtweg Sued', gefaehrdungsfaktor: 'Brand und Explosion', detailtyp: 'Blockierter Fluchtweg', eintrittswahrscheinlichkeit: '4 Hoch', schadensschwere: '4 Moeglicher Tod', beschreibung: 'Fluchtweg durch Lagergut auf halbe Breite verengt' },
	{ coordIndex: 5, raum: 'Buero 2.04', gefaehrdungsfaktor: 'Physische Belastungen', detailtyp: 'Zwangshaltungen', eintrittswahrscheinlichkeit: '1 Sehr gering', schadensschwere: '1 Leichte Verletzung', beschreibung: 'Bildschirmarbeitsplaetze ohne hoehenverstellbare Tische' },
	{ coordIndex: 6, raum: 'Kueche', gefaehrdungsfaktor: 'Mechanische Gefaehrdungen', detailtyp: 'Stolperstellen', eintrittswahrscheinlichkeit: '2 Gering', schadensschwere: '1 Leichte Verletzung', beschreibung: 'Kabel quer ueber den Boden verlegt' },
	{ coordIndex: 7, raum: 'Brandschutztuer EG', gefaehrdungsfaktor: 'Brand und Explosion', detailtyp: 'Defekte Brandtuer', eintrittswahrscheinlichkeit: '3 Mittel', schadensschwere: '3 Schwere Verletzung', beschreibung: 'Brandschutztuer schliesst nicht vollstaendig, Dichtung defekt' }
];
