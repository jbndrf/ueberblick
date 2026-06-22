<script lang="ts">
	/**
	 * The ONE expandable config sidebar. Every "Button & role settings" gear —
	 * whether on a roll-bar action or in an entity's own header — sets
	 * `ui.configTarget`, and this single panel renders that action's appearance +
	 * roles. Same thing, same place, every time.
	 */
	import { Lock, X } from '@lucide/svelte';
	import { getBuilderContext } from '../builder-context.svelte';
	import ActionConfigPanel from './ActionConfigPanel.svelte';
	import FieldDefinitionEditor from './FieldDefinitionEditor.svelte';
	import SentryEditor from '../right-sidebar/views/properties/panels/SentryEditor.svelte';
	import type { SentryClause } from '$lib/workflow-builder';
	import {
		propertiesEdgePropertyAllowedRoles,
		builderEditToolAnyRoles,
		builderEditToolOwnRoles,
		builderEditToolOwnRolesHint,
		builderProtocolToolRoles,
		stagePreviewButtonRoleSettings,
		connectionInspectorSentryTitle,
		toolSentryHint,
		toolSentryIntro,
		commonClose
	} from '$lib/paraglide/messages';

	const { state: builderState, ui, roles, createRole } = getBuilderContext();

	const allowedLabel = $derived(propertiesEdgePropertyAllowedRoles?.() ?? 'Allowed Roles');

	// A field opens its WHOLE definition in one view — there's no appearance/model
	// split for a field; everything is the definition (visibility included).
	const fieldDefId = $derived(ui.configTarget?.kind === 'field' ? ui.configTarget.id : null);
	const fieldDef = $derived(fieldDefId ? builderState.getFieldDefById(fieldDefId) : null);

	const cfg = $derived.by(() => {
		const t = ui.configTarget;
		if (!t) return null;

		if (t.kind === 'connection') {
			const c = builderState.getConnectionById(t.id)?.data;
			if (!c) return null;
			return {
				name: c.action_name,
				visualConfig: c.visual_config,
				onVisualChange: (patch: Record<string, unknown>) =>
					builderState.updateConnection(t.id, { visual_config: { ...c.visual_config, ...patch } }),
				roleGroups: [
					{
						label: allowedLabel,
						selectedIds: c.allowed_roles ?? [],
						onChange: (ids: string[]) => builderState.updateConnection(t.id, { allowed_roles: ids })
					}
				],
				// Connections edit their sentry in the ConnectionInspector body, not here.
				sentry: [] as SentryClause[],
				onSentryChange: undefined as ((next: SentryClause[]) => void) | undefined
			};
		}

		if (t.kind === 'form') {
			const f = builderState.getFormById(t.id)?.data;
			if (!f) return null;
			return {
				name: f.name,
				visualConfig: f.visual_config,
				onVisualChange: (patch: Record<string, unknown>) =>
					builderState.updateForm(t.id, { visual_config: { ...f.visual_config, ...patch } }),
				roleGroups: [
					{
						label: allowedLabel,
						selectedIds: f.allowed_roles ?? [],
						onChange: (ids: string[]) => builderState.updateForm(t.id, { allowed_roles: ids })
					}
				],
				sentry: f.sentry ?? [],
				onSentryChange: (next: SentryClause[]) =>
					builderState.updateForm(t.id, { sentry: next.length ? next : null })
			};
		}

		if (t.kind === 'editTool') {
			const e = builderState.getEditToolById(t.id)?.data;
			if (!e) return null;
			return {
				name: e.name,
				visualConfig: e.visual_config,
				onVisualChange: (patch: Record<string, unknown>) =>
					builderState.updateEditTool(t.id, { visual_config: { ...e.visual_config, ...patch } }),
				roleGroups: [
					{
						label: builderEditToolAnyRoles?.() ?? 'Who can edit',
						selectedIds: e.any_edit_roles ?? [],
						onChange: (ids: string[]) => builderState.updateEditTool(t.id, { any_edit_roles: ids })
					},
					{
						label: builderEditToolOwnRoles?.() ?? 'Edit own entries only',
						help:
							builderEditToolOwnRolesHint?.() ?? 'These roles may edit only entries they created.',
						selectedIds: e.self_edit_roles ?? [],
						onChange: (ids: string[]) => builderState.updateEditTool(t.id, { self_edit_roles: ids })
					}
				],
				sentry: e.sentry ?? [],
				onSentryChange: (next: SentryClause[]) =>
					builderState.updateEditTool(t.id, { sentry: next.length ? next : null })
			};
		}

		// protocolTool
		const p = builderState.getProtocolToolById(t.id)?.data;
		if (!p) return null;
		return {
			name: p.name,
			visualConfig: p.visual_config,
			onVisualChange: (patch: Record<string, unknown>) =>
				builderState.updateProtocolTool(t.id, { visual_config: { ...p.visual_config, ...patch } }),
			roleGroups: [
				{
					label: builderProtocolToolRoles?.() ?? 'Who can use this',
					selectedIds: p.allowed_roles ?? [],
					onChange: (ids: string[]) => builderState.updateProtocolTool(t.id, { allowed_roles: ids })
				}
			],
			sentry: p.sentry ?? [],
			onSentryChange: (next: SentryClause[]) =>
				builderState.updateProtocolTool(t.id, { sentry: next.length ? next : null })
		};
	});
