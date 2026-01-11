<script lang="ts">
	import { invalidate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { getPocketBase, onAuthStateChange, signOut } from '$lib/pocketbase';
	import * as m from '$lib/paraglide/messages';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import LanguageSelectorDropdown from '$lib/components/language-selector-dropdown.svelte';
	import {
		LayoutDashboard,
		FolderKanban,
		Users,
		ShieldCheck,
		Table,
		Map,
		Workflow,
		MapPin,
		Settings,
		ChevronRight,
		UserCircle,
		LogOut
	} from 'lucide-svelte';

	let { data, children } = $props();

	// Track which project is expanded
	let expandedProjectId = $state<string | null>(null);

	// Track logout state to prevent race conditions
	let isLoggingOut = $state(false);

	// Hide sidebar on login page
	const isLoginPage = $derived($page.url.pathname === '/login');

	// Menu items configuration
	const menuItems = [
		{ href: '/admin', icon: LayoutDashboard, labelKey: 'navDashboard' },
		{ href: '/projects', icon: FolderKanban, labelKey: 'navProjects' }
	];

	const projectMenuItems = [
		{ href: 'participants', icon: Users, labelKey: 'navParticipants' },
		{ href: 'roles', icon: ShieldCheck, labelKey: 'navRoles' },
		{ href: 'workflows', icon: Workflow, labelKey: 'navWorkflows', separatorAfter: true },
		{ href: 'custom-tables', icon: Table, labelKey: 'navCustomTables' },
		{ href: 'marker-categories', icon: MapPin, labelKey: 'navMarkerCategories', separatorAfter: true },
		{ href: 'map-settings', icon: Map, labelKey: 'navMapSettings' }
	];

	const globalMenuItems = [{ href: '/rules', icon: Settings, labelKey: 'navGlobalRules' }];

	function toggleProject(projectId: string) {
		expandedProjectId = expandedProjectId === projectId ? null : projectId;
	}

	async function handleSignOut() {
		isLoggingOut = true;

		try {
			// Clear client-side auth first
			signOut();

			// Call the server logout endpoint to clear server-side cookie
			await fetch('/logout', {
				method: 'POST',
				redirect: 'manual'
			});
		} catch (error) {
			console.error('Logout error:', error);
		} finally {
			// Navigate to login page with full reload
			// Use invalidateAll to ensure layout reloads and redirect happens
			await goto('/login', { replaceState: true, invalidateAll: true });
		}
	}

	onMount(() => {
		// Subscribe to auth state changes
		const unsubscribe = onAuthStateChange((user) => {
			// Only invalidate if we're not logging out
			// This prevents race condition between goto() and layout reload
			if (!isLoggingOut && ((user && !data.user) || (!user && data.user))) {
				invalidate('pocketbase:auth');
			}
		});

		return () => {
			unsubscribe();
		};
	});
</script>

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
						<span class="font-semibold text-lg">Karte</span>
					</div>
				</Sidebar.Header>

				<!-- Main Navigation -->
				<div class="flex-1 overflow-y-auto px-2">
					<Sidebar.Menu>
						{#each menuItems as item}
							{@const Icon = item.icon}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton href={item.href} isActive={$page.url.pathname === item.href}>
									<Icon class="h-4 w-4" />
									<span>{m[item.labelKey]()}</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>

					<!-- Projects Section -->
					{#if data.projects && data.projects.length > 0}
						<Sidebar.Separator class="my-4" />
						<Sidebar.Group>
							<Sidebar.GroupLabel>{m.navYourProjects()}</Sidebar.GroupLabel>
							<Sidebar.GroupContent>
								<Sidebar.Menu>
									{#each data.projects as project}
										<Sidebar.MenuItem>
											<!-- Project Name as Toggle -->
											<Sidebar.MenuButton
												onclick={() => toggleProject(project.id)}
												class="w-full justify-between"
											>
												<span class="font-medium">{project.name}</span>
												<ChevronRight
													class="h-4 w-4 transition-transform {expandedProjectId === project.id
														? 'rotate-90'
														: ''}"
												/>
											</Sidebar.MenuButton>

											<!-- Project Submenu -->
											{#if expandedProjectId === project.id}
												<Sidebar.MenuSub>
													{#each projectMenuItems as subItem}
														{@const SubIcon = subItem.icon}
														<Sidebar.MenuSubItem>
															<Sidebar.MenuSubButton
																href="/projects/{project.id}/{subItem.href}"
																isActive={$page.url.pathname ===
																	`/projects/${project.id}/${subItem.href}`}
															>
																<SubIcon class="h-4 w-4" />
																<span>{m[subItem.labelKey]()}</span>
															</Sidebar.MenuSubButton>
														</Sidebar.MenuSubItem>
														{#if subItem.separatorAfter}
															<Sidebar.Separator class="my-1" />
														{/if}
													{/each}
												</Sidebar.MenuSub>
											{/if}
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
								<Sidebar.MenuButton href={item.href} isActive={$page.url.pathname === item.href}>
									<Icon class="h-4 w-4" />
									<span>{m[item.labelKey]()}</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</div>
			</Sidebar.Content>
		</Sidebar.Root>

		<!-- Main Content Area -->
		<Sidebar.Inset>
			<!-- Header -->
			<header class="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6">
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
			<main class="flex-1 p-6">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
