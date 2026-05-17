<script lang="ts">
	import { ArrowLeft, ArrowRight, FileText, Pencil, MapPin, Globe, Trash2, LogIn } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { getDefaultButtonColor } from './types';
	import type { StageAction, Role } from './types';
	import {
		editToolAnyRolesLabel,
		editToolAnyRolesPlaceholder,
		editToolRolesHelp,
		editToolSelfRolesLabel,
		editToolSelfRolesPlaceholder,
		stagePreviewButtonConfigAllRolesPlaceholder,
		stagePreviewButtonConfigAllowedRoles,
		stagePreviewButtonConfigAppearance,
		stagePreviewButtonConfigAvailableAllStages,
		stagePreviewButtonConfigBack,
		stagePreviewButtonConfigColor,
		stagePreviewButtonConfigDeleteAction,
		stagePreviewButtonConfigDeleteTool,
		stagePreviewButtonConfigEditFields,
		stagePreviewButtonConfigEditFieldsLabel,
		stagePreviewButtonConfigEditLocation,
		stagePreviewButtonConfigEditLocationMapPicker,
		stagePreviewButtonConfigEntryJourney,
		stagePreviewButtonConfigEntryPoint,
		stagePreviewButtonConfigFillForm,
		stagePreviewButtonConfigFormSectionTitle,
		stagePreviewButtonConfigGlobalToolTitle,
		stagePreviewButtonConfigLabel,
		stagePreviewButtonConfigLabelPlaceholder,
		stagePreviewButtonConfigMovesTo,
		stagePreviewButtonConfigNoTools,
		stagePreviewButtonConfigOpenEditor,
		stagePreviewButtonConfigPreview,
		stagePreviewButtonConfigPreviewFallback,
		stagePreviewButtonConfigRolesHelp,
		stagePreviewButtonConfigToolSectionTitle,
		stagePreviewButtonConfigUnnamedForm,
		stagePreviewButtonConfigWhenClicked
	} from '$lib/paraglide/messages';

	interface Props {
		action: StageAction;
		roles: Role[];
		onLabelChange?: (label: string) => void;
		onColorChange?: (color: string) => void;
		onRolesChange?: (roleIds: string[], scope?: 'self' | 'any') => void;
		onDelete?: () => void;
		onOpenTool?: (toolType: string, toolId: string) => void;
		onClose?: () => void;
		onCreateRole?: (name: string) => Promise<Role>;
	}

	let { action, roles, onLabelChange, onColorChange, onRolesChange, onDelete, onOpenTool, onClose, onCreateRole }: Props = $props();

	const isEditToolAction = $derived(action.type === 'stage_tool' || action.type === 'global_tool');

	let labelValue = $state(action.buttonLabel);
	let colorValue = $state(action.buttonColor || getDefaultButtonColor(action.type));

	// Keep in sync when action changes
	$effect(() => {
		labelValue = action.buttonLabel;
		colorValue = action.buttonColor || getDefaultButtonColor(action.type);
	});

	// Roles displayed in the panel. For edit-tool actions the legacy
	// allowed_roles is split into two scopes; for other actions there's a
	// single allowed_roles array.
	const currentRoleIds = $derived(
		action.type === 'connection' || action.type === 'stage_form'
			? (action.allowed_roles || [])
			: []
	);
	const currentAnyRoleIds = $derived(
		action.type === 'stage_tool' || action.type === 'global_tool'
			? (action.any_edit_roles || [])
			: []
	);
	const currentSelfRoleIds = $derived(
		action.type === 'stage_tool' || action.type === 'global_tool'
			? (action.self_edit_roles || [])
			: []
	);

	function handleLabelInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		labelValue = value;
		onLabelChange?.(value);
	}

	function handleColorInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		colorValue = value;
		onColorChange?.(value);
	}

	function handleRolesChange(ids: string[], scope?: 'self' | 'any') {
		onRolesChange?.(ids, scope);
	}
</script>

