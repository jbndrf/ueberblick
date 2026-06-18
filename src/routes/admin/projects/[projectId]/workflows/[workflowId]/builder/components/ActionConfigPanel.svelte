<script lang="ts">
	/**
	 * L2 "configure this action button" panel — lives in the expandable sidebar.
	 * One panel for every action type (connection, stage form, edit tool,
	 * protocol tool): its button appearance plus the role group(s) that fit it.
	 * The action's *logic* (sentry, target, attached tools, edit-mode/fields)
	 * stays in its own inspector/editor; this is only the participant-facing
	 * appearance + who-can-use.
	 */
	import AppearancePanel from './AppearancePanel.svelte';
	import RoleSelect from './RoleSelect.svelte';
	import type { VisualConfig } from '$lib/workflow-builder';
	import { builderButtonAppearanceTitle } from '$lib/paraglide/messages';

	type Role = { id: string; name: string; description?: string };
	type RoleGroup = {
		label: string;
		help?: string;
		selectedIds: string[];
		onChange: (ids: string[]) => void;
	};

	interface Props {
		/** The action's canonical identity name — the button label's default. */
		name: string;
		visualConfig: VisualConfig | null | undefined;
		onVisualChange: (patch: Partial<VisualConfig>) => void;
		roleGroups: RoleGroup[];
		roles: Role[];
		onCreateRole?: (name: string) => Promise<Role> | Role;
	}

	let { name, visualConfig, onVisualChange, roleGroups, roles, onCreateRole }: Props = $props();
</script>

<div class="action-config">
	<span class="section-title">{builderButtonAppearanceTitle?.() ?? 'Button appearance'}</span>
	<AppearancePanel {visualConfig} onChange={onVisualChange} fallbackLabel={name} />
	{#each roleGroups as group (group.label)}
		<RoleSelect
			selectedIds={group.selectedIds}
			{roles}
			onChange={group.onChange}
			{onCreateRole}
			label={group.label}
			help={group.help}
		/>
	{/each}
</div>

<style>
	.action-config {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem;
	}

	.section-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}
</style>
