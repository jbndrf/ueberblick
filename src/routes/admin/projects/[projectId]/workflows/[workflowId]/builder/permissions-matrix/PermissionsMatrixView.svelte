<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { ChevronRight, Eye, EyeOff } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import {
		roleHasAccess,
		toggleRoleInList,
		type WorkflowBuilderState
	} from '$lib/workflow-builder';
	import { buildMatrixModel, type MatrixRow } from './matrix-model';
	import MatrixCell from './MatrixCell.svelte';
	import {
		permMatrixDensityAdvanced,
		permMatrixDensityBasic,
		permMatrixDescription,
		permMatrixInherited,
		permMatrixLegendAll,
		permMatrixLegendAllowed,
		permMatrixLegendDenied,
		permMatrixManageRoles,
		permMatrixNoRoles,
		permMatrixPrivateInstances,
		permMatrixPrivateInstancesHint,
		permMatrixTitle
	} from '$lib/paraglide/messages';

	let {
		builderState,
		roles,
		projectId
	}: {
		builderState: WorkflowBuilderState;
		roles: Array<{ id: string; name: string }>;
		projectId: string;
	} = $props();

	let density = $state<'basic' | 'advanced'>('basic');
	const expanded = new SvelteSet<string>();

	const allRoleIds = $derived(roles.map((r) => r.id));
	const sections = $derived(buildMatrixModel(builderState));

	const visibleSections = $derived(
		sections
			.map((section) => ({
				...section,
				bands: section.bands
					.filter((b) => density === 'advanced' || !b.advanced)
					.map((b) => ({
						...b,
						rows: b.rows.filter((r) => density === 'advanced' || !r.advanced)
					}))
					.filter((b) => b.header != null || b.rows.length > 0)
			}))
			.filter((s) => s.bands.length > 0)
	);

	function toggleExpand(id: string) {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}

	function toggleRow(row: MatrixRow, roleId: string) {
		if (!row.setRoles) return;
		row.setRoles(toggleRoleInList(row.roles(), roleId, allRoleIds));
	}
</script>

