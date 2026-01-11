<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Plus, Pencil, Trash2, GripVertical, ChevronDown, Check } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';

	export interface FieldConfig {
		tableName: string;
		fieldIdColumn: string;
		fieldNameColumn: string;
		fieldTypeColumn: string;
		isRequiredColumn?: string;
		defaultValueColumn?: string;
		foreignKeyColumn?: string;
		foreignKeyValue?: string;
		createAction: string;
		updateAction: string;
		deleteAction: string;
		labels: {
			title: string;
			description: string;
			addButton: string;
			fieldName: string;
			fieldType: string;
			defaultValue: string;
			required: string;
			noFields: string;
			createSuccess: string;
			createError: string;
			updateSuccess: string;
			updateError: string;
			deleteSuccess: string;
			deleteError: string;
			deleteConfirm: string | ((fieldName: string) => string);
		};
	}

	interface Field {
		[key: string]: any;
	}

	let {
		fields = [],
		config
	}: {
		fields: Field[];
		config: FieldConfig;
	} = $props();

	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let selectedField = $state<Field | null>(null);

	let formData = $state({
		fieldName: '',
		fieldType: 'text' as 'text' | 'number' | 'date' | 'boolean',
		isRequired: false,
		defaultValue: ''
	});

	function resetForm() {
		formData = {
			fieldName: '',
			fieldType: 'text',
			isRequired: false,
			defaultValue: ''
		};
	}

	function openCreateDialog() {
		resetForm();
		createDialogOpen = true;
	}

	function openEditDialog(field: Field) {
		selectedField = field;
		formData = {
			fieldName: field[config.fieldNameColumn],
			fieldType: field[config.fieldTypeColumn],
			isRequired: config.isRequiredColumn ? field[config.isRequiredColumn] : false,
			defaultValue: config.defaultValueColumn ? field[config.defaultValueColumn] || '' : ''
		};
		editDialogOpen = true;
	}

	function openDeleteDialog(field: Field) {
		selectedField = field;
		deleteDialogOpen = true;
	}

	async function handleCreate() {
		const formDataToSend = new FormData();
		formDataToSend.append('fieldName', formData.fieldName);
		formDataToSend.append('fieldType', formData.fieldType);
		if (config.isRequiredColumn) {
			formDataToSend.append('isRequired', String(formData.isRequired));
		}
		if (config.defaultValueColumn) {
			formDataToSend.append('defaultValue', formData.defaultValue);
		}
		if (config.foreignKeyColumn && config.foreignKeyValue) {
			formDataToSend.append(config.foreignKeyColumn, config.foreignKeyValue);
		}

		const response = await fetch(`?/${config.createAction}`, {
			method: 'POST',
			body: formDataToSend
		});

		const result = await response.json();

		if (result.type === 'success') {
			toast.success(config.labels.createSuccess);
			createDialogOpen = false;
			resetForm();
			await invalidateAll();
		} else {
			toast.error(result.data?.message || config.labels.createError);
		}
	}

	async function handleUpdate() {
		if (!selectedField) return;

		const formDataToSend = new FormData();
		formDataToSend.append('fieldId', selectedField[config.fieldIdColumn]);
		formDataToSend.append('fieldName', formData.fieldName);
		formDataToSend.append('fieldType', formData.fieldType);
		if (config.isRequiredColumn) {
			formDataToSend.append('isRequired', String(formData.isRequired));
		}
		if (config.defaultValueColumn) {
			formDataToSend.append('defaultValue', formData.defaultValue);
		}
		if (config.foreignKeyColumn && config.foreignKeyValue) {
			formDataToSend.append(config.foreignKeyColumn, config.foreignKeyValue);
		}

		const response = await fetch(`?/${config.updateAction}`, {
			method: 'POST',
			body: formDataToSend
		});

		const result = await response.json();

		if (result.type === 'success') {
			toast.success(config.labels.updateSuccess);
			editDialogOpen = false;
			selectedField = null;
			resetForm();
			await invalidateAll();
		} else {
			toast.error(result.data?.message || config.labels.updateError);
		}
	}

	async function handleDelete() {
		if (!selectedField) return;

		const formDataToSend = new FormData();
		formDataToSend.append('fieldId', selectedField[config.fieldIdColumn]);
		if (config.foreignKeyColumn && config.foreignKeyValue) {
			formDataToSend.append(config.foreignKeyColumn, config.foreignKeyValue);
		}

		const response = await fetch(`?/${config.deleteAction}`, {
			method: 'POST',
			body: formDataToSend
		});

		const result = await response.json();

		if (result.type === 'success') {
			toast.success(config.labels.deleteSuccess);
			deleteDialogOpen = false;
			selectedField = null;
			await invalidateAll();
		} else {
			toast.error(result.data?.message || config.labels.deleteError);
		}
	}

	const sortedFields = $derived(
		[...fields].sort((a, b) => {
			const orderA = a.display_order ?? a.created_at ?? 0;
			const orderB = b.display_order ?? b.created_at ?? 0;
			return orderA - orderB;
		})
	);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h3 class="text-lg font-semibold">{config.labels.title}</h3>
			<p class="text-sm text-muted-foreground">
				{config.labels.description}
			</p>
		</div>
		<Button onclick={openCreateDialog} size="sm">
			<Plus class="mr-2 h-4 w-4" />
			{config.labels.addButton}
		</Button>
	</div>

	{#if sortedFields.length === 0}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<p class="text-sm text-muted-foreground">{config.labels.noFields}</p>
		</div>
	{:else}
		<div class="rounded-lg border">
			<div class="divide-y">
				{#each sortedFields as field (field[config.fieldIdColumn])}
					<div class="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors">
						<div class="cursor-grab text-muted-foreground">
							<GripVertical class="h-4 w-4" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<p class="font-medium truncate">{field[config.fieldNameColumn]}</p>
								<span
									class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-blue-50 text-blue-700 ring-blue-700/10"
								>
									{field[config.fieldTypeColumn]}
								</span>
								{#if config.isRequiredColumn && field[config.isRequiredColumn]}
									<span
										class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-yellow-50 text-yellow-700 ring-yellow-700/10"
									>
										Required
									</span>
								{/if}
							</div>
							{#if config.defaultValueColumn && field[config.defaultValueColumn]}
								<p class="text-xs text-muted-foreground mt-1">
									Default: {field[config.defaultValueColumn]}
								</p>
							{/if}
						</div>
						<div class="flex gap-1">
							<Button
								variant="ghost"
								size="icon"
								onclick={() => openEditDialog(field)}
								class="h-8 w-8"
							>
								<Pencil class="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => openDeleteDialog(field)}
								class="h-8 w-8 text-destructive hover:text-destructive"
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- Create Dialog -->
<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{config.labels.addButton}</Dialog.Title>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			<div class="grid gap-2">
				<Label for="fieldName">{config.labels.fieldName}</Label>
				<Input
					id="fieldName"
					bind:value={formData.fieldName}
					placeholder="e.g., customer_id"
					required
				/>
				<p class="text-xs text-muted-foreground">
					Must start with a letter and contain only lowercase letters, numbers, and underscores
				</p>
			</div>
			<div class="grid gap-2">
				<Label for="fieldType">{config.labels.fieldType}</Label>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger asChild>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								class="w-full justify-between"
								id="fieldType"
							>
								{formData.fieldType === 'text' ? 'Text' :
								 formData.fieldType === 'number' ? 'Number' :
								 formData.fieldType === 'date' ? 'Date' :
								 formData.fieldType === 'boolean' ? 'Boolean' : 'Select type'}
								<ChevronDown class="ml-2 h-4 w-4 opacity-50" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="w-full">
						<DropdownMenu.Item onclick={() => { formData.fieldType = 'text'; }}>
							{#if formData.fieldType === 'text'}
								<Check class="mr-2 h-4 w-4" />
							{:else}
								<span class="mr-2 h-4 w-4"></span>
							{/if}
							Text
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => { formData.fieldType = 'number'; }}>
							{#if formData.fieldType === 'number'}
								<Check class="mr-2 h-4 w-4" />
							{:else}
								<span class="mr-2 h-4 w-4"></span>
							{/if}
							Number
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => { formData.fieldType = 'date'; }}>
							{#if formData.fieldType === 'date'}
								<Check class="mr-2 h-4 w-4" />
							{:else}
								<span class="mr-2 h-4 w-4"></span>
							{/if}
							Date
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => { formData.fieldType = 'boolean'; }}>
							{#if formData.fieldType === 'boolean'}
								<Check class="mr-2 h-4 w-4" />
							{:else}
								<span class="mr-2 h-4 w-4"></span>
							{/if}
							Boolean
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
			{#if config.defaultValueColumn}
				<div class="grid gap-2">
					<Label for="defaultValue">{config.labels.defaultValue}</Label>
					<Input id="defaultValue" bind:value={formData.defaultValue} placeholder="Default value" />
				</div>
			{/if}
			{#if config.isRequiredColumn}
				<div class="flex items-center gap-2">
					<Checkbox id="isRequired" bind:checked={formData.isRequired} />
					<Label for="isRequired" class="text-sm font-normal cursor-pointer">
						{config.labels.required}
					</Label>
				</div>
			{/if}
		</div>
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (createDialogOpen = false)}>
				{m.commonCancel()}
			</Button>
			<Button type="button" onclick={handleCreate}>{m.commonCreate()}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Edit {config.labels.fieldName}</Dialog.Title>
		</Dialog.Header>
		{#if selectedField}
			<div class="grid gap-4 py-4">
				<div class="grid gap-2">
					<Label for="edit-fieldName">{config.labels.fieldName}</Label>
					<Input
						id="edit-fieldName"
						bind:value={formData.fieldName}
						placeholder="e.g., customer_id"
						required
					/>
				</div>
				<div class="grid gap-2">
					<Label for="edit-fieldType">{config.labels.fieldType}</Label>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger asChild>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									class="w-full justify-between"
									id="edit-fieldType"
								>
									{formData.fieldType === 'text' ? 'Text' :
									 formData.fieldType === 'number' ? 'Number' :
									 formData.fieldType === 'date' ? 'Date' :
									 formData.fieldType === 'boolean' ? 'Boolean' : 'Select type'}
									<ChevronDown class="ml-2 h-4 w-4 opacity-50" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-full">
							<DropdownMenu.Item onclick={() => { formData.fieldType = 'text'; }}>
								{#if formData.fieldType === 'text'}
									<Check class="mr-2 h-4 w-4" />
								{:else}
									<span class="mr-2 h-4 w-4"></span>
								{/if}
								Text
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => { formData.fieldType = 'number'; }}>
								{#if formData.fieldType === 'number'}
									<Check class="mr-2 h-4 w-4" />
								{:else}
									<span class="mr-2 h-4 w-4"></span>
								{/if}
								Number
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => { formData.fieldType = 'date'; }}>
								{#if formData.fieldType === 'date'}
									<Check class="mr-2 h-4 w-4" />
								{:else}
									<span class="mr-2 h-4 w-4"></span>
								{/if}
								Date
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => { formData.fieldType = 'boolean'; }}>
								{#if formData.fieldType === 'boolean'}
									<Check class="mr-2 h-4 w-4" />
								{:else}
									<span class="mr-2 h-4 w-4"></span>
								{/if}
								Boolean
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
				{#if config.defaultValueColumn}
					<div class="grid gap-2">
						<Label for="edit-defaultValue">{config.labels.defaultValue}</Label>
						<Input
							id="edit-defaultValue"
							bind:value={formData.defaultValue}
							placeholder="Default value"
						/>
					</div>
				{/if}
				{#if config.isRequiredColumn}
					<div class="flex items-center gap-2">
						<Checkbox id="edit-isRequired" bind:checked={formData.isRequired} />
						<Label for="edit-isRequired" class="text-sm font-normal cursor-pointer">
							{config.labels.required}
						</Label>
					</div>
				{/if}
			</div>
		{/if}
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (editDialogOpen = false)}>
				{m.commonCancel()}
			</Button>
			<Button type="button" onclick={handleUpdate}>{m.commonSave()}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete {config.labels.fieldName}</AlertDialog.Title>
			<AlertDialog.Description>
				{#if selectedField}
					{typeof config.labels.deleteConfirm === 'function'
						? config.labels.deleteConfirm(selectedField[config.fieldNameColumn])
						: config.labels.deleteConfirm}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.commonCancel()}</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={handleDelete}
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
			>
				{m.commonDelete()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
