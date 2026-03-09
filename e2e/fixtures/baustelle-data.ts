export { ADMIN_CREDENTIALS } from './test-data';

// --- Project ---
export const BAUSTELLE_PROJECT = {
	name: 'Baustelle Doppelbewertung',
	description: 'Blinde Doppelbewertung mit Konsens-Mechanismus (VOB/B)'
};

// --- Roles ---
export const BAUSTELLE_ROLES = [
	{ name: 'Objektueberwacher', description: 'Bewertet Maengel unabhaengig (OUe)' },
	{ name: 'Pruefingenieur', description: 'Bewertet Maengel unabhaengig (PI)' },
	{ name: 'Bauleiter', description: 'Sieht alles, entscheidet bei Streitfaellen' }
];

// --- Participants ---
export const BAUSTELLE_PARTICIPANTS = [
	{ name: 'Frank Bauer', email: 'frank@baustelle.test', roles: ['Objektueberwacher'] },
	{ name: 'Dr. Eva Statik', email: 'eva@baustelle.test', roles: ['Pruefingenieur'] },
	{ name: 'Werner Leiter', email: 'werner@baustelle.test', roles: ['Bauleiter'] }
];

// --- Stages ---
export const BAUSTELLE_STAGES = [
	{ name: 'Gemeldet', type: 'start' as const, x: 100, y: 200 },
	{ name: 'Bewertung OUe', type: 'intermediate' as const, x: 250, y: 200 },
	{ name: 'Bewertung PI', type: 'intermediate' as const, x: 400, y: 200 },
	{ name: 'Auswertung', type: 'intermediate' as const, x: 550, y: 200 },
	{ name: 'In Nachbesserung', type: 'intermediate' as const, x: 700, y: 200 },
	{ name: 'Abgenommen', type: 'end' as const, x: 850, y: 200 }
];

export const BAUSTELLE_CONNECTIONS = [
	{ from: null as string | null, to: 'Gemeldet', action: 'entry' },
	{ from: 'Gemeldet', to: 'Bewertung OUe', action: 'Zur Bewertung freigeben' },
	{ from: 'Bewertung OUe', to: 'Bewertung PI', action: 'OUe-Bewertung abgeben' },
	{ from: 'Bewertung PI', to: 'Auswertung', action: 'PI-Bewertung abgeben' },
	{ from: 'Auswertung', to: 'In Nachbesserung', action: 'Nachbesserung anordnen' },
	{ from: 'In Nachbesserung', to: 'Abgenommen', action: 'Abnahme durchfuehren' }
];

// --- Bauphase + Gewerk (DIN 276 smart_dropdown) ---
export const BAUPHASE_OPTIONS = [
	{ label: 'Rohbau' },
	{ label: 'TGA' },
	{ label: 'Ausbau' }
];

export const GEWERK_MAPPINGS = [
	{
		when: 'Rohbau',
		options: [
			{ label: 'Erdarbeiten' },
			{ label: 'Mauerwerk' },
			{ label: 'Betonarbeiten' },
			{ label: 'Stahlbau' },
			{ label: 'Zimmerei' }
		]
	},
	{
		when: 'TGA',
		options: [
			{ label: 'Elektroinstallation' },
			{ label: 'SHK' },
			{ label: 'Lueftung-Klima' },
			{ label: 'Aufzugstechnik' }
		]
	},
	{
		when: 'Ausbau',
		options: [
			{ label: 'Trockenbau' },
			{ label: 'Putz-Stuck' },
			{ label: 'Fliesen' },
			{ label: 'Bodenbelag' },
			{ label: 'Maler' },
			{ label: 'Schreiner' }
		]
	}
];

// --- Prioritaet (calculated from Dringlichkeits-Durchschnitt) ---
export const PRIORITAET_OPTIONS = [
	{ label: 'Sofort' },
	{ label: 'Zeitnah' },
	{ label: 'Vor Abnahme' }
];

// --- Konsens ---
export const KONSENS_OPTIONS = [
	{ label: 'Einig' },
	{ label: 'Strittig' }
];

