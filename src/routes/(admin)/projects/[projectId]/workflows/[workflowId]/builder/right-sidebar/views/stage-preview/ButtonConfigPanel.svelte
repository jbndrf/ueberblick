<script lang="ts">
	import { ArrowLeft, ArrowRight, FileText, Pencil, MapPin, Globe, Trash2, LogIn } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { getDefaultButtonColor } from './types';
	import type { StageAction, Role } from './types';

	interface Props {
		action: StageAction;
		roles: Role[];
		onLabelChange?: (label: string) => void;
		onColorChange?: (color: string) => void;
		onRolesChange?: (roleIds: string[]) => void;
		onDelete?: () => void;
		onOpenTool?: (toolType: string, toolId: string) => void;
		onClose?: () => void;
		onCreateRole?: (name: string) => Promise<Role>;
	}

	let { action, roles, onLabelChange, onColorChange, onRolesChange, onDelete, onOpenTool, onClose, onCreateRole }: Props = $props();

	let labelValue = $state(action.buttonLabel);
	let colorValue = $state(action.buttonColor || getDefaultButtonColor(action.type));

	// Keep in sync when action changes
	$effect(() => {
		labelValue = action.buttonLabel;
		colorValue = action.buttonColor || getDefaultButtonColor(action.type);
	});

	// Get current allowed_roles from the action
	const currentRoleIds = $derived(action.allowed_roles || []);

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

	function handleRolesChange(ids: string[]) {
		onRolesChange?.(ids);
	}
</script>

<div class="config-panel">
	<!-- Back button -->
	<button class="back-btn" onclick={() => onClose?.()}>
		<ArrowLeft class="w-3.5 h-3.5" />
		<span>Back</span>
	</button>

	<div class="config-content">
		<!-- Button Appearance -->
		<section class="config-section">
			<h4 class="section-title">Button Appearance</h4>

			<div class="space-y-3">
				<div class="space-y-1.5">
					<label class="text-xs text-muted-foreground" for="btn-label">Label</label>
					<Input
						id="btn-label"
						value={labelValue}
						oninput={handleLabelInput}
						placeholder="Button label..."
						class="h-8 text-sm"
					/>
				</div>

				<div class="space-y-1.5">
					<label class="text-xs text-muted-foreground" for="btn-color">Color</label>
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
					<label class="text-xs text-muted-foreground">Preview</label>
					<div class="flex justify-center py-2">
						<div
							class="inline-flex flex-col items-center justify-center
								min-w-[72px] max-w-[120px] min-h-[56px] px-3 py-2.5
								rounded-xl text-white text-xs font-semibold"
							style="background-color: {colorValue}"
						>
							{labelValue || 'Button'}
						</div>
					</div>
				</div>
			</div>
		</section>

		<Separator />

		<!-- Allowed Roles -->
		<section class="config-section">
			<h4 class="section-title">Allowed Roles</h4>
			<MobileMultiSelect
				selectedIds={currentRoleIds}
				options={roles}
				getOptionId={(r) => r.id}
				getOptionLabel={(r) => r.name}
				getOptionDescription={(r) => r.description}
				allowCreate={!!onCreateRole}
				onCreateOption={onCreateRole}
				onSelectedIdsChange={handleRolesChange}
				placeholder="All roles..."
				class="w-full"
			/>
			<p class="help-text">
				Only participants with these roles can use this button. Leave empty to allow all.
			</p>
		</section>

		<Separator />

		<!-- What happens when clicked -->
		{#if action.type === 'connection'}
			<section class="config-section">
				<h4 class="section-title">
					{action.isEntry ? 'Entry Journey' : 'When clicked'}
				</h4>
				<div class="journey-list">
					{#if action.isEntry}
						<div class="journey-item journey-destination">
							<span class="journey-number">
								<LogIn class="w-2.5 h-2.5" />
							</span>
							<span class="journey-label">
								Workflow entry point
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
							<span class="journey-label">Fill "{form.name}"</span>
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
								{tool.edit_mode === 'location' ? 'Edit location' : `Edit "${tool.name}"`}
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
								Moves to "{action.targetStage?.stage_name ?? '?'}"
							</span>
						</div>
					{/if}

					{#if action.forms.length === 0 && action.editTools.length === 0}
						<p class="text-xs text-muted-foreground py-2">
							No tools attached yet. Add forms or edit tools to this connection from the canvas edge menu.
						</p>
					{/if}
				</div>
			</section>
		{:else if action.type === 'stage_tool'}
			<section class="config-section">
				<h4 class="section-title">Tool</h4>
				<div class="space-y-2">
					<div class="text-sm text-muted-foreground">
						{#if action.tool.edit_mode === 'location'}
							Edit location (map picker)
						{:else}
							Edit fields
						{/if}
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() => onOpenTool?.('edit', action.tool.id)}
					>
						Open editor
					</Button>
				</div>
			</section>
		{:else if action.type === 'stage_form'}
			<section class="config-section">
				<h4 class="section-title">Form</h4>
				<div class="space-y-2">
					<div class="text-sm text-muted-foreground">
						{action.form.name || 'Unnamed form'}
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() => onOpenTool?.('form', action.form.id)}
					>
						Open editor
					</Button>
				</div>
			</section>
		{:else if action.type === 'global_tool'}
			<section class="config-section">
				<h4 class="section-title">Global Tool</h4>
				<div class="space-y-2">
					<div class="flex items-center gap-1.5 text-sm text-muted-foreground">
						<Globe class="w-3.5 h-3.5" />
						Available at all stages
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() => onOpenTool?.('edit', action.tool.id)}
					>
						Open editor
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
					Delete this {action.type === 'connection' ? 'action' : 'tool'}
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
