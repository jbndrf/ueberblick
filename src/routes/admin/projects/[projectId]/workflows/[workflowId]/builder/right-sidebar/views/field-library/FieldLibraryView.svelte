<script lang="ts">
	import { Library, Plus, Trash2, X, ChevronDown, ChevronRight } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import type {
		WorkflowFieldDef,
		TrackedFieldDef,
		FieldType
	} from '$lib/workflow-builder';

	type Role = { id: string; name: string; description?: string };

	type ProjectWorkflow = { id: string; name: string };

	type Props = {
		fieldDefs: TrackedFieldDef[];
		roles: Role[];
		/** All workflows in the same project — used as targets for instance_reference fields. */
		projectWorkflows?: ProjectWorkflow[];
		onAdd: () => string; // returns new def id
		onUpdate: (id: string, updates: Partial<WorkflowFieldDef>) => void;
		onDelete: (id: string) => void;
		onClose?: () => void;
	};

	let { fieldDefs, roles, projectWorkflows = [], onAdd, onUpdate, onDelete, onClose }: Props = $props();

	function updateFieldOptions(defId: string, current: Record<string, unknown> | null | undefined, patch: Record<string, unknown>) {
		onUpdate(defId, { field_options: { ...(current ?? {}), ...patch } });
	}

	let expandedId = $state<string | null>(null);

	const FIELD_TYPES: { value: FieldType; label: string }[] = [
		{ value: 'short_text', label: 'Short Text' },
		{ value: 'long_text', label: 'Long Text' },
		{ value: 'number', label: 'Number' },
		{ value: 'email', label: 'Email' },
		{ value: 'date', label: 'Date' },
		{ value: 'file', label: 'File' },
		{ value: 'dropdown', label: 'Dropdown' },
		{ value: 'multiple_choice', label: 'Multiple Choice' },
		{ value: 'smart_dropdown', label: 'Smart Dropdown' },
		{ value: 'custom_table_selector', label: 'Custom Table Selector' },
		{ value: 'instance_reference', label: 'Instance Reference' }
	];

	const WRITE_MODES: { value: 'singleton' | 'observation' | 'computed'; label: string; hint: string }[] = [
		{ value: 'singleton', label: 'Singleton', hint: 'One current value, upserted on each write' },
		{ value: 'observation', label: 'Observation', hint: 'Append-only history of readings' },
		{ value: 'computed', label: 'Computed', hint: 'Evaluated server-side from an expression' }
	];

	function toggle(id: string) {
		expandedId = expandedId === id ? null : id;
	}

	function handleAdd() {
		const id = onAdd();
		expandedId = id;
	}

	function visibleDefs(defs: TrackedFieldDef[]) {
		return defs.filter((d) => d.status !== 'deleted');
	}
</script>

