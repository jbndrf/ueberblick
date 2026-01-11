<script lang="ts">
	import ResponsiveSidebar from '$lib/components/responsive-sidebar.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';

	// State
	let sidebarOpen = $state(false);
	let forceMobileMode = $state(false);
	let currentIndex = $state(0);

	// Comprehensive dummy data matching legacy structure
	const dummyItems = [
		{
			id: 1,
			title: 'Infrastructure Incident #2847',
			subtitle: 'Created on 2025-01-20',
			description: 'Critical water pipe damage requiring immediate attention. Multiple residential units affected.',
			status: 'Active',
			location: 'Hauptstrasse 42, Berlin',
			lat: 52.52,
			lng: 13.405,
			createdAt: new Date(Date.now() - 7200000).toISOString(),
			priority: 'High',
			category: 'Infrastructure',
			assignee: 'Maria Schmidt',
			photos: [
				{ url: 'https://picsum.photos/400/300?random=1', caption: 'Initial Damage Assessment', stageName: 'Initial Report' },
				{ url: 'https://picsum.photos/400/300?random=2', caption: 'Water Leak Detail', stageName: 'Initial Report' },
				{ url: 'https://picsum.photos/400/300?random=3', caption: 'Affected Area Overview', stageName: 'Site Inspection' },
				{ url: 'https://picsum.photos/400/300?random=4', caption: 'Repair Equipment', stageName: 'Repair Phase' }
			],
			auditTrail: [
				{
					id: 1,
					executed_at: new Date(Date.now() - 7200000).toISOString(),
					participant_name: 'Thomas Weber',
					action_name: 'Incident Created',
					notes: 'Emergency report filed with high priority'
				},
				{
					id: 2,
					executed_at: new Date(Date.now() - 5400000).toISOString(),
					participant_name: 'Maria Schmidt',
					action_name: 'Site Inspection Completed',
					notes: 'Confirmed damage scope, requires specialized equipment'
				},
				{
					id: 3,
					executed_at: new Date(Date.now() - 3600000).toISOString(),
					participant_name: 'Klaus Müller',
					action_name: 'Repair Team Assigned',
					notes: 'Emergency crew dispatched, ETA 30 minutes'
				},
				{
					id: 4,
					executed_at: new Date(Date.now() - 1800000).toISOString(),
					participant_name: 'Maria Schmidt',
					action_name: 'Work in Progress',
					notes: 'Repair team on site, water main isolated'
				}
			],
			actions: [
				{ id: 'edit', label: 'Edit', icon: '✎', color: '#007AFF', onClick: () => alert('Edit action') },
				{ id: 'assign', label: 'Assign', icon: '⚲', color: '#FF9500', onClick: () => alert('Assign action') },
				{ id: 'update', label: 'Update Status', icon: '⟳', color: '#34C759', onClick: () => alert('Update action') },
				{ id: 'photo', label: 'Add Photo', icon: '⊕', color: '#5856D6', onClick: () => alert('Photo action') },
				{ id: 'close', label: 'Close Case', icon: '✓', color: '#FF3B30', onClick: () => alert('Close action') }
			]
		},
		{
			id: 2,
			title: 'Environmental Survey #3421',
			subtitle: 'Created on 2025-01-18',
			description: 'Routine environmental assessment for park maintenance and biodiversity monitoring.',
			status: 'In Progress',
			location: 'Tiergarten Park, Section B',
			lat: 52.514,
			lng: 13.35,
			createdAt: new Date(Date.now() - 172800000).toISOString(),
			priority: 'Medium',
			category: 'Environmental',
			assignee: 'Dr. Anna Fischer',
			photos: [
				{ url: 'https://picsum.photos/400/300?random=5', caption: 'Survey Area Overview', stageName: 'Initial Survey' },
				{ url: 'https://picsum.photos/400/300?random=6', caption: 'Vegetation Sample', stageName: 'Data Collection' },
				{ url: 'https://picsum.photos/400/300?random=7', caption: 'Wildlife Documentation', stageName: 'Data Collection' }
			],
			auditTrail: [
				{
					id: 5,
					executed_at: new Date(Date.now() - 172800000).toISOString(),
					participant_name: 'Dr. Anna Fischer',
					action_name: 'Survey Initiated',
					notes: 'Started environmental assessment protocol'
				},
				{
					id: 6,
					executed_at: new Date(Date.now() - 86400000).toISOString(),
					participant_name: 'Michael Wagner',
					action_name: 'Field Data Collected',
					notes: 'Collected soil and vegetation samples'
				}
			],
			actions: [
				{ id: 'edit', label: 'Edit', icon: '✎', color: '#007AFF', onClick: () => alert('Edit action') },
				{ id: 'data', label: 'Add Data', icon: '⊞', color: '#34C759', onClick: () => alert('Data action') },
				{ id: 'photo', label: 'Add Photo', icon: '⊕', color: '#5856D6', onClick: () => alert('Photo action') }
			]
		},
		{
			id: 3,
			title: 'Cultural Heritage Site #1095',
			subtitle: 'Created on 2025-01-15',
			description: 'Historical building documentation and preservation status assessment.',
			status: 'Completed',
			location: 'Alte Bibliothek, Unter den Linden',
			lat: 52.5176,
			lng: 13.3939,
			createdAt: new Date(Date.now() - 604800000).toISOString(),
			priority: 'Low',
			category: 'Cultural',
			assignee: 'Prof. Hermann Klein',
			photos: [
				{ url: 'https://picsum.photos/400/300?random=8', caption: 'Building Facade', stageName: 'Documentation' },
				{ url: 'https://picsum.photos/400/300?random=9', caption: 'Architectural Details', stageName: 'Documentation' },
				{ url: 'https://picsum.photos/400/300?random=10', caption: 'Interior Preservation', stageName: 'Assessment' },
				{ url: 'https://picsum.photos/400/300?random=11', caption: 'Final Report', stageName: 'Completion' }
			],
			auditTrail: [
				{
					id: 7,
					executed_at: new Date(Date.now() - 604800000).toISOString(),
					participant_name: 'Prof. Hermann Klein',
					action_name: 'Documentation Started',
					notes: 'Began comprehensive heritage assessment'
				},
				{
					id: 8,
					executed_at: new Date(Date.now() - 432000000).toISOString(),
					participant_name: 'Julia Becker',
					action_name: 'Structural Analysis Complete',
					notes: 'Building condition evaluated, minor repairs needed'
				},
				{
					id: 9,
					executed_at: new Date(Date.now() - 259200000).toISOString(),
					participant_name: 'Prof. Hermann Klein',
					action_name: 'Assessment Completed',
					notes: 'Final report submitted to heritage commission'
				}
			],
			actions: [
				{ id: 'view', label: 'View Report', icon: '⎙', color: '#007AFF', onClick: () => alert('View report') },
				{ id: 'export', label: 'Export', icon: '↓', color: '#5856D6', onClick: () => alert('Export action') }
			]
		}
	];

	// Open sidebar with specific item
	function openSidebar(index: number) {
		currentIndex = index;
		sidebarOpen = true;
	}

	// Navigation handlers
	function handleNext() {
		if (currentIndex < dummyItems.length - 1) {
			currentIndex++;
		}
	}

	function handlePrevious() {
		if (currentIndex > 0) {
			currentIndex--;
		}
	}

	// Get status color
	function getStatusColor(status: string) {
		switch (status) {
			case 'Completed':
				return 'bg-green-100 text-green-800 hover:bg-green-100';
			case 'Active':
				return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
			case 'In Progress':
				return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
			default:
				return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
		}
	}

	// Toggle device mode simulation
	function toggleDeviceMode() {
		forceMobileMode = !forceMobileMode;
		window.dispatchEvent(new Event('resize'));
	}

	// Handle close
	function handleClose() {
		sidebarOpen = false;
	}

	// Get current item
	const currentItem = $derived(dummyItems[currentIndex]);
