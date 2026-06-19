<script lang="ts">
	import {
		X,
		Plus,
		Trash2,
		ArrowRight,
		Wrench,
		MapPin,
		Globe,
		FileText,
		ClipboardList,
		Layers,
		Settings2
	} from '@lucide/svelte';
	import {
		commonClose,
		stagePreviewParticipantAddActionButton,
		stagePreviewParticipantAllRoles,
		stagePreviewParticipantDeleteStage,
		stagePreviewParticipantEditStageName,
		stagePreviewDefaultViewTitle,
		stagePreviewDefaultViewHint,
		stagePreviewButtonRoleSettings
	} from '$lib/paraglide/messages';
	import type { WorkflowStage } from '$lib/workflow-builder';
	import { getDefaultButtonColor } from './types';
	import type { StageAction, Role } from './types';
	import DataTabsSection from './DataTabsSection.svelte';
	import InlineEdit from '../../../components/InlineEdit.svelte';

	interface Props {
		/** Null = the participant default view (no stage selected). */
		stage: WorkflowStage | null;
		actions: StageAction[];
		globalTools: StageAction[];
		roles: Role[];
		selectedButtonId?: string | null;
		roleFilter?: string;
		// Handlers
		onButtonSelect?: (actionId: string) => void;
		onButtonHover?: (actionId: string | null) => void;
		/** Gear on an action → open its appearance + roles in the expandable sidebar. */
		onConfigButton?: (actionId: string) => void;
		onAddButtonClick?: () => void;
		onStageRename?: (name: string) => void;
		onStageDelete?: () => void;
		onClose?: () => void;
		onRoleFilterChange?: (roleId: string) => void;
	}

	let {
		stage,
		actions,
		globalTools,
		roles,
		selectedButtonId = null,
		roleFilter = 'all',
		onButtonSelect,
		onButtonHover,
		onConfigButton,
		onAddButtonClick,
		onStageRename,
		onStageDelete,
		onClose,
		onRoleFilterChange
	}: Props = $props();

	// All buttons to display (actions + global tools)
	const allButtons = $derived([...actions, ...globalTools]);

	// Filter buttons by role
	const visibleButtons = $derived.by(() => {
		if (roleFilter === 'all') return allButtons;
		return allButtons.map((btn) => {
			// Edit-tool actions use paired self/any role arrays; others use allowed_roles.
			const allowedRoles =
				btn.type === 'stage_tool' || btn.type === 'global_tool'
					? [...(btn.any_edit_roles || []), ...(btn.self_edit_roles || [])]
					: btn.allowed_roles || [];
			const isVisible = allowedRoles.length === 0 || allowedRoles.includes(roleFilter);
			return { ...btn, _dimmed: !isVisible };
		});
	});

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
		if (action.type === 'stage_protocol') return ClipboardList;
		return Wrench;
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
		class="flex flex-shrink-0 items-center justify-between rounded-t-xl border-b border-border bg-primary p-4 text-primary-foreground"
	>
		<div class="min-w-0 flex-1 space-y-0.5">
			<div class="flex items-center gap-2">
				{#if stage}
					<InlineEdit
						value={stage.stage_name}
						onCommit={(v) => onStageRename?.(v)}
						class="w-full cursor-text truncate border-b border-transparent bg-transparent text-left text-lg font-semibold transition outline-none placeholder:text-primary-foreground/50 hover:opacity-80 focus:border-primary-foreground/40"
						ariaLabel={stagePreviewParticipantEditStageName?.() ?? 'Stage name'}
						editTitle={stagePreviewParticipantEditStageName?.() ?? 'Click to edit stage name'}
					/>
				{:else}
					<div class="flex items-center gap-2">
						<Layers class="h-4 w-4 opacity-80" />
						<div class="min-w-0">
							<div class="truncate text-lg font-semibold">
								{stagePreviewDefaultViewTitle?.() ?? 'Default view'}
							</div>
							<div class="truncate text-xs text-primary-foreground/70">
								{stagePreviewDefaultViewHint?.() ?? 'Tabs every participant sees'}
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="ml-2 flex items-center gap-1">
			<!-- Role filter -->
			<select
				class="cursor-pointer rounded border-0 bg-primary-foreground/10 px-2 py-1 text-xs text-primary-foreground outline-none"
				value={roleFilter}
				onchange={(e) => onRoleFilterChange?.(e.currentTarget.value)}
			>
				<option value="all">{stagePreviewParticipantAllRoles?.() ?? 'All roles'}</option>
				{#each roles as role}
					<option value={role.id}>{role.name}</option>
				{/each}
			</select>

			{#if stage}
				<!-- Delete stage -->
				<button
					class="flex items-center justify-center rounded p-2 transition-colors hover:bg-primary-foreground/10"
					onclick={() => onStageDelete?.()}
					title={stagePreviewParticipantDeleteStage?.() ?? 'Delete this stage'}
					aria-label={stagePreviewParticipantDeleteStage?.() ?? 'Delete this stage'}
				>
					<Trash2 class="h-4 w-4" />
				</button>
			{/if}

			<!-- Close -->
			<button
				class="flex items-center justify-center rounded p-2 transition-colors hover:bg-primary-foreground/10"
				onclick={() => onClose?.()}
				aria-label={commonClose?.() ?? 'Close'}
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	</div>

	<!-- ================================================================== -->
	<!-- Content -->
	<!-- ================================================================== -->
	<div class="min-h-0 flex-1 overflow-y-auto">
		<div class="p-4">
			{#if stage}
				<!-- Action Roll Bar -->
				<div class="mb-4">
					<div class="flex items-stretch gap-2">
						<!-- [+] pinned left -->
						<button
							class="flex min-h-[56px] min-w-[56px] flex-shrink-0
								flex-col items-center justify-center rounded-xl
								border-2 border-dashed
								border-muted-foreground/30 px-3 py-2.5
								text-muted-foreground/50
								transition-all duration-200
								ease-out hover:scale-[1.02] hover:border-muted-foreground/50
								hover:text-muted-foreground/80 active:scale-[0.98]"
							onclick={() => onAddButtonClick?.()}
							title={stagePreviewParticipantAddActionButton?.() ?? 'Add action button'}
						>
							<Plus class="h-5 w-5" />
						</button>

						<!-- Scrollable action buttons -->
						<div
							class="scrollbar-thin flex min-w-0 flex-1 gap-2.5 overflow-x-auto pb-2"
							onwheel={handleWheelScroll}
						>
							{#each visibleButtons as action}
								{@const isDimmed = '_dimmed' in action && action._dimmed}
								<div class="action-wrap group relative flex-shrink-0" class:opacity-40={isDimmed}>
									<button
										class="action-btn action-btn-colored relative flex min-h-[56px] max-w-[120px] min-w-[72px]
											flex-col items-center justify-center rounded-xl
											px-3 py-2.5
											transition-all duration-200 ease-out
											hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.98]"
										class:action-btn-selected={selectedButtonId === action.id}
										style="--btn-color: {getDisplayColor(action)}"
										onclick={() => onButtonSelect?.(action.id)}
										onmouseenter={() => onButtonHover?.(action.id)}
										onmouseleave={() => onButtonHover?.(null)}
									>
										<!-- Type indicator (top-right corner) -->
										<span class="absolute top-1 right-1 opacity-60">
											<svelte:component this={getActionTypeIcon(action)} class="h-2.5 w-2.5" />
										</span>
										<span class="line-clamp-2 text-center text-xs leading-snug font-semibold">
											{action.buttonLabel}
										</span>
									</button>
									<!-- Gear: appearance + roles in the expandable sidebar -->
									<button
										class="action-gear"
										onclick={(e) => {
											e.stopPropagation();
											onConfigButton?.(action.id);
										}}
										title={stagePreviewButtonRoleSettings?.() ?? 'Button & role settings'}
										aria-label={stagePreviewButtonRoleSettings?.() ?? 'Button & role settings'}
									>
										<Settings2 class="h-3 w-3" />
									</button>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Data tabs (the participant Data view + tab builder) -->
			<DataTabsSection />
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

	/* Per-action gear — opens appearance + roles in the expandable sidebar.
	   Always visible and high-contrast so it reads on any button colour. */
	.action-gear {
		position: absolute;
		top: 3px;
		left: 3px;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 9999px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		cursor: pointer;
		opacity: 1;
		transition:
			transform 0.15s ease,
			color 0.15s ease,
			background 0.15s ease;
		box-shadow: 0 1px 3px hsl(0 0% 0% / 0.3);
	}

	.action-gear:hover {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		transform: scale(1.1);
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
</style>