<style>
	.ref-opts {
		padding: 0.5rem;
		background: hsl(var(--muted) / 0.4);
		border-radius: 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center gap-2 border-b px-4 py-3">
		<Library class="h-4 w-4 text-primary" />
		<div class="flex-1 min-w-0">
			<h3 class="text-sm font-semibold leading-tight">Fields</h3>
			<p class="text-xs text-muted-foreground">Workflow-level field definitions</p>
		</div>
		{#if onClose}
			<Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={onClose}>
				<X class="h-4 w-4" />
			</Button>
		{/if}
	</div>

	<!-- Add button -->
	<div class="border-b px-4 py-2">
		<Button variant="outline" size="sm" class="w-full" onclick={handleAdd}>
			<Plus class="h-3.5 w-3.5 mr-1.5" />
			Add field
		</Button>
	</div>

	<!-- List -->
	<div class="flex-1 overflow-y-auto p-2 space-y-1.5">
		{#if visibleDefs(fieldDefs).length === 0}
			<p class="text-xs text-muted-foreground text-center py-8 px-4">
				No fields defined yet. Add a field to start collecting data.
			</p>
		{:else}
			{#each visibleDefs(fieldDefs) as def (def.data.id)}
				{@const isOpen = expandedId === def.data.id}
				<div class="rounded-md border bg-card">
					<button
						class="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent/50 transition-colors"
						onclick={() => toggle(def.data.id)}
					>
						{#if isOpen}
							<ChevronDown class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						{:else}
							<ChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						{/if}
						<div class="flex-1 min-w-0">
							<div class="text-sm font-medium truncate">
								{def.data.label || 'Untitled field'}
							</div>
							<div class="text-xs text-muted-foreground truncate">
								{def.data.field_type} · {def.data.write_mode}
							</div>
						</div>
						{#if def.status !== 'unchanged'}
							<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
								{def.status}
							</span>
						{/if}
					</button>

					{#if isOpen}
						<div class="border-t px-3 py-3 space-y-3">
							<div>
								<Label class="text-xs">Label</Label>
								<Input
									value={def.data.label}
									oninput={(e) => onUpdate(def.data.id, { label: (e.currentTarget as HTMLInputElement).value })}
									placeholder="Field label shown to participants"
									class="h-8 text-sm"
								/>
							</div>
							<div>
								<Label class="text-xs">Field type</Label>
								<select
									class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
									value={def.data.field_type}
									onchange={(e) => onUpdate(def.data.id, { field_type: (e.currentTarget as HTMLSelectElement).value as FieldType })}
								>
									{#each FIELD_TYPES as t}
										<option value={t.value}>{t.label}</option>
									{/each}
								</select>
							</div>
							{#if def.data.field_type === 'instance_reference'}
								{@const opts = (def.data.field_options ?? {}) as Record<string, any>}
								<div class="ref-opts">
									<div>
										<Label class="text-xs">Target workflow</Label>
										<select
											class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
											value={opts.target_workflow_id ?? ''}
											onchange={(e) => {
												const v = (e.currentTarget as HTMLSelectElement).value;
												updateFieldOptions(def.data.id, opts, { target_workflow_id: v || null });
											}}
										>
											<option value="">— any workflow —</option>
											{#each projectWorkflows as wf}
												<option value={wf.id}>{wf.name}</option>
											{/each}
										</select>
									</div>
									<div>
										<Label class="text-xs">Multiplicity</Label>
										<select
											class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
											value={opts.multiplicity ?? 'single'}
											onchange={(e) => updateFieldOptions(def.data.id, opts, { multiplicity: (e.currentTarget as HTMLSelectElement).value })}
										>
											<option value="single">Single (one reference)</option>
											<option value="many">Many (list of references)</option>
										</select>
									</div>
									<div>
										<Label class="text-xs">Relation kind</Label>
										<select
											class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
											value={opts.relation_kind ?? 'peer'}
											onchange={(e) => updateFieldOptions(def.data.id, opts, { relation_kind: (e.currentTarget as HTMLSelectElement).value })}
										>
											<option value="peer">Peer (link)</option>
											<option value="parent">Parent (this case is owned by target)</option>
											<option value="child">Child (target nests under this case)</option>
										</select>
									</div>
									<div>
										<Label class="text-xs">On delete</Label>
										<select
											class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
											value={opts.on_delete ?? 'nullify'}
											onchange={(e) => updateFieldOptions(def.data.id, opts, { on_delete: (e.currentTarget as HTMLSelectElement).value })}
										>
											<option value="nullify">Nullify (clear the reference)</option>
											<option value="cascade">Cascade (delete this case too)</option>
											<option value="block">Block (refuse to delete target)</option>
										</select>
										<p class="text-[11px] text-muted-foreground mt-1">
											Cascade/block enforcement is a Phase 4 follow-up — schema only for now.
										</p>
									</div>
								</div>
							{/if}
							<div>
								<Label class="text-xs">Write mode</Label>
								<select
									class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
									value={def.data.write_mode}
									onchange={(e) => onUpdate(def.data.id, { write_mode: (e.currentTarget as HTMLSelectElement).value as 'singleton' | 'observation' | 'computed' })}
								>
									{#each WRITE_MODES as m}
										<option value={m.value}>{m.label}</option>
									{/each}
								</select>
								<p class="text-[11px] text-muted-foreground mt-1">
									{WRITE_MODES.find((m) => m.value === def.data.write_mode)?.hint}
								</p>
							</div>
							<div>
								<Label class="text-xs">View roles (optional)</Label>
								<MobileMultiSelect
									selectedIds={def.data.view_roles ?? []}
									onSelectedIdsChange={(ids) => onUpdate(def.data.id, { view_roles: ids })}
									options={roles}
									getOptionId={(r) => r.id}
									getOptionLabel={(r) => r.name}
									getOptionDescription={(r) => r.description}
									placeholder="Inherits from form's allowed_roles when empty"
									class="w-full"
								/>
							</div>
							{#if def.data.write_mode === 'computed'}
								<div>
									<Label class="text-xs">Compute expression</Label>
									<textarea
										class="w-full min-h-[60px] rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono"
										value={def.data.compute_expression ?? ''}
										oninput={(e) => onUpdate(def.data.id, { compute_expression: (e.currentTarget as HTMLTextAreaElement).value })}
										placeholder={'e.g. {field_a} + {field_b}'}
									></textarea>
								</div>
							{/if}
							<div class="flex justify-end pt-1">
								<Button
									variant="ghost"
									size="sm"
									class="text-destructive hover:text-destructive"
									onclick={() => onDelete(def.data.id)}
								>
									<Trash2 class="h-3.5 w-3.5 mr-1.5" />
									Delete
								</Button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
