<script lang="ts">
	/**
	 * Canonical "who can see/do this" control for the builder.
	 *
	 * One wrapper around MobileMultiSelect so every per-entity role picker reads
	 * the same: a label, the chips selector with inline role creation, and a
	 * consistent "empty = everyone" hint. The bulk permissions matrix stays the
	 * cross-cutting overview; this is the per-entity, in-context control.
	 */
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import {
		builderRoleSelectEmptyHint,
		builderRoleSelectPlaceholder
	} from '$lib/paraglide/messages';

	type Role = { id: string; name: string; description?: string };

	interface Props {
		selectedIds: string[];
		roles: Role[];
		onChange: (ids: string[]) => void;
		/** Context label, e.g. "Visible to roles" or "Who can use this". */
		label?: string;
		/** Help text. Defaults to the shared "empty = everyone" hint; pass "" to hide. */
		help?: string;
		placeholder?: string;
		/** Enables inline role creation when provided. */
		onCreateRole?: (name: string) => Promise<Role> | Role;
		class?: string;
	}

	let {
		selectedIds,
		roles,
		onChange,
		label,
		help,
		placeholder,
		onCreateRole,
		class: className = ''
	}: Props = $props();

	const helpText = $derived(
		help === undefined ? (builderRoleSelectEmptyHint?.() ?? 'Leave empty to allow everyone.') : help
	);
</script>

<div class="role-select {className}">
	{#if label}<span class="role-select-label">{label}</span>{/if}
	<MobileMultiSelect
		{selectedIds}
		options={roles}
		getOptionId={(r) => r.id}
		getOptionLabel={(r) => r.name}
		getOptionDescription={(r) => r.description}
		allowCreate={!!onCreateRole}
		onCreateOption={onCreateRole}
		onSelectedIdsChange={onChange}
		placeholder={placeholder ?? builderRoleSelectPlaceholder?.() ?? 'All roles'}
		class="w-full"
	/>
	{#if helpText}<p class="role-select-help">{helpText}</p>{/if}
</div>

<style>
	.role-select {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.role-select-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.role-select-help {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}
</style>
