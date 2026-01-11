<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';

	let { data } = $props();

	const projectSchema = z.object({
		name: z.string().min(1, 'Name is required').max(255),
		description: z.string().max(1000).optional()
	});

	const form = superForm(data.form, {
		validators: zodClient(projectSchema)
	});

	const { form: formData, enhance, errors } = form;
</script>

<div class="container mx-auto max-w-2xl p-6">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Create New Project</h1>
		<p class="text-muted-foreground">Create a new project to get started</p>
	</div>

	<Card.Root>
		<Card.Content class="pt-6">
			<form method="POST" use:enhance>
				<div class="space-y-4">
					<div class="space-y-2">
						<Label for="name">Project Name</Label>
						<Input
							id="name"
							name="name"
							bind:value={$formData.name}
							placeholder="My Project"
							aria-invalid={$errors.name ? 'true' : undefined}
						/>
						{#if $errors.name}
							<p class="text-sm text-destructive">{$errors.name}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="description">Description</Label>
						<Textarea
							id="description"
							name="description"
							bind:value={$formData.description}
							placeholder="Project description..."
							rows={4}
						/>
						{#if $errors.description}
							<p class="text-sm text-destructive">{$errors.description}</p>
						{/if}
					</div>

					<div class="flex gap-4">
						<Button type="submit">Create Project</Button>
						<Button type="button" variant="outline" href="/projects">Cancel</Button>
					</div>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