<div class="config-panel">
	<!-- Back button -->
	<button class="back-btn" onclick={() => onClose?.()}>
		<ArrowLeft class="w-3.5 h-3.5" />
		<span>{stagePreviewButtonConfigBack?.() ?? 'Back'}</span>
	</button>

	<div class="config-content">
		<!-- Button Appearance -->
		<section class="config-section">
			<h4 class="section-title">{stagePreviewButtonConfigAppearance?.() ?? 'Button Appearance'}</h4>

			<div class="space-y-3">
				<div class="space-y-1.5">
					<label class="text-xs text-muted-foreground" for="btn-label">{stagePreviewButtonConfigLabel?.() ?? 'Label'}</label>
					<Input
						id="btn-label"
						value={labelValue}
						oninput={handleLabelInput}
						placeholder={stagePreviewButtonConfigLabelPlaceholder?.() ?? 'Button label...'}
						class="h-8 text-sm"
					/>
				</div>

				<div class="space-y-1.5">
					<label class="text-xs text-muted-foreground" for="btn-color">{stagePreviewButtonConfigColor?.() ?? 'Color'}</label>
					<div class="flex items-center gap-2">
						<input
							id="btn-color"
							type="color"
							value={colorValue}
							oninput={handleColorInput}
							class="w-8 h-8 rounded border border-input cursor-pointer"
						/>
						<Input
							value={colorValue}
							oninput={handleColorInput}
							class="h-8 text-sm font-mono flex-1"
							placeholder={getDefaultButtonColor(action.type)}
						/>
					</div>
				</div>

				<!-- Live preview -->
				<div class="space-y-1.5">
					<div class="text-xs text-muted-foreground">{stagePreviewButtonConfigPreview?.() ?? 'Preview'}</div>
					<div class="flex justify-center py-2">
						<div
							class="inline-flex flex-col items-center justify-center
								min-w-[72px] max-w-[120px] min-h-[56px] px-3 py-2.5
								rounded-xl text-white text-xs font-semibold"
							style="background-color: {colorValue}"
						>
							{labelValue || (stagePreviewButtonConfigPreviewFallback?.() ?? 'Button')}
						</div>
					</div>
				</div>
			</div>
		</section>

		<Separator />

		<!-- Allowed Roles -->
		<section class="config-section">
			<h4 class="section-title">{stagePreviewButtonConfigAllowedRoles?.() ?? 'Allowed Roles'}</h4>
			{#if isEditToolAction}
				<label class="text-xs text-muted-foreground" for="any-edit-roles">
					{editToolAnyRolesLabel?.() ?? "Edit anyone's"}
				</label>
				<MobileMultiSelect
					selectedIds={currentAnyRoleIds}
					options={roles}
					getOptionId={(r) => r.id}
					getOptionLabel={(r) => r.name}
					getOptionDescription={(r) => r.description}
					allowCreate={!!onCreateRole}
					onCreateOption={onCreateRole}
					onSelectedIdsChange={(ids) => handleRolesChange(ids, 'any')}
					placeholder={editToolAnyRolesPlaceholder?.() ?? 'Roles that can edit any entry...'}
					class="w-full"
				/>
				<label class="text-xs text-muted-foreground mt-2 block" for="self-edit-roles">
					{editToolSelfRolesLabel?.() ?? 'Self-edit only'}
				</label>
				<MobileMultiSelect
					selectedIds={currentSelfRoleIds}
					options={roles}
					getOptionId={(r) => r.id}
					getOptionLabel={(r) => r.name}
					getOptionDescription={(r) => r.description}
					allowCreate={!!onCreateRole}
					onCreateOption={onCreateRole}
					onSelectedIdsChange={(ids) => handleRolesChange(ids, 'self')}
					placeholder={editToolSelfRolesPlaceholder?.() ?? 'Roles that can edit only their own...'}
					class="w-full"
				/>
				<p class="help-text">
					{editToolRolesHelp?.() ?? 'A role in both lists is treated as "Edit anyone\'s" and renders one button.'}
				</p>
			{:else}
				<MobileMultiSelect
					selectedIds={currentRoleIds}
					options={roles}
					getOptionId={(r) => r.id}
					getOptionLabel={(r) => r.name}
					getOptionDescription={(r) => r.description}
					allowCreate={!!onCreateRole}
					onCreateOption={onCreateRole}
					onSelectedIdsChange={(ids) => handleRolesChange(ids)}
					placeholder={stagePreviewButtonConfigAllRolesPlaceholder?.() ?? 'All roles...'}
					class="w-full"
				/>
				<p class="help-text">
					{stagePreviewButtonConfigRolesHelp?.() ?? 'Only participants with these roles can use this button. Leave empty to allow all.'}
				</p>
			{/if}
		</section>

		<Separator />

		<!-- What happens when clicked -->
		{#if action.type === 'connection'}
			<section class="config-section">
				<h4 class="section-title">
					{action.isEntry ? (stagePreviewButtonConfigEntryJourney?.() ?? 'Entry Journey') : (stagePreviewButtonConfigWhenClicked?.() ?? 'When clicked')}
				</h4>
				<div class="journey-list">
					{#if action.isEntry}
						<div class="journey-item journey-destination">
							<span class="journey-number">
								<LogIn class="w-2.5 h-2.5" />
							</span>
							<span class="journey-label">
								{stagePreviewButtonConfigEntryPoint?.() ?? 'Workflow entry point'}
							</span>
						</div>
					{/if}

					<!-- Forms attached to this connection -->
					{#each action.forms as form, i}
						<button
							class="journey-item"
							onclick={() => onOpenTool?.('form', form.id)}
						>
							<span class="journey-number">{i + 1}</span>
							<FileText class="w-3.5 h-3.5 text-muted-foreground" />
							<span class="journey-label">{stagePreviewButtonConfigFillForm?.({ name: form.name }) ?? `Fill "${form.name}"`}</span>
						</button>
					{/each}

					<!-- Edit tools attached to this connection -->
					{#each action.editTools as tool, i}
						<button
							class="journey-item"
							onclick={() => onOpenTool?.('edit', tool.id)}
						>
							<span class="journey-number">{action.forms.length + i + 1}</span>
							{#if tool.edit_mode === 'location'}
								<MapPin class="w-3.5 h-3.5 text-muted-foreground" />
							{:else}
								<Pencil class="w-3.5 h-3.5 text-muted-foreground" />
							{/if}
							<span class="journey-label">
								{tool.edit_mode === 'location' ? (stagePreviewButtonConfigEditLocation?.() ?? 'Edit location') : (stagePreviewButtonConfigEditFields?.({ name: tool.name }) ?? `Edit "${tool.name}"`)}
							</span>
						</button>
					{/each}

					<!-- Destination (only for non-entry connections) -->
					{#if !action.isEntry}
						<div class="journey-item journey-destination">
							<span class="journey-number">
								{action.forms.length + action.editTools.length + 1}
							</span>
							<ArrowRight class="w-3.5 h-3.5 text-muted-foreground" />
							<span class="journey-label">
								{stagePreviewButtonConfigMovesTo?.({ stageName: action.targetStage?.stage_name ?? '?' }) ?? `Moves to "${action.targetStage?.stage_name ?? '?'}"`}
							</span>
						</div>
					{/if}

					{#if action.forms.length === 0 && action.editTools.length === 0}
						<p class="text-xs text-muted-foreground py-2">
							{stagePreviewButtonConfigNoTools?.() ?? 'No tools attached yet. Add forms or edit tools to this connection from the canvas edge menu.'}
						</p>
					{/if}
				</div>
			</section>
		{:else if action.type === 'stage_tool'}
			<section class="config-section">
				<h4 class="section-title">{stagePreviewButtonConfigToolSectionTitle?.() ?? 'Tool'}</h4>
				<div class="space-y-2">
					<div class="text-sm text-muted-foreground">
						{#if action.tool.edit_mode === 'location'}
							{stagePreviewButtonConfigEditLocationMapPicker?.() ?? 'Edit location (map picker)'}
						{:else}
							{stagePreviewButtonConfigEditFieldsLabel?.() ?? 'Edit fields'}
						{/if}
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() => onOpenTool?.('edit', action.tool.id)}
					>
						{stagePreviewButtonConfigOpenEditor?.() ?? 'Open editor'}
					</Button>
				</div>
			</section>
		{:else if action.type === 'stage_form'}
			<section class="config-section">
				<h4 class="section-title">{stagePreviewButtonConfigFormSectionTitle?.() ?? 'Form'}</h4>
				<div class="space-y-2">
					<div class="text-sm text-muted-foreground">
						{action.form.name || (stagePreviewButtonConfigUnnamedForm?.() ?? 'Unnamed form')}
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() => onOpenTool?.('form', action.form.id)}
					>
						{stagePreviewButtonConfigOpenEditor?.() ?? 'Open editor'}
					</Button>
				</div>
			</section>
		{:else if action.type === 'global_tool'}
			<section class="config-section">
				<h4 class="section-title">{stagePreviewButtonConfigGlobalToolTitle?.() ?? 'Global Tool'}</h4>
				<div class="space-y-2">
					<div class="flex items-center gap-1.5 text-sm text-muted-foreground">
						<Globe class="w-3.5 h-3.5" />
						{stagePreviewButtonConfigAvailableAllStages?.() ?? 'Available at all stages'}
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() => onOpenTool?.('edit', action.tool.id)}
					>
						{stagePreviewButtonConfigOpenEditor?.() ?? 'Open editor'}
					</Button>
				</div>
			</section>
		{/if}

		<Separator />

		<!-- Delete -->
		{#if action.type !== 'global_tool'}
			<section class="config-section">
				<button
					class="text-xs text-destructive hover:text-destructive/80 transition-colors flex items-center gap-1.5"
					onclick={() => onDelete?.()}
				>
					<Trash2 class="w-3 h-3" />
					{action.type === 'connection' ? (stagePreviewButtonConfigDeleteAction?.() ?? 'Delete this action') : (stagePreviewButtonConfigDeleteTool?.() ?? 'Delete this tool')}
				</button>
			</section>
		{/if}
	</div>
</div>

<style>
	.config-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.625rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		border-bottom: 1px solid hsl(var(--border));
		cursor: pointer;
		transition: color 0.15s ease;
		background: none;
		border-left: none;
		border-right: none;
		border-top: none;
		width: 100%;
		text-align: left;
	}

	.back-btn:hover {
		color: hsl(var(--foreground));
	}

	.config-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
	}

	.config-section {
		margin-bottom: 0.75rem;
	}

	.section-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.5rem;
	}

	.help-text {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.375rem;
	}

	/* Journey list */
	.journey-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.journey-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		color: hsl(var(--foreground));
		background: none;
		border: 1px solid transparent;
		text-align: left;
		cursor: pointer;
		transition: all 0.15s ease;
		width: 100%;
	}

	.journey-item:hover:not(.journey-destination) {
		background: hsl(var(--accent));
		border-color: hsl(var(--border));
	}

	.journey-destination {
		cursor: default;
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}

	.journey-number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		font-size: 0.625rem;
		font-weight: 600;
		flex-shrink: 0;
	}

	.journey-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