</script>

{#if cfg || fieldDef}
	<aside class="config-sidebar">
		<header class="config-head">
			<div class="config-head-titles">
				{#if fieldDef}
					<span class="config-head-name">{fieldDef.label}</span>
				{:else if cfg}
					<span class="config-head-eyebrow">
						{stagePreviewButtonRoleSettings?.() ?? 'Button & role settings'}
					</span>
					<span class="config-head-name">{cfg.name}</span>
				{/if}
			</div>
			<button
				class="config-close"
				onclick={() => (ui.configTarget = null)}
				aria-label={commonClose?.() ?? 'Close'}
			>
				<X class="h-4 w-4" />
			</button>
		</header>
		<div class="config-body">
			{#if fieldDef && fieldDefId}
				<FieldDefinitionEditor defId={fieldDefId} />
			{:else if cfg}
				<ActionConfigPanel
					name={cfg.name}
					visualConfig={cfg.visualConfig}
					onVisualChange={cfg.onVisualChange}
					roleGroups={cfg.roleGroups}
					{roles}
					onCreateRole={createRole}
				/>
				{#if cfg.onSentryChange}
					<section class="sentry-block">
						<header class="sentry-head">
							<Lock class="h-3.5 w-3.5" />
							<span class="sentry-title">
								{connectionInspectorSentryTitle?.() ?? 'Sentry (availability)'}{(cfg.sentry
									?.length ?? 0) > 0
									? ` · ${cfg.sentry?.length}`
									: ''}
							</span>
						</header>
						<p class="sentry-hint">
							{toolSentryHint?.() ??
								'This tool is only offered when all conditions hold (evaluated on the device, offline-capable).'}
						</p>
						<SentryEditor
							sentry={cfg.sentry ?? []}
							fieldDefs={builderState.visibleFieldDefs.map((d) => d.data)}
							onChange={cfg.onSentryChange}
							introText={toolSentryIntro?.() ?? 'Show this tool only when…'}
						/>
					</section>
				{/if}
			{/if}
		</div>
	</aside>
{/if}

<style>
	.config-sidebar {
		width: 300px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		background: hsl(var(--card));
		border-left: 1px solid oklch(0.88 0.01 250);
		box-shadow: -2px 0 12px oklch(0 0 0 / 0.05);
		overflow: hidden;
	}

	:global(.dark) .config-sidebar {
		border-left-color: oklch(1 0 0 / 20%);
	}

	.config-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.4);
		flex-shrink: 0;
	}

	.config-head-titles {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.config-head-eyebrow {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.config-head-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.config-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 0.375rem;
		border: none;
		background: transparent;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.config-close:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.config-body {
		flex: 1;
		overflow-y: auto;
	}

	.sentry-block {
		padding: 0.75rem;
		border-top: 1px solid hsl(var(--border));
	}

	.sentry-head {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: hsl(32 95% 44%);
		margin-bottom: 0.25rem;
	}

	.sentry-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.sentry-hint {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin: 0 0 0.5rem;
		line-height: 1.4;
	}
</style>