<div class="flex h-full min-w-0 flex-1 flex-col bg-card">
	<!-- Header -->
	<div class="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
		<div class="min-w-0">
			<h2 class="text-sm font-semibold">{permMatrixTitle()}</h2>
			<p class="text-xs text-muted-foreground">{permMatrixDescription()}</p>
		</div>
		<div class="flex flex-wrap items-center gap-4">
			<label class="flex items-center gap-2 text-xs" title={permMatrixPrivateInstancesHint()}>
				<Switch
					checked={builderState.workflowPermissions.private_instances}
					onCheckedChange={(v: boolean) =>
						builderState.updateWorkflowPermissions({ private_instances: v })}
				/>
				{permMatrixPrivateInstances()}
			</label>
			<div class="flex items-center gap-1">
				<Button
					variant={density === 'basic' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (density = 'basic')}
				>
					{permMatrixDensityBasic()}
				</Button>
				<Button
					variant={density === 'advanced' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (density = 'advanced')}
				>
					{permMatrixDensityAdvanced()}
				</Button>
			</div>
		</div>
	</div>

	<!-- Legend -->
	<div
		class="flex flex-shrink-0 flex-wrap items-center gap-4 border-b px-4 py-1.5 text-xs text-muted-foreground"
	>
		<span class="flex items-center gap-1">
			<Eye class="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
			{permMatrixLegendAllowed()}
		</span>
		<span class="flex items-center gap-1">
			<span
				class="inline-flex h-5 w-5 items-center justify-center rounded border border-dashed border-green-600/40 dark:border-green-400/40"
			>
				<Eye class="h-3 w-3 text-green-600 dark:text-green-400" />
			</span>
			{permMatrixLegendAll()}
		</span>
		<span class="flex items-center gap-1">
			<EyeOff class="h-3.5 w-3.5 text-destructive/40" />
			{permMatrixLegendDenied()}
		</span>
	</div>

	{#if roles.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
			<p class="text-sm text-muted-foreground">{permMatrixNoRoles()}</p>
			<a
				href={`/admin/projects/${projectId}/roles`}
				class="text-sm font-medium text-primary underline underline-offset-4"
			>
				{permMatrixManageRoles()}
			</a>
		</div>
	{:else}
		<div class="min-h-0 flex-1 overflow-auto">
			<table class="border-separate border-spacing-0 text-sm">
				<thead>
					<tr>
						<th
							class="sticky top-0 left-0 z-30 min-w-[14rem] border-r border-b bg-card px-3 py-2 text-left"
						></th>
						{#each roles as role (role.id)}
							<th
								class="sticky top-0 z-20 max-w-[9rem] min-w-[5rem] border-b bg-card px-2 py-2 text-center align-bottom text-xs font-semibold"
							>
								<span class="break-words">{role.name}</span>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each visibleSections as section (section.id)}
						<tr>
							<td
								colspan={roles.length + 1}
								class="border-b bg-muted px-3 py-1.5 text-[0.6875rem] font-bold tracking-wider text-muted-foreground uppercase"
							>
								{section.label}
							</td>
						</tr>
						{#each section.bands as band (band.id)}
							<tr class="bg-muted/40">
								<td
									class="sticky left-0 z-10 border-r border-b bg-muted px-3 py-1.5 text-xs font-semibold"
								>
									{band.label}
								</td>
								{#if band.header}
									{@const header = band.header}
									{@const headerList = header.roles()}
									{#each roles as role (role.id)}
										<td class="border-b bg-muted/40 px-1 py-1 text-center">
											<MatrixCell
												tone="view"
												allowed={roleHasAccess(role.id, headerList)}
												isAll={headerList.length === 0}
												title={role.name}
												onToggle={() =>
													header.setRoles(toggleRoleInList(headerList, role.id, allRoleIds))}
											/>
										</td>
									{/each}
								{:else}
									<td colspan={roles.length} class="border-b bg-muted/40"></td>
								{/if}
							</tr>
							{#each band.rows as row (row.id)}
								{@const list = row.roles()}
								<tr>
									<td
										class="sticky left-0 z-10 border-r border-b bg-card py-1 {row.indent
											? 'pl-9'
											: 'pl-3'} pr-3"
									>
										<div class="flex items-center gap-1">
											{#if row.fieldRefs}
												<button
													type="button"
													class="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
													onclick={() => toggleExpand(row.id)}
													aria-expanded={expanded.has(row.id)}
												>
													<ChevronRight
														class="h-3.5 w-3.5 transition-transform {expanded.has(row.id)
															? 'rotate-90'
															: ''}"
													/>
												</button>
											{:else}
												<span class="w-4"></span>
											{/if}
											<span class={row.readOnly ? 'text-muted-foreground' : ''}>{row.label}</span>
											{#if row.readOnly}
												<span
													class="rounded bg-muted px-1 py-0.5 text-[0.625rem] tracking-wide text-muted-foreground uppercase"
												>
													{permMatrixInherited()}
												</span>
											{/if}
										</div>
									</td>
									{#each roles as role (role.id)}
										<td class="border-b px-1 py-1 text-center">
											<MatrixCell
												tone={row.tone}
												allowed={roleHasAccess(role.id, list)}
												isAll={list.length === 0}
												readOnly={row.readOnly}
												title={role.name}
												onToggle={() => toggleRow(row, role.id)}
											/>
										</td>
									{/each}
								</tr>
								{#if row.fieldRefs && expanded.has(row.id)}
									{#each row.fieldRefs() as fref (fref.id)}
										<tr class="bg-muted/20">
											<td
												class="sticky left-0 z-10 border-r border-b bg-card py-1 pr-3 pl-14 text-xs text-muted-foreground"
											>
												{fref.label}
											</td>
											{#each roles as role (role.id)}
												<td class="border-b px-1 py-1 text-center">
													<MatrixCell
														tone="view"
														allowed={roleHasAccess(role.id, fref.viewRoles)}
														isAll={fref.viewRoles.length === 0}
														readOnly={true}
														title={role.name}
													/>
												</td>
											{/each}
										</tr>
									{/each}
								{/if}
							{/each}
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
