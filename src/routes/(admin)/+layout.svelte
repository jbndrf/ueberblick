<script lang="ts">
	import { invalidate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { getPocketBase, onAuthStateChange, signOut } from '$lib/pocketbase';
	import * as m from '$lib/paraglide/messages';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import LanguageSelectorDropdown from '$lib/components/language-selector-dropdown.svelte';
	import {
		FolderKanban,
		Users,
		ShieldCheck,
		Table,
		Map,
		FileText,
		Workflow,
		MapPin,
		Settings,
		ChevronRight,
		UserCircle,
		LogOut,
		Plus
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	let { data, children } = $props();

	// Track logout state to prevent race conditions
	let isLoggingOut = $state(false);

	// Hide sidebar on login page
	const isLoginPage = $derived($page.url.pathname === '/login');

	// Derive current project ID from URL
	const currentProjectId = $derived.by(() => {
		const match = $page.url.pathname.match(/\/projects\/([^/]+)/);
		return match ? match[1] : null;
	});

	const currentProject = $derived(
		data.projects?.find((p: { id: string }) => p.id === currentProjectId)
	);

	// Sidebar entity data (loaded client-side)
	let sidebarWorkflows = $state<Array<{ id: string; name: string; workflow_type: string }>>([]);
	let sidebarTables = $state<Array<{ id: string; display_name: string }>>([]);
	let sidebarMarkerCategories = $state<Array<{ id: string; name: string }>>([]);
	let sidebarLoading = $state(false);

	// Track collapsed state for groups
	let workflowsCollapsed = $state(false);
	let tablesCollapsed = $state(false);

	// Load sidebar entities when project changes
	$effect(() => {
		if (currentProjectId) {
			loadSidebarData(currentProjectId);
		} else {
			sidebarWorkflows = [];
			sidebarTables = [];
			sidebarMarkerCategories = [];
		}
	});

	async function loadSidebarData(projectId: string) {
		sidebarLoading = true;
		const pb = getPocketBase();
		try {
			const [workflows, tables, markers] = await Promise.all([
				pb.collection('workflows').getFullList({
					filter: `project_id = "${projectId}"`,
					fields: 'id,name,workflow_type',
					sort: 'name',
					requestKey: null
				}),
				pb.collection('custom_tables').getFullList({
					filter: `project_id = "${projectId}"`,
					fields: 'id,display_name',
					sort: 'display_name',
					requestKey: null
				}),
				pb.collection('marker_categories').getFullList({
					filter: `project_id = "${projectId}"`,
					fields: 'id,name',
					sort: 'name',
					requestKey: null
				})
			]);
			sidebarWorkflows = workflows as any;
			sidebarTables = tables as any;
			sidebarMarkerCategories = markers as any;
		} catch (err) {
			console.error('Failed to load sidebar data:', err);
		} finally {
			sidebarLoading = false;
		}
	}

	// Quick-create functions
	async function createWorkflow(type: 'incident' | 'survey') {
		if (!currentProjectId) return;
		const pb = getPocketBase();
		try {
			const record = await pb.collection('workflows').create({
				project_id: currentProjectId,
				name: type === 'incident' ? 'New Incident Workflow' : 'New Survey Workflow',
				workflow_type: type,
				is_active: false,
				marker_color: type === 'incident' ? '#ff0000' : null,
				icon_config: {}
			});
			await loadSidebarData(currentProjectId);
			await goto(`/projects/${currentProjectId}/workflows/${record.id}`);
		} catch (err) {
			console.error('Failed to create workflow:', err);
			toast.error('Failed to create workflow');
		}
	}

	async function createTable(hasCoordinates: boolean) {
		if (!currentProjectId) return;
		const pb = getPocketBase();
		try {
			if (hasCoordinates) {
				const record = await pb.collection('marker_categories').create({
					project_id: currentProjectId,
					name: 'New Marker Table',
					icon_config: {},
					visible_to_roles: [],
					fields: []
				});
				await loadSidebarData(currentProjectId);
				await goto(`/projects/${currentProjectId}/marker-categories/${record.id}`);
			} else {
				const record = await pb.collection('custom_tables').create({
					project_id: currentProjectId,
					table_name: 'new_table_' + Date.now(),
					display_name: 'New Table'
				});
				await loadSidebarData(currentProjectId);
				await goto(`/projects/${currentProjectId}/custom-tables/${record.id}`);
			}
		} catch (err) {
			console.error('Failed to create table:', err);
			toast.error('Failed to create table');
		}
	}

	// Static menu items for project context
	const projectStaticItems = [
		{ href: 'settings', icon: Settings, label: () => m.navProjectSettings() },
		{ href: 'participants', icon: Users, label: () => m.navParticipants() },
		{ href: 'roles', icon: ShieldCheck, label: () => m.navRoles() }
	];

	const globalMenuItems = [
		{ href: '/rules', icon: Settings, label: () => m.navGlobalRules() }
	];

	async function handleSignOut() {
		isLoggingOut = true;

		try {
			signOut();
			await fetch('/logout', {
				method: 'POST',
				redirect: 'manual'
			});
		} catch (error) {
			console.error('Logout error:', error);
		} finally {
			await goto('/login', { replaceState: true, invalidateAll: true });
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChange((user) => {
			if (!isLoggingOut && ((user && !data.user) || (!user && data.user))) {
				invalidate('pocketbase:auth');
			}
		});

		return () => {
			unsubscribe();
		};
	});
</script>

<div class="admin-theme">
{#if isLoginPage}
	{@render children()}
{:else}
	<Sidebar.Provider>
		<Sidebar.Root>
			<Sidebar.Content>
				<!-- Sidebar Header -->
				<Sidebar.Header>
					<div class="flex items-center gap-2 px-2 py-2">
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
							<MapPin class="h-5 w-5" />
						</div>
						<span class="font-semibold text-lg">Überblick Sector</span>
					</div>
				</Sidebar.Header>

				<div class="flex-1 overflow-y-auto px-2">
					<!-- Projects link -->
					<Sidebar.Menu>
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={$page.url.pathname === '/projects'}>
								{#snippet child({ props })}
									<a href="/projects" {...props}>
										<FolderKanban class="h-4 w-4" />
										<span>{m.navProjects()}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					</Sidebar.Menu>

					{#if currentProject}
						<Sidebar.Separator class="my-3" />

						<!-- Current project name -->
						<div class="px-2 py-1 mb-2">
							<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{currentProject.name}</span>
						</div>

						<!-- Static project items (Map Settings, Participants, Roles) -->
						<Sidebar.Menu>
							{#each projectStaticItems as item}
								{@const Icon = item.icon}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={$page.url.pathname === `/projects/${currentProjectId}/${item.href}`}>
										{#snippet child({ props })}
											<a href="/projects/{currentProjectId}/{item.href}" {...props}>
												<Icon class="h-4 w-4" />
												<span>{item.label()}</span>
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>

						<Sidebar.Separator class="my-3" />

						<!-- Workflows Group -->
						<Sidebar.Group>
							<Sidebar.GroupLabel class="flex items-center justify-between">
								<button
									class="flex items-center gap-1 hover:text-foreground transition-colors"
									onclick={() => (workflowsCollapsed = !workflowsCollapsed)}
								>
									<ChevronRight
										class="h-3 w-3 transition-transform {workflowsCollapsed ? '' : 'rotate-90'}"
									/>
									{m.navWorkflows()}
								</button>
							</Sidebar.GroupLabel>
							<Sidebar.GroupAction>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<button {...props}>
												<Plus class="h-4 w-4" />
												<span class="sr-only">Add workflow</span>
											</button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content side="right" align="start" class="w-48">
										<DropdownMenu.Item onclick={() => createWorkflow('incident')}>
											<MapPin class="mr-2 h-4 w-4" />
											{m.navNewIncident()}
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => createWorkflow('survey')}>
											<Workflow class="mr-2 h-4 w-4" />
											{m.navNewSurvey()}
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Sidebar.GroupAction>
							{#if !workflowsCollapsed}
								<Sidebar.GroupContent>
									<Sidebar.Menu>
										{#each sidebarWorkflows as wf}
											<Sidebar.MenuItem>
												<Sidebar.MenuSubButton
													href="/projects/{currentProjectId}/workflows/{wf.id}"
													isActive={$page.url.pathname.startsWith(`/projects/${currentProjectId}/workflows/${wf.id}`)}
												>
													{#if wf.workflow_type === 'incident'}
														<MapPin class="h-4 w-4" />
													{:else}
														<Workflow class="h-4 w-4" />
													{/if}
													<span>{wf.name}</span>
												</Sidebar.MenuSubButton>
											</Sidebar.MenuItem>
										{/each}
										{#if sidebarWorkflows.length === 0 && !sidebarLoading}
											<div class="px-3 py-2 text-xs text-muted-foreground">
												{m.navNoWorkflows()}
											</div>
										{/if}
									</Sidebar.Menu>
								</Sidebar.GroupContent>
							{/if}
						</Sidebar.Group>

						<!-- Tables Group (custom tables + marker categories) -->
						<Sidebar.Group>
							<Sidebar.GroupLabel class="flex items-center justify-between">
								<button
									class="flex items-center gap-1 hover:text-foreground transition-colors"
									onclick={() => (tablesCollapsed = !tablesCollapsed)}
								>
									<ChevronRight
										class="h-3 w-3 transition-transform {tablesCollapsed ? '' : 'rotate-90'}"
									/>
									{m.navTables()}
								</button>
							</Sidebar.GroupLabel>
							<Sidebar.GroupAction>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<button {...props}>
												<Plus class="h-4 w-4" />
												<span class="sr-only">Add table</span>
											</button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content side="right" align="start" class="w-48">
										<DropdownMenu.Item onclick={() => createTable(false)}>
											<Table class="mr-2 h-4 w-4" />
											{m.navNewTable()}
										</DropdownMenu.Item>
										<DropdownMenu.Item onclick={() => createTable(true)}>
											<MapPin class="mr-2 h-4 w-4" />
											{m.navNewMarkerTable()}
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</Sidebar.GroupAction>
							{#if !tablesCollapsed}
								<Sidebar.GroupContent>
									<Sidebar.Menu>
										{#each sidebarTables as tbl}
											<Sidebar.MenuItem>
												<Sidebar.MenuSubButton
													href="/projects/{currentProjectId}/custom-tables/{tbl.id}"
													isActive={$page.url.pathname.startsWith(`/projects/${currentProjectId}/custom-tables/${tbl.id}`)}
												>
													<Table class="h-4 w-4" />
													<span>{tbl.display_name}</span>
												</Sidebar.MenuSubButton>
											</Sidebar.MenuItem>
										{/each}
										{#each sidebarMarkerCategories as mc}
											<Sidebar.MenuItem>
												<Sidebar.MenuSubButton
													href="/projects/{currentProjectId}/marker-categories/{mc.id}"
													isActive={$page.url.pathname.startsWith(`/projects/${currentProjectId}/marker-categories/${mc.id}`)}
												>
													<MapPin class="h-4 w-4" />
													<span>{mc.name}</span>
												</Sidebar.MenuSubButton>
											</Sidebar.MenuItem>
										{/each}
										{#if sidebarTables.length === 0 && sidebarMarkerCategories.length === 0 && !sidebarLoading}
											<div class="px-3 py-2 text-xs text-muted-foreground">
												{m.navNoTables()}
											</div>
										{/if}
									</Sidebar.Menu>
								</Sidebar.GroupContent>
							{/if}
						</Sidebar.Group>

					{:else if data.projects && data.projects.length > 0}
						<Sidebar.Separator class="my-4" />
						<Sidebar.Group>
							<Sidebar.GroupLabel>{m.navYourProjects()}</Sidebar.GroupLabel>
							<Sidebar.GroupContent>
								<Sidebar.Menu>
									{#each data.projects as project}
										<Sidebar.MenuItem>
											<Sidebar.MenuButton>
												{#snippet child({ props })}
													<a href="/projects/{project.id}/workflows" {...props}>
														<FolderKanban class="h-4 w-4" />
														<span>{project.name}</span>
													</a>
												{/snippet}
											</Sidebar.MenuButton>
										</Sidebar.MenuItem>
									{/each}
								</Sidebar.Menu>
							</Sidebar.GroupContent>
						</Sidebar.Group>
					{:else if data.user}
						<Sidebar.Separator class="my-4" />
						<div class="px-4 py-3 text-sm text-muted-foreground text-center">
							<p>{m.navNoProjectsYet()}</p>
							<Button href="/projects" variant="link" size="sm" class="mt-1">
								{m.navCreateFirstProject()}
							</Button>
						</div>
					{/if}

					<!-- Global Menu Items -->
					<Sidebar.Separator class="my-4" />
					<Sidebar.Menu>
						{#each globalMenuItems as item}
							{@const Icon = item.icon}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={$page.url.pathname === item.href}>
									{#snippet child({ props })}
										<a href={item.href} {...props}>
											<Icon class="h-4 w-4" />
											<span>{item.label()}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</div>
			</Sidebar.Content>
		</Sidebar.Root>

		<!-- Main Content Area -->
		<Sidebar.Inset class="max-h-svh">
			<!-- Header -->
			<header class="sticky top-0 z-10 flex h-10 items-center gap-2 border-b bg-background px-3">
				<Sidebar.Trigger />

				<!-- Spacer -->
				<div class="flex-1"></div>

				<!-- Header Actions -->
				<div class="flex items-center gap-3">
					<!-- User Dropdown -->
					{#if data.user}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="ghost" size="icon" class="h-9 w-9">
										<UserCircle class="h-5 w-5" />
										<span class="sr-only">{m.profileAccount()}</span>
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-56">
								<DropdownMenu.Label>
									<div class="flex flex-col space-y-1">
										<p class="text-sm font-medium leading-none">{m.profileAccount()}</p>
										<p class="text-xs leading-none text-muted-foreground">
											{data.user.email}
										</p>
									</div>
								</DropdownMenu.Label>
								<DropdownMenu.Separator />

								<!-- Theme Toggle -->
								<ModeToggle />

								<!-- Language Selector -->
								<LanguageSelectorDropdown />

								<DropdownMenu.Separator />

								<DropdownMenu.Item href="/settings">
									<Settings class="mr-2 h-4 w-4" />
									{m.profileSettings()}
								</DropdownMenu.Item>
								<DropdownMenu.Separator />
								<DropdownMenu.Item onclick={handleSignOut}>
									<LogOut class="mr-2 h-4 w-4" />
									{m.profileSignOut()}
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{/if}
				</div>
			</header>

			<!-- Page Content -->
			<main class="flex-1 min-h-0 overflow-y-auto p-3">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
</div>
