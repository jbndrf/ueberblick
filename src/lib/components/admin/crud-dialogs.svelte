<script lang="ts" module>
	/**
	 * Configuration for form fields in CRUD dialogs
	 */
	export type FormField = {
		/** Field identifier/name */
		name: string;
		/** Field label for display */
		label: string;
		/** Input type */
		type?: 'text' | 'email' | 'textarea' | 'number' | 'date';
		/** Placeholder text */
		placeholder?: string;
		/** Whether field is required */
		required?: boolean;
		/** Number of rows for textarea */
		rows?: number;
		/** Help text displayed below field */
		helpText?: string;
	};

	/**
	 * Configuration for CRUD dialogs
	 */
	export type CrudDialogConfig = {
		/** Entity name (singular, e.g., "Participant", "Role") */
		entityName: string;
		/** Form fields to display */
		fields: FormField[];
		/** Form action URL for create */
		createAction: string;
		/** Form action URL for update */
		updateAction: string;
		/** Form action URL for delete */
		deleteAction: string;
		/** i18n messages */
		messages: {
			createTitle: string;
			editTitle: string;
			deleteTitle: string;
			deleteConfirm: string;
			createSuccess: string;
			updateSuccess: string;
			deleteSuccess: string;
			createError: string;
			updateError: string;
			deleteError: string;
			cancel: string;
			save: string;
			create: string;
			delete: string;
		};
	};
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';

	type Props = {
		/** Configuration for the dialogs */
		config: CrudDialogConfig;
		/** Whether create dialog is open */
		createOpen: boolean;
		/** Whether edit dialog is open */
		editOpen: boolean;
		/** Whether delete dialog is open */
		deleteOpen: boolean;
		/** Currently selected entity for edit/delete (null for create) */
		selectedEntity: Record<string, any> | null;
		/** Callback when create dialog open state changes */
		onCreateOpenChange: (open: boolean) => void;
		/** Callback when edit dialog open state changes */
		onEditOpenChange: (open: boolean) => void;
		/** Callback when delete dialog open state changes */
		onDeleteOpenChange: (open: boolean) => void;
		/** Callback when entity is selected/deselected */
		onEntityChange: (entity: Record<string, any> | null) => void;
		/** Optional: Additional form fields (as snippet) */
		additionalFields?: any;
	};

	let {
		config,
		createOpen = $bindable(false),
		editOpen = $bindable(false),
		deleteOpen = $bindable(false),
		selectedEntity = $bindable(null),
		onCreateOpenChange,
		onEditOpenChange,
		onDeleteOpenChange,
		onEntityChange,
		additionalFields
	}: Props = $props();

	function handleSuccess(message: string) {
		createOpen = false;
		editOpen = false;
		deleteOpen = false;
		selectedEntity = null;
		onEntityChange?.(null);
		invalidateAll();
		toast.success(message);
	}

	function handleError(message: string) {
		toast.error(message);
	}

	function closeCreate() {
		createOpen = false;
		onCreateOpenChange?.(false);
	}

	function closeEdit() {
		editOpen = false;
		onEditOpenChange?.(false);
	}

	function closeDelete() {
		deleteOpen = false;
		onDeleteOpenChange?.(false);
	}
</script>

<!-- Create Dialog -->
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{config.messages.createTitle}</Dialog.Title>
		</Dialog.Header>
		<form
			method="POST"
			action={config.createAction}
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						handleSuccess(config.messages.createSuccess);
					} else if (result.type === 'failure') {
						handleError(config.messages.createError);
					}
				};
			}}
		>
			<div class="grid gap-4 py-4">
				{#each config.fields as field}
					<div class="grid gap-2">
						<Label for={field.name}>{field.label}</Label>
						{#if field.type === 'textarea'}
							<Textarea
								id={field.name}
								name={field.name}
								placeholder={field.placeholder}
								required={field.required}
								rows={field.rows ?? 3}
							/>
						{:else}
							<Input
								id={field.name}
								name={field.name}
								type={field.type ?? 'text'}
								placeholder={field.placeholder}
								required={field.required}
							/>
						{/if}
						{#if field.helpText}
							<p class="text-xs text-muted-foreground">{field.helpText}</p>
						{/if}
					</div>
				{/each}
				{#if additionalFields}
					{@render additionalFields()}
				{/if}
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={closeCreate}>
					{config.messages.cancel}
				</Button>
				<Button type="submit">{config.messages.create}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit Dialog -->
<Dialog.Root bind:open={editOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{config.messages.editTitle}</Dialog.Title>
		</Dialog.Header>
		{#if selectedEntity}
			<form
				method="POST"
				action={config.updateAction}
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							handleSuccess(config.messages.updateSuccess);
						} else if (result.type === 'failure') {
							handleError(config.messages.updateError);
						}
					};
				}}
			>
				<input type="hidden" name="id" value={selectedEntity.id} />
				<div class="grid gap-4 py-4">
					{#each config.fields as field}
						<div class="grid gap-2">
							<Label for="edit-{field.name}">{field.label}</Label>
							{#if field.type === 'textarea'}
								<Textarea
									id="edit-{field.name}"
									name={field.name}
									value={selectedEntity[field.name] || ''}
									placeholder={field.placeholder}
									required={field.required}
									rows={field.rows ?? 3}
								/>
							{:else}
								<Input
									id="edit-{field.name}"
									name={field.name}
									type={field.type ?? 'text'}
									value={selectedEntity[field.name] || ''}
									placeholder={field.placeholder}
									required={field.required}
								/>
							{/if}
							{#if field.helpText}
								<p class="text-xs text-muted-foreground">{field.helpText}</p>
							{/if}
						</div>
					{/each}
					{#if additionalFields}
						{@render additionalFields()}
					{/if}
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={closeEdit}>
						{config.messages.cancel}
					</Button>
					<Button type="submit">{config.messages.save}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Dialog -->
<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{config.messages.deleteTitle}</AlertDialog.Title>
			<AlertDialog.Description>
				{config.messages.deleteConfirm}
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if selectedEntity}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{config.messages.cancel}</AlertDialog.Cancel>
				<form
					method="POST"
					action={config.deleteAction}
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								handleSuccess(config.messages.deleteSuccess);
							} else if (result.type === 'failure') {
								handleError(config.messages.deleteError);
							}
						};
					}}
				>
					<input type="hidden" name="id" value={selectedEntity.id} />
					<AlertDialog.Action
						type="submit"
						class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{config.messages.delete}
					</AlertDialog.Action>
				</form>
			</AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
