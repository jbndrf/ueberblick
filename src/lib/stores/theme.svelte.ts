/**
 * Theme store for managing dark/light mode
 * Uses Svelte 5 runes for reactivity
 */

import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

class ThemeStore {
	private _theme = $state<Theme>('light');

	constructor() {
		if (browser) {
			// Initialize from localStorage or system preference
			const stored = localStorage.getItem('theme') as Theme | null;
			if (stored) {
				this._theme = stored;
			} else {
				// Check system preference
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				this._theme = prefersDark ? 'dark' : 'light';
			}
			this.applyTheme();
		}
	}

	get current(): Theme {
		return this._theme;
	}

	get isDark(): boolean {
		return this._theme === 'dark';
	}

	set(theme: Theme) {
		this._theme = theme;
		if (browser) {
			localStorage.setItem('theme', theme);
			this.applyTheme();
		}
	}

	toggle() {
		this.set(this._theme === 'dark' ? 'light' : 'dark');
	}

	private applyTheme() {
		if (browser) {
			if (this._theme === 'dark') {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}
		}
	}
}

export const themeStore = new ThemeStore();
