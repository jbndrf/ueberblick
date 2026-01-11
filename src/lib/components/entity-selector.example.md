# EntitySelector Component

A generic, reusable component for selecting entities with support for search, creation, and keyboard navigation.

## Features

- Generic type support - works with any entity type
- Inline badge display for selected entities
- Single or multi-select modes
- Show/hide selected badges option
- Autocomplete with search functionality
- Optional entity creation
- Advanced keyboard navigation (Arrow keys, Enter, Backspace, Delete, Escape)
- Email-style badge navigation with keyboard cursor control
- Accessible with ARIA attributes
- Type `#` to show all available entities
- Customizable display and description functions

## Basic Usage

### Example 1: Role Selector

```svelte
<script lang="ts">
  import EntitySelector from '$lib/components/entity-selector.svelte';

  type Role = {
    id: string;
    name: string;
    description?: string;
  };

  let selectedRoleIds = $state<string[]>([]);
  let availableRoles = $state<Role[]>([
    { id: '1', name: 'Admin', description: 'Full access' },
    { id: '2', name: 'Editor', description: 'Can edit content' },
    { id: '3', name: 'Viewer', description: 'Read-only access' }
  ]);

  async function createRole(name: string): Promise<Role> {
    const newRole = {
      id: crypto.randomUUID(),
      name,
      description: ''
    };
    // Save to database here
    return newRole;
  }
</script>

<EntitySelector
  bind:selectedEntityIds={selectedRoleIds}
  bind:availableEntities={availableRoles}
  getEntityId={(role) => role.id}
  getEntityName={(role) => role.name}
  getEntityDescription={(role) => role.description}
  allowCreate={true}
  onCreateEntity={createRole}
  placeholder="Type # to see all roles or type to search/create..."
/>
```

### Example 2: Participant Selector

```svelte
<script lang="ts">
  import EntitySelector from '$lib/components/entity-selector.svelte';

  type Participant = {
    id: string;
    name: string;
    email?: string;
  };

  let selectedParticipantIds = $state<string[]>([]);
  let availableParticipants = $state<Participant[]>([
    { id: '1', name: 'John Doe', email: 'john@example.com' },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com' }
  ]);

  async function createParticipant(name: string): Promise<Participant> {
    const newParticipant = {
      id: crypto.randomUUID(),
      name,
      email: undefined
    };
    // Save to database here
    return newParticipant;
  }
</script>

<EntitySelector
  bind:selectedEntityIds={selectedParticipantIds}
  bind:availableEntities={availableParticipants}
  getEntityId={(participant) => participant.id}
  getEntityName={(participant) => participant.name}
  getEntityDescription={(participant) => participant.email}
  allowCreate={true}
  onCreateEntity={createParticipant}
  createLabel={(query) => `Add participant "${query}"`}
  placeholder="Search participants..."
/>
```

### Example 3: Tag Selector (Simple String Array)

```svelte
<script lang="ts">
  import EntitySelector from '$lib/components/entity-selector.svelte';

  type Tag = {
    id: string;
    label: string;
  };

  let selectedTagIds = $state<string[]>([]);
  let availableTags = $state<Tag[]>([
    { id: 'urgent', label: 'Urgent' },
    { id: 'important', label: 'Important' },
    { id: 'todo', label: 'To Do' }
  ]);

  async function createTag(label: string): Promise<Tag> {
    const id = label.toLowerCase().replace(/\s+/g, '-');
    return { id, label };
  }
</script>

<EntitySelector
  bind:selectedEntityIds={selectedTagIds}
  bind:availableEntities={availableTags}
  getEntityId={(tag) => tag.id}
  getEntityName={(tag) => tag.label}
  allowCreate={true}
  onCreateEntity={createTag}
  placeholder="Add tags..."
/>
```

### Example 4: Custom Field Selector (Without Creation)

```svelte
<script lang="ts">
  import EntitySelector from '$lib/components/entity-selector.svelte';

  type CustomField = {
    field_id: string;
    field_name: string;
    field_type: string;
  };

  let selectedFieldIds = $state<string[]>([]);
  let availableFields = $state<CustomField[]>([
    { field_id: 'f1', field_name: 'Age', field_type: 'number' },
    { field_id: 'f2', field_name: 'Address', field_type: 'text' }
  ]);
</script>

<EntitySelector
  bind:selectedEntityIds={selectedFieldIds}
  availableEntities={availableFields}
  getEntityId={(field) => field.field_id}
  getEntityName={(field) => field.field_name}
  getEntityDescription={(field) => `Type: ${field.field_type}`}
  allowCreate={false}
  placeholder="Select custom fields..."
/>
```

### Example 5: Single Select Mode (e.g., Status Selector)

```svelte
<script lang="ts">
  import EntitySelector from '$lib/components/entity-selector.svelte';

  type Status = {
    id: string;
    name: string;
    color: string;
  };

  let selectedStatusId = $state<string[]>([]);
  let availableStatuses = $state<Status[]>([
    { id: 'active', name: 'Active', color: 'green' },
    { id: 'pending', name: 'Pending', color: 'yellow' },
    { id: 'inactive', name: 'Inactive', color: 'red' }
  ]);
</script>

<EntitySelector
  bind:selectedEntityIds={selectedStatusId}
  bind:availableEntities={availableStatuses}
  getEntityId={(status) => status.id}
  getEntityName={(status) => status.name}
  getEntityDescription={(status) => `Color: ${status.color}`}
  singleSelect={true}
  placeholder="Select a status..."
/>

<!-- selectedStatusId will always contain 0 or 1 items -->
```