</script>

<div class="min-h-screen bg-background p-6" class:max-w-[375px]={forceMobileMode}>
	<div class="max-w-6xl mx-auto">
		<!-- Page Header -->
		<div class="mb-8">
			<h1 class="text-3xl font-bold text-foreground mb-2">Enhanced Responsive Sidebar</h1>
			<p class="text-muted-foreground">
				Full-featured tabbed interface with action buttons, photo gallery, and audit trail. Test all features below.
			</p>

			<!-- Device Mode Toggle -->
			<div class="mt-4 flex items-center gap-4">
				<Button
					onclick={toggleDeviceMode}
					variant={forceMobileMode ? 'default' : 'outline'}
					class="gap-2"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						{#if forceMobileMode}
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
						{:else}
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
						{/if}
					</svg>
					{forceMobileMode ? 'Mobile Mode' : 'Desktop Mode'}
				</Button>
				<span class="text-sm text-muted-foreground">
					Current: {forceMobileMode ? 'Mobile (375px)' : 'Desktop (Auto)'}
				</span>
			</div>
		</div>

		<!-- Grid of items -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each dummyItems as item, index}
				<Card class="hover:shadow-lg transition-shadow">
					<CardHeader>
						<div class="flex items-start justify-between mb-2">
							<CardTitle class="text-base leading-tight">{item.title}</CardTitle>
							<Badge class={getStatusColor(item.status)}>{item.status}</Badge>
						</div>
						<CardDescription>{item.subtitle}</CardDescription>
					</CardHeader>
					<CardContent>
						<p class="text-sm text-muted-foreground mb-4 line-clamp-2">{item.description}</p>

						<div class="space-y-2 text-xs">
							<div class="flex justify-between">
								<span class="text-muted-foreground">Category:</span>
								<span class="font-medium text-foreground">{item.category}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Priority:</span>
								<Badge
									class={item.priority === 'High'
										? 'bg-red-100 text-red-800 hover:bg-red-100 text-[10px]'
										: item.priority === 'Medium'
											? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-[10px]'
											: 'bg-gray-100 text-gray-800 hover:bg-gray-100 text-[10px]'}
								>
									{item.priority}
								</Badge>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Photos:</span>
								<span class="font-medium text-foreground">{item.photos.length} attached</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">Assignee:</span>
								<span class="font-medium text-foreground">{item.assignee}</span>
							</div>
						</div>
					</CardContent>
					<CardFooter>
						<Button onclick={() => openSidebar(index)} variant="outline" class="w-full">
							View Details
						</Button>
					</CardFooter>
				</Card>
			{/each}
		</div>

		<!-- Feature List -->
		<div class="mt-8 p-6 bg-muted/50 rounded-lg border border-border">
			<h2 class="text-lg font-semibold text-foreground mb-3">Enhanced Features</h2>
			<div class="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
				<div>
					<h3 class="font-semibold mb-2 text-foreground">Tabbed Interface</h3>
					<ul class="space-y-1 ml-4">
						<li class="flex gap-2"><span>•</span><span>Overview tab with quick info cards</span></li>
						<li class="flex gap-2"><span>•</span><span>Details tab with all metadata</span></li>
						<li class="flex gap-2"><span>•</span><span>Photo gallery with captions</span></li>
						<li class="flex gap-2"><span>•</span><span>Activity history/audit trail</span></li>
					</ul>
				</div>
				<div>
					<h3 class="font-semibold mb-2 text-foreground">Interaction Features</h3>
					<ul class="space-y-1 ml-4">
						<li class="flex gap-2"><span>•</span><span>Action roll bar with custom buttons</span></li>
						<li class="flex gap-2"><span>•</span><span>Swipe left/right to navigate items</span></li>
						<li class="flex gap-2"><span>•</span><span>Drag up/down to expand/collapse</span></li>
						<li class="flex gap-2"><span>•</span><span>Responsive desktop/mobile layouts</span></li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Responsive Sidebar -->
<ResponsiveSidebar
	bind:isOpen={sidebarOpen}
	markerData={currentItem}
	photos={currentItem?.photos ?? []}
	auditTrail={currentItem?.auditTrail ?? []}
	actions={currentItem?.actions ?? []}
	onClose={handleClose}
	onNext={handleNext}
	onPrevious={handlePrevious}
/>
