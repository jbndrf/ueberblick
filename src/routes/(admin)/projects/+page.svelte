<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	let { data } = $props();
</script>

<div class="container mx-auto p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">Projects</h1>
		<Button href="/projects/new">Create Project</Button>
	</div>

	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each data.projects as project}
			<Card.Root>
				<Card.Header>
					<Card.Title>{project.name}</Card.Title>
					{#if project.description}
						<Card.Description>{project.description}</Card.Description>
					{:else if project.created}
						<Card.Description>
							Created: {new Date(project.created).toLocaleDateString()}
						</Card.Description>
					{/if}
				</Card.Header>
				<Card.Content>
					<Button href="/projects/{project.id}/participants" class="w-full">
						Open Project
					</Button>
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="col-span-full text-center">
				<p class="mb-4 text-muted-foreground">
					No projects found. Create your first project to get started.
				</p>
				<Button href="/projects/new">Create Project</Button>
			</div>
		{/each}
	</div>
</div>