### Example 6: Hidden Selection Mode (e.g., Search with Result Display Elsewhere)

```svelte
<script lang="ts">
  import EntitySelector from '$lib/components/entity-selector.svelte';

  type User = {
    id: string;
    username: string;
    email: string;
  };

  let selectedUserIds = $state<string[]>([]);
  let availableUsers = $state<User[]>([
    { id: '1', username: 'john_doe', email: 'john@example.com' },
    { id: '2', username: 'jane_smith', email: 'jane@example.com' }
  ]);

  // Display selected users somewhere else in your UI
  const selectedUsers = $derived(
    selectedUserIds.map(id => availableUsers.find(u => u.id === id)).filter(Boolean)
  );
</script>

<EntitySelector
  bind:selectedEntityIds={selectedUserIds}
  bind:availableEntities={availableUsers}
  getEntityId={(user) => user.id}
  getEntityName={(user) => user.username}
  getEntityDescription={(user) => user.email}
  showSelection={false}
  placeholder="Search users..."
/>

<!-- Display selected users in a separate section -->
<div class="mt-4">
  <h3>Selected Users:</h3>
  <ul>
    {#each selectedUsers as user}
      <li>{user.username} - {user.email}</li>
    {/each}
  </ul>
</div>
```

### Example 7: Prefilled Selection (e.g., Edit Form)

```svelte
<script lang="ts">
  import EntitySelector from '$lib/components/entity-selector.svelte';
  import { onMount } from 'svelte';

  type Category = {
    id: string;
    name: string;
  };

  let selectedCategoryIds = $state<string[]>([]);
  let availableCategories = $state<Category[]>([]);

  // Prefill selection on mount (e.g., from database)
  onMount(async () => {
    availableCategories = [
      { id: 'tech', name: 'Technology' },
      { id: 'science', name: 'Science' },
      { id: 'business', name: 'Business' }
    ];

    // Load existing selection from database
    selectedCategoryIds = ['tech', 'science']; // Prefilled with existing data
  });
</script>

<EntitySelector
  bind:selectedEntityIds={selectedCategoryIds}
  bind:availableEntities={availableCategories}
  getEntityId={(category) => category.id}
  getEntityName={(category) => category.name}
  placeholder="Select categories..."
/>

<!-- The selector will show "Technology" and "Science" badges on load -->
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `selectedEntityIds` | `string[]` | No | `[]` | Array of selected entity IDs (bindable) |
| `availableEntities` | `T[]` | Yes | - | Array of available entities to select from (bindable) |
| `getEntityId` | `(entity: T) => string` | Yes | - | Function to extract ID from entity |
| `getEntityName` | `(entity: T) => string` | Yes | - | Function to extract display name from entity |
| `getEntityDescription` | `(entity: T) => string \| undefined` | No | - | Function to extract description from entity |
| `allowCreate` | `boolean` | No | `false` | Allow creating new entities |
| `placeholder` | `string` | No | `'Type to search or add...'` | Placeholder text for input |
| `class` | `string` | No | `''` | Additional CSS classes |
| `disabled` | `boolean` | No | `false` | Disable the selector |
| `onCreateEntity` | `(name: string) => Promise<T>` | No | `null` | Callback to create new entity |
| `createLabel` | `(query: string) => string` | No | - | Custom label for create option |
| `showSelection` | `boolean` | No | `true` | Show selected entities as inline badges |
| `singleSelect` | `boolean` | No | `false` | Enable single selection mode (replaces current selection) |

## Keyboard Navigation

### Input Field
- **Arrow Up/Down**: Navigate through suggestions
- **Enter**: Select highlighted suggestion or create new entity
- **Escape**: Close suggestions dropdown
- **Backspace** (when input is empty): Remove last selected entity (multi-select only)
- **Arrow Left** (at cursor position 0): Focus last badge (when showSelection is true)
- **#**: Type to show all available entities (filter mode)

### Badge Navigation (Email-style)
When badges are visible (`showSelection={true}`) and in multi-select mode:
- **Arrow Left**: Move focus to previous badge
- **Arrow Right**: Move focus to next badge or return to input field
- **Backspace/Delete**: Remove focused badge and focus previous badge or input
- **Enter/Space**: Remove focused badge
- Use keyboard to seamlessly navigate through selected items like in an email contact list

Note: Badge removal buttons are only shown in multi-select mode. In single-select mode, badges are displayed but cannot be individually removed (selecting a new item replaces the current one).

## Integration with Forms

The component works seamlessly with SvelteKit forms:

```svelte
<form method="POST" action="?/updateEntities">
  <input type="hidden" name="entityIds" value={JSON.stringify(selectedEntityIds)} />

  <EntitySelector
    bind:selectedEntityIds
    availableEntities={data.entities}
    getEntityId={(e) => e.id}
    getEntityName={(e) => e.name}
  />

  <button type="submit">Save</button>
</form>
```

## Styling

The component uses Tailwind CSS and respects your theme configuration. It integrates with shadcn-svelte's design system.

## Accessibility

- Full keyboard navigation support
- ARIA labels for screen readers
- Focus management
- Role attributes for interactive elements
