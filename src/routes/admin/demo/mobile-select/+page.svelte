<script lang="ts">
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';

	// Dummy data: Countries
	let countries = $state([
		{ id: '1', name: 'Germany', description: 'Central Europe' },
		{ id: '2', name: 'France', description: 'Western Europe' },
		{ id: '3', name: 'Spain', description: 'Southern Europe' },
		{ id: '4', name: 'Italy', description: 'Southern Europe' },
		{ id: '5', name: 'United Kingdom', description: 'Northern Europe' },
		{ id: '6', name: 'Netherlands', description: 'Western Europe' },
		{ id: '7', name: 'Belgium', description: 'Western Europe' },
		{ id: '8', name: 'Austria', description: 'Central Europe' },
		{ id: '9', name: 'Switzerland', description: 'Central Europe' },
		{ id: '10', name: 'Poland', description: 'Eastern Europe' },
		{ id: '11', name: 'Czech Republic', description: 'Central Europe' },
		{ id: '12', name: 'Sweden', description: 'Northern Europe' },
		{ id: '13', name: 'Norway', description: 'Northern Europe' },
		{ id: '14', name: 'Denmark', description: 'Northern Europe' },
		{ id: '15', name: 'Finland', description: 'Northern Europe' }
	]);

	// Dummy data: Roles
	const roles = [
		{ id: 'admin', name: 'Administrator', description: 'Full system access' },
		{ id: 'editor', name: 'Editor', description: 'Can edit content' },
		{ id: 'viewer', name: 'Viewer', description: 'Read-only access' },
		{ id: 'moderator', name: 'Moderator', description: 'Can moderate content' }
	];

	// Dummy data: Tags (with create functionality)
	let tags = $state([
		{ id: 'tag1', name: 'Important' },
		{ id: 'tag2', name: 'Urgent' },
		{ id: 'tag3', name: 'Review' },
		{ id: 'tag4', name: 'Bug' },
		{ id: 'tag5', name: 'Feature' }
	]);

	// State for each selector
	let selectedCountries = $state<string[]>(['1', '3']);
	let selectedRoles = $state<string[]>([]);
	let selectedTags = $state<string[]>([]);
	let selectedCountriesHidden = $state<string[]>(['2', '4']);

	// Counter for generating new IDs
	let tagIdCounter = $state(6);

	// Create function for tags
	function createTag(name: string) {
		const newTag = {
			id: `tag${tagIdCounter}`,
			name: name
		};
		tagIdCounter++;
		return newTag;
	}
</script>

<div class="container mx-auto p-6 max-w-2xl space-y-8">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Mobile Multi-Select Demo</h1>
		<p class="text-muted-foreground mt-2">
			Test the mobile-friendly multi-select component. On mobile (&lt;768px), it opens a full-screen modal.
			On desktop, it shows a dropdown.
		</p>
	</div>

	<div class="p-4 bg-muted rounded-lg text-sm">
		<strong>Testing Tips:</strong>
		<ul class="list-disc list-inside mt-2 space-y-1">
			<li>Use Chrome DevTools device mode to test mobile behavior</li>
			<li>Tap the search bar to open keyboard - modal resizes automatically</li>
			<li>Uses visualViewport API to detect keyboard and adjust modal height</li>
			<li>Radio dots indicate selection state</li>
		</ul>
	</div>

	<!-- Multi-select: selected items VISIBLE in list (default) -->
	<div class="space-y-2">
		<label class="text-sm font-medium">Countries (selected stay visible in list)</label>
		<MobileMultiSelect
			bind:selectedIds={selectedCountries}
			bind:options={countries}
			getOptionId={(c) => c.id}
			getOptionLabel={(c) => c.name}
			getOptionDescription={(c) => c.description}
			placeholder="Select countries..."
		/>
		<p class="text-xs text-muted-foreground">
			Selected: {selectedCountries.length > 0 ? selectedCountries.join(', ') : 'None'}
		</p>
		<p class="text-xs text-primary">
			Selected items remain in the list with filled radio dots.
		</p>
	</div>

	<!-- Multi-select: selected items HIDDEN from list -->
	<div class="space-y-2">
		<label class="text-sm font-medium">Countries (selected hidden from list)</label>
		<MobileMultiSelect
			bind:selectedIds={selectedCountriesHidden}
			bind:options={countries}
			getOptionId={(c) => c.id}
			getOptionLabel={(c) => c.name}
			getOptionDescription={(c) => c.description}
			placeholder="Select countries..."
			hideSelected={true}
		/>
		<p class="text-xs text-muted-foreground">
			Selected: {selectedCountriesHidden.length > 0 ? selectedCountriesHidden.join(', ') : 'None'}
		</p>
		<p class="text-xs text-primary">
			Selected items are removed from the list (only visible as badges).
		</p>
	</div>

	<!-- Single select with descriptions -->
	<div class="space-y-2">
		<label class="text-sm font-medium">Role (single-select with descriptions)</label>
		<MobileMultiSelect
			bind:selectedIds={selectedRoles}
			options={roles}
			getOptionId={(r) => r.id}
			getOptionLabel={(r) => r.name}
			getOptionDescription={(r) => r.description}
			placeholder="Select a role..."
			singleSelect={true}
		/>
		<p class="text-xs text-muted-foreground">
			Selected: {selectedRoles.length > 0 ? selectedRoles.join(', ') : 'None'}
		</p>
	</div>

	<!-- Multi-select with CREATE functionality -->
	<div class="space-y-2">
		<label class="text-sm font-medium">Tags (multi-select with CREATE)</label>
		<MobileMultiSelect
			bind:selectedIds={selectedTags}
			bind:options={tags}
			getOptionId={(t) => t.id}
			getOptionLabel={(t) => t.name}
			placeholder="Select or create tags..."
			allowCreate={true}
			onCreateOption={createTag}
		/>
		<p class="text-xs text-muted-foreground">
			Selected: {selectedTags.length > 0 ? selectedTags.join(', ') : 'None'}
		</p>
		<p class="text-xs text-primary">
			Type something new and press Enter or click "Create" to add a new tag!
		</p>
	</div>

	<!-- Debug info -->
	<div class="p-4 bg-muted/50 rounded-lg text-xs font-mono space-y-2">
		<div><strong>Debug State:</strong></div>
		<div>Countries (visible): {JSON.stringify(selectedCountries)}</div>
		<div>Countries (hidden): {JSON.stringify(selectedCountriesHidden)}</div>
		<div>Roles: {JSON.stringify(selectedRoles)}</div>
		<div>Tags: {JSON.stringify(selectedTags)}</div>
		<div>All Tags: {JSON.stringify(tags.map(t => t.name))}</div>
	</div>
</div>
