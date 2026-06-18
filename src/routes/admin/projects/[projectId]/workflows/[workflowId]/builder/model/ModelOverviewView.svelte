<script lang="ts">
	import {
		ArrowRight,
		Lock,
		Crosshair,
		Zap,
		Pencil,
		ClipboardList,
		FileText
	} from '@lucide/svelte';
	import ModelSection from './ModelSection.svelte';
	import PermissionsMatrixView from './permissions/PermissionsMatrixView.svelte';
	import InlineEdit from '../components/InlineEdit.svelte';
	import { getBuilderContext, openProtocolTool } from '../builder-context.svelte';
	import { fieldTypeLabels, type WorkflowConnection } from '$lib/workflow-builder';
	import {
		builderClickToRename,
		modelStagesTitle,
		modelConnectionsTitle,
		modelFormsTitle,
		modelFieldsTitle,
		modelToolsTitle,
		modelAutomationsTitle,
		modelPermissionsTitle,
		modelSentryChip,
		modelRolesAll,
		modelRolesCount,
		modelAttachGlobal,
		modelAttachStage,
		modelAttachConnection,
		modelAttachProtocol,
		modelFieldsCount,
		modelUsageCount,
		modelInheritedFromConnection,
		modelEmptySection,
		modelEntryBadge,
		modelShowOnCanvas,
		modelAddFieldDef,
		modelAddAutomation,
		modelWriteModeSingleton,
		modelWriteModeObservation,
		modelWriteModeComputed,
		catalogTriggerTransition,
		catalogTriggerFieldChange,
		catalogTriggerScheduled
	} from '$lib/paraglide/messages';

	type Props = { projectId: string };
	let { projectId }: Props = $props();

	const ctx = getBuilderContext();
	const { state, ui, roles } = ctx;

	// Clicking a row selects the entity so its inspector opens on the right (the
	// Model tab carries the same inspector as the canvas). Protocol tools route
	// through openProtocolTool (manual ones open their backing form).
	function selectEntity(sel: { type: string; id: string }) {
		if (sel.type === 'protocolTool') {
			openProtocolTool(ctx, sel.id);
			return;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		ui.select(sel as any);
	}
	function isSelected(type: string, id: string): boolean {
		const s = ui.selection;
		return s.type === type && 'id' in s && s.id === id;
	}
	// Only act when the row itself is focused — never when typing in a child input.
	function rowKeydown(e: KeyboardEvent, sel: { type: string; id: string }) {
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			selectEntity(sel);
		}
	}

	const stageName = (id: string | null | undefined) =>
		id ? (state.getStageById(id)?.data.stage_name ?? '?') : null;

	function rolesLabel(ids: string[] | undefined): string {
		const n = ids?.length ?? 0;
		if (n === 0) return modelRolesAll?.() ?? 'all roles';
		return modelRolesCount?.({ count: n }) ?? `${n} roles`;
	}

	function connLabel(conn: WorkflowConnection): string {
		const from = stageName(conn.from_stage_id);
		const to = stageName(conn.to_stage_id);
		return from ? `${from} → ${to}` : `→ ${to}`;
	}

	function formAttachment(form: { connection_id?: string; stage_id?: string; id: string }): string {
		if (state.getProtocolFormIds().has(form.id)) return modelAttachProtocol?.() ?? 'Protocol form';
		if (form.connection_id) {
			const conn = state.getConnectionById(form.connection_id)?.data;
			return (
				modelAttachConnection?.({ name: conn ? connLabel(conn) : '?' }) ??
				`Connection: ${conn ? connLabel(conn) : '?'}`
			);
		}
		if (form.stage_id)
			return (
				modelAttachStage?.({ name: stageName(form.stage_id) ?? '?' }) ??
				`Stage: ${stageName(form.stage_id)}`
			);
		return modelAttachGlobal?.() ?? 'Global';
	}

	const writeModeLabels: Record<string, string> = $derived({
		singleton: modelWriteModeSingleton?.() ?? 'Single value',
		observation: modelWriteModeObservation?.() ?? 'Observation',
		computed: modelWriteModeComputed?.() ?? 'Computed'
	});

	function triggerShortLabel(triggerType: string): string {
		if (triggerType === 'on_field_change')
			return catalogTriggerFieldChange?.() ?? 'on field change';
		if (triggerType === 'cron') return catalogTriggerScheduled?.() ?? 'scheduled';
		return catalogTriggerTransition?.() ?? 'on transition';
	}

	// All non-protocol-backing forms (those are listed via their protocol tool)
	const allForms = $derived(state.visibleForms.filter((f) => f.status !== 'deleted'));

	const tools = $derived.by(() => [
		...state.visibleEditTools.map((t) => ({
			id: t.data.id,
			kind: 'edit' as const,
			name: t.data.name,
			scope: t.data.is_global
				? (modelAttachGlobal?.() ?? 'Global')
				: t.data.connection_id
					? (modelAttachConnection?.({
							name: (() => {
								const c = state.getConnectionById(t.data.connection_id!)?.data;
								return c ? connLabel(c) : '?';
							})()
						}) ?? 'Connection')
					: (modelAttachStage?.({ name: stageName(t.data.stage_id?.[0]) ?? '?' }) ?? 'Stage'),
			roles: `${rolesLabel(t.data.any_edit_roles)}`
		})),
		...state.visibleProtocolTools.map((t) => ({
			id: t.data.id,
			kind: 'protocol' as const,
			name: t.data.name,
			scope: t.data.is_global
				? (modelAttachGlobal?.() ?? 'Global')
				: (modelAttachStage?.({ name: stageName(t.data.stage_id?.[0]) ?? '?' }) ?? 'Stage'),
			roles: rolesLabel(t.data.allowed_roles)
		}))
	]);
