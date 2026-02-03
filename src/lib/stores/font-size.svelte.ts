import { browser } from '$app/environment';

type FontSize = 'xs' | 'small' | 'medium' | 'large' | 'xl';

const sizes: Record<FontSize, string> = {
	xs: '12px',
	small: '14px',
	medium: '16px',
	large: '18px',
	xl: '20px'
};

class FontSizeStore {
	private _size = $state<FontSize>('medium');

	constructor() {
		if (browser) {
			const stored = localStorage.getItem('font-size') as FontSize | null;
			if (stored && stored in sizes) {
				this._size = stored;
			}
			this.apply();
		}
	}

	get current(): FontSize {
		return this._size;
	}

	set(size: FontSize) {
		this._size = size;
		if (browser) {
			localStorage.setItem('font-size', size);
			this.apply();
		}
	}

	private apply() {
		if (browser) {
			document.documentElement.style.fontSize = sizes[this._size];
		}
	}
}

export const fontSizeStore = new FontSizeStore();
