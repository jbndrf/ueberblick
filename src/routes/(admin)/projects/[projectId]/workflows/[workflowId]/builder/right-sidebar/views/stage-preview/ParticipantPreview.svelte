<script lang="ts">
	import { X, Plus, ArrowRight, Wrench, MapPin, Globe, FileText } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { FormRenderer } from '$lib/components/form-renderer';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';
	import type { WorkflowStage } from '$lib/workflow-builder';
	import { getDefaultButtonColor } from './types';
	import type { StageAction, TimelineStage, Role, IncomingFormGroup } from './types';

	interface Props {
		stage: WorkflowStage;
		actions: StageAction[];
		globalTools: StageAction[];
		timeline: TimelineStage[];
		roles: Role[];
		incomingForms?: IncomingFormGroup[];
		selectedButtonId?: string | null;
		roleFilter?: string;
		// Handlers
		onButtonSelect?: (actionId: string) => void;
		onButtonHover?: (actionId: string | null) => void;
		onAddButtonClick?: () => void;
		onStageRename?: (name: string) => void;
		onStageRolesChange?: (roleIds: string[]) => void;
		onStageDelete?: () => void;
		onClose?: () => void;
		onRoleFilterChange?: (roleId: string) => void;
		onCreateRole?: (name: string) => Promise<Role>;
	}

	let {
		stage,
		actions,
		globalTools,
		timeline,
		roles,
		incomingForms = [],
		selectedButtonId = null,
		roleFilter = 'all',
		onButtonSelect,
		onButtonHover,
		onAddButtonClick,
		onStageRename,
		onStageRolesChange,
		onStageDelete,
		onClose,
		onRoleFilterChange,
		onCreateRole
	}: Props = $props();

	// Local state
	let activeTab = $state<string>('overview');
	let editingName = $state(false);
	let nameInputValue = $state(stage.stage_name);

	// Keep nameInputValue in sync when stage changes externally
	$effect(() => {
		nameInputValue = stage.stage_name;
	});

	// All buttons to display (actions + global tools)
	const allButtons = $derived([...actions, ...globalTools]);

	// Filter buttons by role
	const visibleButtons = $derived.by(() => {
		if (roleFilter === 'all') return allButtons;
		return allButtons.map((btn) => {
			const allowedRoles = btn.allowed_roles || [];
			const isVisible = allowedRoles.length === 0 || allowedRoles.includes(roleFilter);
			return { ...btn, _dimmed: !isVisible };
		});
	});

	// Stage info counts
	const incomingCount = $derived(
		timeline.filter((s) => s.status === 'completed').length
	);
	const outgoingCount = $derived(
		actions.filter((a) => a.type === 'connection' && !('isEntry' in a && a.isEntry)).length
	);
	const toolCount = $derived(
		actions.filter((a) => a.type !== 'connection').length
	);
	// Stage visibility roles
	const selectedRoleIds = $derived(stage.visible_to_roles || []);

	function handleRolesChange(ids: string[]) {
		onStageRolesChange?.(ids);
	}

	function handleNameBlur() {
		editingName = false;
		if (nameInputValue.trim() && nameInputValue !== stage.stage_name) {
			onStageRename?.(nameInputValue.trim());
		}
	}

	function handleNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			(e.target as HTMLInputElement).blur();
		} else if (e.key === 'Escape') {
			nameInputValue = stage.stage_name;
			editingName = false;
		}
	}

	function getDisplayColor(action: StageAction): string {
		return action.buttonColor || getDefaultButtonColor(action.type);
	}

	function getActionTypeIcon(action: StageAction) {
		if (action.type === 'connection') {
			return ArrowRight;
		}
		if (action.type === 'global_tool') return Globe;
		if (action.type === 'stage_tool' && action.tool.edit_mode === 'location') return MapPin;
		if (action.type === 'stage_form') return FileText;
		return Wrench;
	}

	// Convert ToolsFormField[] to FormFieldWithValue[] for FormRenderer
	function toFormFields(fields: IncomingFormGroup['fields']): FormFieldWithValue[] {
		return fields as unknown as FormFieldWithValue[];
	}

	function handleWheelScroll(e: WheelEvent) {
		if (e.deltaY !== 0) {
			e.preventDefault();
			(e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
		}
	}
</script>

<!-- Participant Sidebar Lookalike -->
<div class="participant-preview">
	<!-- ================================================================== -->
	<!-- Header (exact ModuleShell styling) -->
	<!-- ================================================================== -->
	<div
		class="flex items-center justify-between p-4 bg-primary text-primary-foreground rounded-t-xl flex-shrink-0 border-b border-border"
	>
		<div class="flex-1 min-w-0 space-y-0.5">
			<div class="flex items-center gap-2">
				{#if editingName}
					<input
						class="text-lg font-semibold bg-transparent border-b border-primary-foreground/40 outline-none w-full placeholder:text-primary-foreground/50"
						bind:value={nameInputValue}
						onblur={handleNameBlur}
						onkeydown={handleNameKeydown}
						autofocus
					/>
				{:else}
					<button
						class="text-lg font-semibold truncate text-left hover:opacity-80 transition-opacity cursor-text"
						onclick={() => (editingName = true)}
						title={m.stagePreviewParticipantEditStageName?.() ?? 'Click to edit stage name'}
					>
						{stage.stage_name}
					</button>
				{/if}
			</div>
		</div>

		<div class="flex items-center gap-1 ml-2">
			<!-- Role filter -->
			<select
				class="text-xs bg-primary-foreground/10 rounded px-2 py-1 border-0 outline-none cursor-pointer text-primary-foreground"
				value={roleFilter}
				onchange={(e) => onRoleFilterChange?.(e.currentTarget.value)}
			>
				<option value="all">{m.stagePreviewParticipantAllRoles?.() ?? 'All roles'}</option>
				{#each roles as role}
					<option value={role.id}>{role.name}</option>
				{/each}
			</select>

			<!-- Close -->
			<button
				class="flex items-center justify-center p-2 rounded hover:bg-primary-foreground/10 transition-colors"
				onclick={() => onClose?.()}
				aria-label={m.commonClose?.() ?? 'Close'}
			>
				<X class="w-4 h-4" />
			</button>
		</div>
	</div>

	<!-- ================================================================== -->
	<!-- Content -->
	<!-- ================================================================== -->
	<div class="flex-1 min-h-0 overflow-y-auto">
		<div class="p-4">
			<!-- Action Roll Bar -->
			<div class="mb-4">
				<div class="flex items-stretch gap-2">
					<!-- [+] pinned left -->
					<button
						class="flex flex-col items-center justify-center
							min-w-[56px] min-h-[56px] px-3 py-2.5
							rounded-xl flex-shrink-0
							border-2 border-dashed border-muted-foreground/30
							text-muted-foreground/50
							hover:border-muted-foreground/50 hover:text-muted-foreground/80
							transition-all duration-200 ease-out
							hover:scale-[1.02] active:scale-[0.98]"
						onclick={() => onAddButtonClick?.()}
						title={m.stagePreviewParticipantAddActionButton?.() ?? 'Add action button'}
					>
						<Plus class="w-5 h-5" />
					</button>

					<!-- Scrollable action buttons -->
					<div
						class="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin flex-1 min-w-0"
						onwheel={handleWheelScroll}
					>
						{#each visibleButtons as action}
							{@const isDimmed = '_dimmed' in action && action._dimmed}
							<button
								class="action-btn action-btn-colored group relative flex flex-col items-center justify-center
									min-w-[72px] max-w-[120px] min-h-[56px] px-3 py-2.5
									rounded-xl flex-shrink-0
									transition-all duration-200 ease-out
									hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]"
								class:action-btn-selected={selectedButtonId === action.id}
								class:opacity-40={isDimmed}
								style="--btn-color: {getDisplayColor(action)}"
								onclick={() => onButtonSelect?.(action.id)}
								onmouseenter={() => onButtonHover?.(action.id)}
								onmouseleave={() => onButtonHover?.(null)}
							>
								<!-- Type indicator (top-right corner) -->
								<span class="absolute top-1 right-1 opacity-60">
									<svelte:component
										this={getActionTypeIcon(action)}
										class="w-2.5 h-2.5"
									/>
								</span>
								<span
									class="text-xs font-semibold text-center leading-snug line-clamp-2"
								>
									{action.buttonLabel}
								</span>
							</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- Tabs (exact participant styling) -->
			<Tabs.Root
				value={activeTab}
				onValueChange={(v) => (activeTab = v as string)}
				class="flex-1 flex flex-col min-h-0"
			>
				<Tabs.List
					class="grid w-full flex-shrink-0"
					style="grid-template-columns: repeat(3, minmax(0, 1fr))"
				>
					<Tabs.Trigger value="overview" class="text-xs sm:text-sm">
						{m.stagePreviewParticipantTabOverview?.() ?? 'Overview'}
					</Tabs.Trigger>
					<Tabs.Trigger value="details" class="text-xs sm:text-sm">
						{m.stagePreviewParticipantTabDetails?.() ?? 'Details'}
					</Tabs.Trigger>
					<Tabs.Trigger value="settings" class="text-xs sm:text-sm">
						{m.stagePreviewParticipantTabSettings?.() ?? 'Settings'}
					</Tabs.Trigger>
				</Tabs.List>

				<!-- ====================================================== -->
				<!-- Overview Tab -->
				<!-- ====================================================== -->
				<Tabs.Content value="overview" class="pt-4">
					<div class="space-y-4">
						<!-- Progress Timeline (exact participant styling) -->
						<div class="space-y-3">
							<h4 class="text-sm font-semibold">{m.stagePreviewParticipantProgress?.() ?? 'Progress'}</h4>

							<div class="space-y-2">
								{#each timeline as timelineStage, index}
									<div class="flex items-start gap-3">
										<!-- Dot -->
										<div class="mt-1 shrink-0">
											{#if timelineStage.status === 'completed'}
												<div class="h-4 w-4 rounded-full bg-green-400"></div>
											{:else if timelineStage.status === 'current'}
												<div
													class="h-4 w-4 rounded-full bg-muted-foreground"
												></div>
											{:else}
												<div
													class="h-4 w-4 rounded-full border-2 border-muted-foreground"
												></div>
											{/if}
										</div>

										<!-- Content -->
										<div class="min-w-0 flex-1">
											{#if timelineStage.status === 'current'}
												<!-- Current stage name is editable -->
												<button
													class="text-sm font-medium text-foreground text-left hover:opacity-80 cursor-text"
													onclick={() => (editingName = true)}
												>
													{timelineStage.name}
												</button>
											{:else}
												<div
													class="text-sm font-medium {timelineStage.status ===
													'completed'
														? 'text-foreground'
														: 'text-muted-foreground'}"
												>
													{timelineStage.name}
												</div>
											{/if}
										</div>
									</div>

									<!-- Connector Line -->
									{#if index < timeline.length - 1}
										<div class="ml-2 h-3 w-px bg-border"></div>
									{/if}
								{/each}
							</div>
						</div>

						<Separator />

						<!-- Stage Info Cards (same card styling as participant) -->
						<div class="grid grid-cols-2 gap-2">
							<Card.Root>
								<Card.Content class="p-3">
									<div
										class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"
									>
										<ArrowRight class="w-3 h-3" />
										{m.stagePreviewParticipantOutgoing?.() ?? 'Outgoing'}
									</div>
									<div class="text-xs font-medium text-foreground">
										{outgoingCount}
										{(outgoingCount === 1 ? (m.stagePreviewParticipantConnection?.() ?? 'connection') : (m.stagePreviewParticipantConnections?.() ?? 'connections'))}
									</div>
								</Card.Content>
							</Card.Root>
							<Card.Root>
								<Card.Content class="p-3">
									<div
										class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"
									>
										<Wrench class="w-3 h-3" />
										{m.stagePreviewParticipantTools?.() ?? 'Tools'}
									</div>
									<div class="text-xs font-medium text-foreground">
										{toolCount}
										{(toolCount === 1 ? (m.stagePreviewParticipantTool?.() ?? 'tool') : (m.stagePreviewParticipantToolsCount?.() ?? 'tools'))}
									</div>
								</Card.Content>
							</Card.Root>
						</div>
					</div>
				</Tabs.Content>

				<!-- ====================================================== -->
				<!-- Details Tab -->
				<!-- ====================================================== -->
				<Tabs.Content value="details" class="pt-4">
					<div class="space-y-4">
						{#if incomingForms.length === 0}
							<p class="text-sm text-muted-foreground text-center py-4">
								{m.stagePreviewParticipantNoForms?.() ?? 'No forms are attached to incoming connections for this stage.'}
							</p>
						{:else}
							<p class="text-xs text-muted-foreground mb-2">
								{m.stagePreviewParticipantDataCollected?.() ?? 'Data collected when arriving at this stage via incoming connections.'}
							</p>
							{#each incomingForms as group}
								<div class="form-group">
									<div class="form-group-header">
										<FileText class="w-3.5 h-3.5 text-muted-foreground" />
										<span class="text-xs font-semibold">{group.form.name || (m.stagePreviewParticipantUnnamedForm?.() ?? 'Unnamed form')}</span>
										<span class="text-[10px] text-muted-foreground ml-auto">{m.stagePreviewParticipantVia?.({ name: group.connectionName }) ?? `via ${group.connectionName}`}</span>
									</div>
									{#if group.fields.length === 0}
										<p class="text-xs text-muted-foreground px-3 py-2">{m.stagePreviewParticipantNoFields?.() ?? 'No fields yet'}</p>
									{:else}
										<div class="p-3">
											<FormRenderer mode="view" fields={toFormFields(group.fields)} />
										</div>
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</Tabs.Content>

				<!-- ====================================================== -->
				<!-- Settings Tab -->
				<!-- ====================================================== -->
				<Tabs.Content value="settings" class="pt-4">
					<div class="space-y-6">
						<!-- Stage Name -->
						<div class="space-y-2">
							<label class="text-sm font-medium" for="stage-name-input">
								{m.stagePreviewParticipantStageName?.() ?? 'Stage Name'}
							</label>
							<input
								id="stage-name-input"
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								value={stage.stage_name}
								oninput={(e) =>
									onStageRename?.(e.currentTarget.value)}
								placeholder={m.stagePreviewParticipantStageNamePlaceholder?.() ?? 'Stage name...'}
							/>
							<p class="text-xs text-muted-foreground">
								{m.stagePreviewParticipantStageNameHint?.() ?? 'Shown in the participant progress view'}
							</p>
						</div>

						<!-- Visible to Roles -->
						<div class="space-y-2">
							<label class="text-sm font-medium">{m.tileSetVisibleToRoles?.() ?? 'Visible to Roles'}</label>
							<MobileMultiSelect
								selectedIds={selectedRoleIds}
								options={roles}
								getOptionId={(r) => r.id}
								getOptionLabel={(r) => r.name}
								getOptionDescription={(r) => r.description}
								allowCreate={!!onCreateRole}
								onCreateOption={onCreateRole}
								onSelectedIdsChange={handleRolesChange}
								placeholder={m.stagePreviewParticipantSelectRoles?.() ?? 'Select or search roles...'}
								class="w-full"
							/>
							<p class="text-xs text-muted-foreground">
								{m.stagePreviewParticipantVisibleToRolesHint?.() ?? 'Only participants with these roles can see this stage. Leave empty to make visible to all.'}
							</p>
						</div>

						<!-- Delete -->
						<div class="pt-4 border-t">
							<button
								class="text-sm text-destructive hover:text-destructive/80 transition-colors"
								onclick={() => onStageDelete?.()}
							>
								{m.stagePreviewParticipantDeleteStage?.() ?? 'Delete this stage'}
							</button>
						</div>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</div>
	</div>
</div>

<style>
	.participant-preview {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: hsl(var(--background));
		border-radius: 0.75rem 0.75rem 0 0;
	}

	/* Action Button - Colored (all buttons use a color now) */
	.action-btn-colored {
		background-color: var(--btn-color);
		color: white;
		border: 1px solid transparent;
		box-shadow:
			0 2px 4px -1px color-mix(in srgb, var(--btn-color) 40%, transparent),
			0 1px 2px -1px color-mix(in srgb, var(--btn-color) 30%, transparent);
		text-shadow: 0 1px 1px rgb(0 0 0 / 0.15);
	}

	.action-btn-colored:hover {
		filter: brightness(1.08);
		box-shadow:
			0 4px 8px -2px color-mix(in srgb, var(--btn-color) 45%, transparent),
			0 2px 4px -2px color-mix(in srgb, var(--btn-color) 35%, transparent);
	}

	:global(.dark) .action-btn-colored {
		background-color: color-mix(in srgb, var(--btn-color) 85%, black);
		box-shadow:
			0 2px 6px -1px color-mix(in srgb, var(--btn-color) 35%, transparent),
			0 0 0 1px color-mix(in srgb, var(--btn-color) 50%, transparent);
	}

	:global(.dark) .action-btn-colored:hover {
		background-color: color-mix(in srgb, var(--btn-color) 95%, black);
		filter: brightness(1.1);
	}

	/* Action Button - Selected state */
	.action-btn-selected {
		outline: 2px solid hsl(var(--primary));
		outline-offset: 2px;
	}

	/* Line clamp for button text */
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Thin scrollbar for action roll */
	.scrollbar-thin {
		scrollbar-width: thin;
	}
	.scrollbar-thin::-webkit-scrollbar {
		height: 4px;
	}
	.scrollbar-thin::-webkit-scrollbar-track {
		background: transparent;
	}
	.scrollbar-thin::-webkit-scrollbar-thumb {
		background: hsl(var(--border));
		border-radius: 2px;
	}

	/* Form group for Details tab */
	.form-group {
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.form-group-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border-bottom: 1px solid hsl(var(--border));
	}

</style>