</script>

<div class="model-overview">
	<div class="model-scroll">
		<!-- Berechtigungen (Bulk-Matrix) — top: who can do what across the workflow -->
		<ModelSection title={modelPermissionsTitle?.() ?? 'Permissions'}>
			<div class="matrix-wrap">
				<PermissionsMatrixView builderState={state} {roles} {projectId} />
			</div>
		</ModelSection>

		<!-- Stufen -->
		<ModelSection title={modelStagesTitle?.() ?? 'Stages'} count={state.visibleStages.length}>
			{#if state.visibleStages.length === 0}
				<p class="empty">{modelEmptySection?.() ?? 'No entries.'}</p>
			{:else}
				<div class="rows">
					{#each state.visibleStages as stage (stage.data.id)}
						<div
							class="row"
							class:selected={isSelected('stage', stage.data.id)}
							role="button"
							tabindex="0"
							onclick={() => selectEntity({ type: 'stage', id: stage.data.id })}
							onkeydown={(e) => rowKeydown(e, { type: 'stage', id: stage.data.id })}
						>
							<span class="type-badge" data-type={stage.data.stage_type}
								>{stage.data.stage_type}</span
							>
							<InlineEdit
								class="inline-input"
								value={stage.data.stage_name}
								onCommit={(v) => state.updateStage(stage.data.id, { stage_name: v })}
								editTitle={builderClickToRename?.() ?? 'Click to rename'}
							/>
							<button
								class="reveal-btn"
								title={modelShowOnCanvas?.() ?? 'Show on canvas'}
								onclick={(e) => {
									e.stopPropagation();
									ui.reveal({ type: 'stage', id: stage.data.id });
								}}
							>
								<Crosshair class="h-3.5 w-3.5" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</ModelSection>

		<!-- Verbindungen -->
		<ModelSection
			title={modelConnectionsTitle?.() ?? 'Connections'}
			count={state.visibleConnections.length}
		>
			{#if state.visibleConnections.length === 0}
				<p class="empty">{modelEmptySection?.() ?? 'No entries.'}</p>
			{:else}
				<div class="rows">
					{#each state.visibleConnections as conn (conn.data.id)}
						<div
							class="row"
							class:selected={isSelected('connection', conn.data.id)}
							role="button"
							tabindex="0"
							onclick={() => selectEntity({ type: 'connection', id: conn.data.id })}
							onkeydown={(e) => rowKeydown(e, { type: 'connection', id: conn.data.id })}
						>
							{#if !conn.data.from_stage_id}
								<span class="type-badge" data-type="start">{modelEntryBadge?.() ?? 'Entry'}</span>
							{:else}
								<ArrowRight class="row-icon h-3.5 w-3.5" />
							{/if}
							<span class="row-path">{connLabel(conn.data)}</span>
							<InlineEdit
								class="inline-input"
								value={conn.data.action_name}
								onCommit={(v) => state.updateConnection(conn.data.id, { action_name: v })}
								editTitle={builderClickToRename?.() ?? 'Click to rename'}
							/>
							{#if (conn.data.sentry?.length ?? 0) > 0}
								<button
									class="sentry-chip"
									onclick={(e) => {
										e.stopPropagation();
										ui.reveal({ type: 'connection', id: conn.data.id });
									}}
								>
									<Lock class="h-3 w-3" />
									{modelSentryChip?.({ count: conn.data.sentry?.length ?? 0 }) ??
										`guarded: ${conn.data.sentry?.length}`}
								</button>
							{/if}
							<span class="row-meta">{rolesLabel(conn.data.allowed_roles)}</span>
							<button
								class="reveal-btn"
								title={modelShowOnCanvas?.() ?? 'Show on canvas'}
								onclick={(e) => {
									e.stopPropagation();
									ui.reveal({ type: 'connection', id: conn.data.id });
								}}
							>
								<Crosshair class="h-3.5 w-3.5" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</ModelSection>

		<!-- Formulare -->
		<ModelSection title={modelFormsTitle?.() ?? 'Forms'} count={allForms.length}>
			{#if allForms.length === 0}
				<p class="empty">{modelEmptySection?.() ?? 'No entries.'}</p>
			{:else}
				<div class="rows">
					{#each allForms as form (form.data.id)}
						<div
							class="row"
							class:selected={isSelected('form', form.data.id)}
							role="button"
							tabindex="0"
							onclick={() => selectEntity({ type: 'form', id: form.data.id })}
							onkeydown={(e) => rowKeydown(e, { type: 'form', id: form.data.id })}
						>
							<FileText class="row-icon h-3.5 w-3.5" />
							<InlineEdit
								class="inline-input"
								value={form.data.name}
								onCommit={(v) => state.updateForm(form.data.id, { name: v })}
								editTitle={builderClickToRename?.() ?? 'Click to rename'}
							/>
							<span class="row-meta">{formAttachment(form.data)}</span>
							<span class="row-meta"
								>{modelFieldsCount?.({ count: state.getFieldsForForm(form.data.id).length }) ??
									`${state.getFieldsForForm(form.data.id).length} fields`}</span
							>
							<span class="row-meta">
								{#if form.data.connection_id}
									{modelInheritedFromConnection?.() ?? 'inherited from connection'}
								{:else}
									{rolesLabel(form.data.allowed_roles)}
								{/if}
							</span>
							<button
								class="reveal-btn"
								title={modelShowOnCanvas?.() ?? 'Show on canvas'}
								onclick={(e) => {
									e.stopPropagation();
									ui.reveal({ type: 'form', id: form.data.id });
								}}
							>
								<Crosshair class="h-3.5 w-3.5" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</ModelSection>

		<!-- Felder -->
		<ModelSection
			title={modelFieldsTitle?.() ?? 'Fields'}
			count={state.visibleFieldDefs.length}
			onAdd={() => {
				const def = state.addFieldDef({ label: state.uniqueDefLabel('New Field') });
				ui.reveal({ type: 'fieldDef', id: def.id });
			}}
			addLabel={modelAddFieldDef?.() ?? 'Add field'}
		>
			{#if state.visibleFieldDefs.length === 0}
				<p class="empty">{modelEmptySection?.() ?? 'No entries.'}</p>
			{:else}
				<div class="rows">
					{#each state.visibleFieldDefs as def (def.data.id)}
						<div
							class="row"
							class:selected={isSelected('fieldDef', def.data.id)}
							role="button"
							tabindex="0"
							onclick={() => selectEntity({ type: 'fieldDef', id: def.data.id })}
							onkeydown={(e) => rowKeydown(e, { type: 'fieldDef', id: def.data.id })}
						>
							<InlineEdit
								class="inline-input"
								value={def.data.label}
								onCommit={(v) => state.updateFieldDef(def.data.id, { label: v })}
								editTitle={builderClickToRename?.() ?? 'Click to rename'}
							/>
							<span class="row-meta"
								>{fieldTypeLabels[def.data.field_type] ?? def.data.field_type}</span
							>
							<span class="row-meta"
								>{writeModeLabels[def.data.write_mode] ?? def.data.write_mode}</span
							>
							<span class="row-meta"
								>{modelUsageCount?.({ count: state.getRefsForDef(def.data.id).length }) ??
									`${state.getRefsForDef(def.data.id).length}×`}</span
							>
							<span class="row-meta">{rolesLabel(def.data.view_roles)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</ModelSection>

		<!-- Tools -->
		<ModelSection title={modelToolsTitle?.() ?? 'Tools'} count={tools.length}>
			{#if tools.length === 0}
				<p class="empty">{modelEmptySection?.() ?? 'No entries.'}</p>
			{:else}
				<div class="rows">
					{#each tools as tool (tool.id)}
						{@const toolSel = {
							type: tool.kind === 'protocol' ? 'protocolTool' : 'editTool',
							id: tool.id
						}}
						<div
							class="row"
							class:selected={isSelected(toolSel.type, tool.id)}
							role="button"
							tabindex="0"
							onclick={() => selectEntity(toolSel)}
							onkeydown={(e) => rowKeydown(e, toolSel)}
						>
							{#if tool.kind === 'edit'}
								<Pencil class="row-icon h-3.5 w-3.5" />
							{:else}
								<ClipboardList class="row-icon h-3.5 w-3.5" />
							{/if}
							<span class="row-label">{tool.name}</span>
							<span class="row-meta">{tool.scope}</span>
							<span class="row-meta">{tool.roles}</span>
							<button
								class="reveal-btn"
								title={modelShowOnCanvas?.() ?? 'Show on canvas'}
								onclick={(e) => {
									e.stopPropagation();
									if (tool.kind === 'protocol') {
										ui.view = 'canvas';
										openProtocolTool(ctx, tool.id);
									} else {
										ui.reveal({ type: 'editTool', id: tool.id });
									}
								}}
							>
								<Crosshair class="h-3.5 w-3.5" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</ModelSection>

		<!-- Automatisierungen -->
		<ModelSection
			title={modelAutomationsTitle?.() ?? 'Automations'}
			count={state.visibleAutomations.length}
			onAdd={() => {
				const automation = state.addAutomation('on_transition');
				ui.reveal({ type: 'automation', id: automation.id });
			}}
			addLabel={modelAddAutomation?.() ?? 'Add automation'}
		>
			{#if state.visibleAutomations.length === 0}
				<p class="empty">{modelEmptySection?.() ?? 'No entries.'}</p>
			{:else}
				<div class="rows">
					{#each state.visibleAutomations as automation (automation.data.id)}
						<div
							class="row"
							class:selected={isSelected('automation', automation.data.id)}
							role="button"
							tabindex="0"
							onclick={() => selectEntity({ type: 'automation', id: automation.data.id })}
							onkeydown={(e) => rowKeydown(e, { type: 'automation', id: automation.data.id })}
						>
							<Zap class="row-icon h-3.5 w-3.5" />
							<InlineEdit
								class="inline-input"
								value={automation.data.name}
								onCommit={(v) => state.updateAutomation(automation.data.id, { name: v })}
								editTitle={builderClickToRename?.() ?? 'Click to rename'}
							/>
							<span class="row-meta">{triggerShortLabel(automation.data.trigger_type)}</span>
							<input
								type="checkbox"
								class="enable-toggle"
								checked={automation.data.is_enabled}
								onclick={(e) => e.stopPropagation()}
								onchange={(e) =>
									state.updateAutomation(automation.data.id, {
										is_enabled: e.currentTarget.checked
									})}
							/>
							<button
								class="reveal-btn"
								title={modelShowOnCanvas?.() ?? 'Show on canvas'}
								onclick={(e) => {
									e.stopPropagation();
									ui.reveal({ type: 'automation', id: automation.data.id });
								}}
							>
								<Crosshair class="h-3.5 w-3.5" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</ModelSection>
	</div>
</div>

<style>
	.model-overview {
		flex: 1;
		overflow: hidden;
		display: flex;
	}

	.model-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 1100px;
		margin: 0 auto;
		width: 100%;
	}

	.rows {
		display: flex;
		flex-direction: column;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.375rem 0.5rem;
		margin: 0 -0.25rem;
		border-radius: 0.375rem;
		border-bottom: 1px solid hsl(var(--border) / 0.6);
		cursor: pointer;
		transition: background 0.12s ease;
	}

	.row:hover {
		background: hsl(var(--muted) / 0.6);
	}

	.row.selected {
		background: hsl(var(--primary) / 0.1);
		box-shadow: inset 2px 0 0 hsl(var(--primary));
	}

	.row:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: -2px;
	}

	.row:last-child {
		border-bottom: none;
	}

	.row :global(.row-icon) {
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.row-path {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}

	.row-label {
		flex: 1;
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
	}

	.row-meta {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}

	/* Applied to InlineEdit's rendered button/input (a child component), so :global. */
	:global(.model-overview .inline-input) {
		flex: 1;
		min-width: 8rem;
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		padding: 0.2rem 0.375rem;
		transition: all 0.15s ease;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		cursor: text;
	}

	:global(.model-overview .inline-input:hover) {
		border-color: hsl(var(--border));
	}

	:global(.model-overview .inline-input:focus) {
		outline: none;
		border-color: hsl(var(--primary));
		background: hsl(var(--card));
	}

	.type-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		padding: 0.1rem 0.375rem;
		border-radius: 0.25rem;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.type-badge[data-type='start'] {
		background: hsl(142 76% 92%);
		color: hsl(142 71% 28%);
	}

	.type-badge[data-type='end'] {
		background: hsl(0 86% 94%);
		color: hsl(0 72% 40%);
	}

	.sentry-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		padding: 0.125rem 0.4rem;
		border-radius: 9999px;
		border: 1px solid hsl(32 95% 44% / 0.4);
		background: hsl(38 92% 50% / 0.1);
		color: hsl(32 95% 38%);
		cursor: pointer;
		white-space: nowrap;
	}

	.reveal-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 0.25rem;
		border: none;
		background: transparent;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		flex-shrink: 0;
	}

	.reveal-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--accent));
	}

	.empty {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.enable-toggle {
		flex-shrink: 0;
		accent-color: hsl(var(--primary));
		cursor: pointer;
	}

	.matrix-wrap {
		min-height: 200px;
	}
</style>
