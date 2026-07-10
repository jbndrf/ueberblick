import { getContext, setContext } from 'svelte';
import { MediaQuery } from 'svelte/reactivity';

/** Width at or above which the "wide" presentation is offered. */
const WIDE_BREAKPOINT = 768;

const UI_MODE_KEY = Symbol('ui-mode');

/**
 * Single source of truth for the mobile/wide presentation switch.
 *
 * Both halves of the app read this: JS layout branches via `isWide`, and CSS
 * via the `wide:` Tailwind variant, which is gated on the `data-ui` attribute
 * that {@link UiMode.attribute} feeds. Keeping the CSS variant tied to a DOM
 * attribute rather than a media query is what makes `forceMobile` able to
 * override it — a `@media` rule compiled into the stylesheet cannot be.
 */
export class UiMode {
	// The server has no viewport, so it assumes wide. Consumers that want the
	// mobile presentation there pass `forceMobile`, which short-circuits this
	// and so never produces a hydration flip.
	#wide = new MediaQuery(`min-width: ${WIDE_BREAKPOINT}px`, true);

	/** Pins the UI to its mobile presentation regardless of viewport width. */
	forceMobile = $state(false);

	constructor(forceMobile = false) {
		this.forceMobile = forceMobile;
	}

	get isWide() {
		return !this.forceMobile && this.#wide.current;
	}

	get isMobile() {
		return !this.isWide;
	}

	/** Stamp this on the document root; the `wide:` variant keys off it. */
	get attribute() {
		return this.isWide ? 'wide' : 'mobile';
	}
}

export function setUiMode(mode: UiMode): UiMode {
	return setContext(UI_MODE_KEY, mode);
}

/**
 * Components shared between SECTOR and the participant app call this. Without a
 * provider (i.e. in admin) they get plain viewport-driven behaviour.
 */
export function getUiMode(): UiMode {
	return getContext<UiMode | undefined>(UI_MODE_KEY) ?? new UiMode();
}
