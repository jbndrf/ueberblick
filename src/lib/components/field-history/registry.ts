import type { Component } from 'svelte';
import type { FieldType } from '$lib/components/form-renderer/types';
import type { FieldHistoryViewProps } from './types';
import { DefaultHistoryView } from './views';

/**
 * Per-field-type history views. Add an entry to expose a richer view
 * (e.g. line chart for numbers, image gallery for files). Anything not
 * listed falls back to {@link DefaultHistoryView}.
 */
const registry: Partial<Record<FieldType, Component<FieldHistoryViewProps>>> = {};

export function getHistoryView(type: FieldType): Component<FieldHistoryViewProps> {
	return registry[type] ?? (DefaultHistoryView as Component<FieldHistoryViewProps>);
}