// --- Beteiligte Firmen (custom table) ---
export const FIRMEN_COLUMNS = [
	{ column_name: 'firma', column_type: 'text' as const, is_required: true },
	{ column_name: 'gewerk', column_type: 'text' as const, is_required: true },
	{ column_name: 'ansprechpartner', column_type: 'text' as const, is_required: false },
	{ column_name: 'telefon', column_type: 'text' as const, is_required: false }
];

export const FIRMEN_DATA = [
	{ firma: 'Bau Mueller GmbH', gewerk: 'Rohbau', ansprechpartner: 'Hans Mueller', telefon: '089-12345' },
	{ firma: 'Elektro Schmidt', gewerk: 'Elektroinstallation', ansprechpartner: 'Klaus Schmidt', telefon: '089-23456' },
	{ firma: 'SHK Berger', gewerk: 'SHK', ansprechpartner: 'Fritz Berger', telefon: '089-34567' },
	{ firma: 'Trockenbau Huber', gewerk: 'Trockenbau', ansprechpartner: 'Josef Huber', telefon: '089-45678' },
	{ firma: 'Maler Weiss', gewerk: 'Maler', ansprechpartner: 'Stefan Weiss', telefon: '089-56789' },
	{ firma: 'Fliesen Stein AG', gewerk: 'Fliesen', ansprechpartner: 'Markus Stein', telefon: '089-67890' }
];

// --- Coordinates: Construction site (Munich Riem) ---
export const BAUSTELLE_COORDINATES: Array<{ lat: number; lon: number }> = [
	{ lat: 48.1320, lon: 11.6920 },
	{ lat: 48.1322, lon: 11.6925 },
	{ lat: 48.1318, lon: 11.6930 },
	{ lat: 48.1324, lon: 11.6918 },
	{ lat: 48.1316, lon: 11.6922 },
	{ lat: 48.1320, lon: 11.6935 }
];

// --- Sample instances ---
export interface BaustelleInstance {
	coordIndex: number;
	bauphase: string;
	gewerk: string;
	beschreibung: string;
	einstufung_oue: number;
	dringlichkeit_oue: number;
	einstufung_pi: number;
	dringlichkeit_pi: number;
}

export const BAUSTELLE_INSTANCES: BaustelleInstance[] = [
	{ coordIndex: 0, bauphase: 'Rohbau', gewerk: 'Betonarbeiten', beschreibung: 'Riss in Deckenplatte 2.OG, ca. 30cm Laenge', einstufung_oue: 1, dringlichkeit_oue: 1, einstufung_pi: 1, dringlichkeit_pi: 1 },
	{ coordIndex: 1, bauphase: 'TGA', gewerk: 'Elektroinstallation', beschreibung: 'Kabelkanal nicht brandschutztechnisch abgeschottet', einstufung_oue: 1, dringlichkeit_oue: 1, einstufung_pi: 1, dringlichkeit_pi: 2 },
	{ coordIndex: 2, bauphase: 'Ausbau', gewerk: 'Fliesen', beschreibung: 'Hohlstellen unter Bodenfliesen im Foyer', einstufung_oue: 0, dringlichkeit_oue: 3, einstufung_pi: 1, dringlichkeit_pi: 2 },
	{ coordIndex: 3, bauphase: 'Rohbau', gewerk: 'Mauerwerk', beschreibung: 'Fugenbreite ueberschritten an Aussenwand Nord', einstufung_oue: 0, dringlichkeit_oue: 3, einstufung_pi: 0, dringlichkeit_pi: 3 },
	{ coordIndex: 4, bauphase: 'TGA', gewerk: 'SHK', beschreibung: 'Heizungsrohr nicht gemaess Planung isoliert', einstufung_oue: 1, dringlichkeit_oue: 2, einstufung_pi: 0, dringlichkeit_pi: 3 },
	{ coordIndex: 5, bauphase: 'Ausbau', gewerk: 'Maler', beschreibung: 'Farbabweichung an Treppenhauswand', einstufung_oue: 0, dringlichkeit_oue: 3, einstufung_pi: 0, dringlichkeit_pi: 3 }
];
