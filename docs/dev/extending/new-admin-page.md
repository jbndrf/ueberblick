# Adding a CRUD Page to Sector (Admin)

What you will learn: How to add a new admin page with server-side data loading, form validation, and inline-editable tables. This follows the existing pattern used by Roles, Custom Tables, and Marker Categories.

---

## Files to Create

For a new entity (e.g. "sensors") under a project, create:

```
src/routes/(admin)/projects/[projectId]/sensors/
  +page.server.ts    # Load data + form actions
  +page.svelte       # UI with BaseTable + CrudDialogs
```

You will also modify:

- `src/routes/(admin)/+layout.svelte` -- add sidebar navigation link
- `messages/en.json` and `messages/de.json` -- add translation keys

---

## Step 1: Server Load + Actions (`+page.server.ts`)

The server file handles data loading and form actions. It uses `event.locals.pb` (the per-request PocketBase instance set by `hooks.server.ts`).

```ts
// src/routes/(admin)/projects/[projectId]/sensors/+page.server.ts
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createUpdateFieldAction, createDeleteAction } from '$lib/server/crud-actions';

// 1. Define your Zod schema for form validation
const sensorSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  sensor_type: z.enum(['temperature', 'humidity', 'pressure'])
});

// 2. Load function -- runs on every page request
export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
  const { projectId } = params;

  try {
    const sensors = await pb.collection('sensors').getFullList({
      filter: `project_id = "${projectId}"`,
      sort: '-created'
    });

    // superValidate creates an empty form object for the create dialog
    const form = await superValidate(zod(sensorSchema));

    return {
      sensors: sensors || [],
      form
    };
  } catch (err) {
    console.error('Error loading sensors:', err);
    throw error(500, 'Failed to load sensors');
  }
};

// 3. Form actions -- handle create, update, delete
export const actions: Actions = {
  create: async ({ request, params, locals: { pb } }) => {
    const { projectId } = params;
    const form = await superValidate(request, zod(sensorSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await pb.collection('sensors').create({
        project_id: projectId,
        name: form.data.name,
        description: form.data.description || null,
        sensor_type: form.data.sensor_type
      });
      return { form, success: true };
    } catch (err) {
      console.error('Error creating sensor:', err);
      return fail(500, { form, message: 'Failed to create sensor' });
    }
  },

  update: async ({ request, params, locals: { pb } }) => {
    const formData = await request.formData();
    const sensorId = formData.get('id') as string;
    const form = await superValidate(formData, zod(sensorSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await pb.collection('sensors').update(sensorId, {
        name: form.data.name,
        description: form.data.description || null,
        sensor_type: form.data.sensor_type
      });
      return { form, success: true };
    } catch (err) {
      console.error('Error updating sensor:', err);
      return fail(500, { form, message: 'Failed to update sensor' });
    }
  },

  // Use the reusable helpers from $lib/server/crud-actions
  updateField: async ({ request, params, locals: { pb } }) => {
    return await createUpdateFieldAction(pb, params.projectId, {
      tableName: 'sensors',
      allowedFields: ['name', 'description', 'sensor_type'],
      validators: {
        name: (value) => ({
          valid: value.trim().length >= 2,
          error: 'Name must be at least 2 characters'
        })
      }
    })(request);
  },

  delete: async ({ request, params, locals: { pb } }) => {
    return await createDeleteAction(pb, params.projectId, {
      tableName: 'sensors'
    })(request);
  }
};
```

**Key points:**

- `createUpdateFieldAction` from `$lib/server/crud-actions.ts` handles inline field edits. It validates the field name against `allowedFields`, verifies project ownership, and runs optional validators.
- `createDeleteAction` handles delete with optional `beforeDelete` cleanup hook.
- `superValidate` from `sveltekit-superforms` validates against your Zod schema and returns structured errors.

---

## Step 2: Page Component (`+page.svelte`)

The page uses `BaseTable` for the data grid and `CrudDialogs` for create/edit/delete modals.

```svelte
<!-- src/routes/(admin)/projects/[projectId]/sensors/+page.svelte -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import * as m from '$lib/paraglide/messages';
  import { toast } from 'svelte-sonner';
  import type { PageData } from './$types';
  import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
  import CrudDialogs, { type CrudDialogConfig } from '$lib/components/admin/crud-dialogs.svelte';
  import { createFieldUpdateHandler } from '$lib/utils/table-actions';

  // 1. Define your row type
  type Sensor = {
    id: string;
    name: string;
    description?: string;
    sensor_type: string;
    project_id: string;
  };

  // 2. Receive page data from the load function
  let { data }: { data: PageData } = $props();

  // 3. Dialog state
  let createDialogOpen = $state(false);
  let editDialogOpen = $state(false);
  let deleteDialogOpen = $state(false);
  let selectedSensor = $state<Sensor | null>(null);

  // 4. Inline edit handler (calls the updateField action)
  const updateField = createFieldUpdateHandler('updateField');

  // 5. Column definitions for BaseTable
  const columns = $derived.by((): BaseColumnConfig<Sensor>[] => [
    {
      id: 'name',
      header: 'Name',
      accessorKey: 'name',
      fieldType: 'text',
      capabilities: {
        editable: true,
        sortable: true,
        filterable: true
      },
      onUpdate: (rowId, value) => updateField(rowId, value, 'name')
    },
    {
      id: 'description',
      header: 'Description',
      accessorKey: 'description',
      fieldType: 'text',
      capabilities: {
        editable: true,
        sortable: true,
        filterable: true
      },
      onUpdate: (rowId, value) => updateField(rowId, value, 'description')
    },
    {
      id: 'sensor_type',
      header: 'Type',
      accessorKey: 'sensor_type',
      fieldType: 'text',
      capabilities: {
        editable: false,
        sortable: true,
        filterable: true
      }
    }
  ]);

  // 6. Dialog configuration for CrudDialogs
  const dialogConfig: CrudDialogConfig = {
    entityName: 'Sensor',
    fields: [
      {
        name: 'name',
        label: 'Name',
        type: 'text',
        placeholder: 'Enter sensor name',
        required: true
      },
      {
        name: 'description',
        label: 'Description',
        type: 'textarea',
        placeholder: 'Optional description',
        rows: 3
      },
      {
        name: 'sensor_type',
        label: 'Sensor Type',
        type: 'select',
        options: [
          { value: 'temperature', label: 'Temperature' },
          { value: 'humidity', label: 'Humidity' },
          { value: 'pressure', label: 'Pressure' }
        ],
        required: true
      }
    ],
    createAction: '?/create',
    updateAction: '?/update',
    deleteAction: '?/delete',
    messages: {
      createTitle: 'Create Sensor',
      editTitle: 'Edit Sensor',
      deleteTitle: 'Delete Sensor',
      deleteConfirm: 'Are you sure you want to delete this sensor?',
      createSuccess: 'Sensor created',
      updateSuccess: 'Sensor updated',
      deleteSuccess: 'Sensor deleted',
      createError: 'Failed to create sensor',
      updateError: 'Failed to update sensor',
      deleteError: 'Failed to delete sensor',
      cancel: m.commonCancel(),
      save: m.commonSave(),
      create: m.commonCreate(),
      delete: m.commonDelete()
    }
  };

  // 7. Global filter for the search box
  const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
    const search = String(filterValue).toLowerCase();
    const sensor = row.original;
    return (
      sensor.name.toLowerCase().includes(search) ||
      (sensor.description && sensor.description.toLowerCase().includes(search)) ||
      sensor.sensor_type.toLowerCase().includes(search)
    );
  };
</script>

<div class="flex flex-col gap-6 min-w-0 w-full">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">Sensors</h1>
    <p class="text-muted-foreground">Manage sensors for this project.</p>
  </div>

  <BaseTable
    data={data.sensors}
    {columns}
    {globalFilterFn}
    getRowId={(row) => row.id}
    enableRowSelection={true}
    enableShiftSelect={true}
    showToolbar={true}
    showEditMode={true}
    editModeLabel="Edit sensors inline"
    emptyMessage="No sensors yet"
    emptySubMessage="Create your first sensor"
    rowActions={{
      header: 'Actions',
      onEdit: (sensor) => {
        selectedSensor = sensor;
        editDialogOpen = true;
      },
      onDelete: (sensor) => {
        selectedSensor = sensor;
        deleteDialogOpen = true;
      }
    }}
    inlineRowCreation={{
      enabled: true,
      createButtonLabel: 'New Sensor',
      requiredFields: ['name'],
      excludeFields: [],
      onCreateRow: async (rowData) => {
        const formData = new FormData();
        formData.append('name', rowData.name || '');
        formData.append('description', rowData.description || '');
        formData.append('sensor_type', rowData.sensor_type || 'temperature');

        const response = await fetch('?/create', {
          method: 'POST',
          body: formData
        });
        const result = await response.json();
        if (result.type === 'success') {
          await invalidateAll();
          toast.success('Sensor created');
        } else {
          toast.error('Failed to create sensor');
          throw new Error('Failed');
        }
      }
    }}
  />
</div>

<CrudDialogs
  config={dialogConfig}
  bind:createOpen={createDialogOpen}
  bind:editOpen={editDialogOpen}
  bind:deleteOpen={deleteDialogOpen}
  bind:selectedEntity={selectedSensor}
  onCreateOpenChange={(open) => (createDialogOpen = open)}
  onEditOpenChange={(open) => (editDialogOpen = open)}
  onDeleteOpenChange={(open) => (deleteDialogOpen = open)}
  onEntityChange={(entity) => (selectedSensor = entity as Sensor | null)}
/>
```

---

## Step 3: Add Sidebar Navigation

In `src/routes/(admin)/+layout.svelte`, the sidebar lists entities grouped by type. Add a link for your new page in the appropriate section. The sidebar loads entity lists client-side via `loadSidebarData()`. For a simple page that does not appear per-entity in the sidebar, add a static link like the existing Roles or Map Settings entries.

---

## Step 4: Add Translations

Add keys to both `messages/en.json` and `messages/de.json`:

```json
{
  "sensorsTitle": "Sensors",
  "sensorsDescription": "Manage sensors for this project",
  "sensorsCreateSensor": "Create Sensor",
  "sensorsName": "Name"
}
```

Then use them in your component:

```ts
import * as m from '$lib/paraglide/messages';
// m.sensorsTitle(), m.sensorsDescription(), etc.
```

---

## Reusable CRUD Helpers

These utilities in `$lib/server/crud-actions.ts` reduce boilerplate:

### `createUpdateFieldAction(pb, projectId, config)`

For inline cell edits. Validates field names, checks project ownership, runs optional validators.

```ts
// In +page.server.ts actions:
updateField: async ({ request, params, locals: { pb } }) => {
  return await createUpdateFieldAction(pb, params.projectId, {
    tableName: 'sensors',
    allowedFields: ['name', 'description'],
    validators: {
      name: (value) => ({ valid: value.trim().length >= 2, error: 'Too short' })
    }
  })(request);
}
```

### `createDeleteAction(pb, projectId, config)`

For delete with optional cleanup:

```ts
delete: async ({ request, params, locals: { pb } }) => {
  return await createDeleteAction(pb, params.projectId, {
    tableName: 'sensors',
    beforeDelete: async (pb, sensorId, projectId) => {
      // Clean up related records before deletion
    }
  })(request);
}
```

---

## BaseTable Features

`BaseTable` (`$lib/components/admin/base-table`) provides:

- **Inline editing** -- cells become editable when edit mode is toggled. `onUpdate` callback fires on blur/enter.
- **Row selection** -- checkbox column with shift-select support.
- **Sorting and filtering** -- per-column or via a global search box.
- **Inline row creation** -- a "new row" appears at the bottom of the table.
- **Row actions** -- edit/delete buttons per row, plus custom actions.

Column configuration:

```ts
type BaseColumnConfig<T> = {
  id: string;
  header: string;
  accessorKey?: string;          // Simple field access
  accessorFn?: (row: T) => any;  // Computed access
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'array';
  capabilities: {
    editable: boolean;
    sortable: boolean;
    filterable: boolean;
    readonly?: boolean;
  };
  onUpdate?: (rowId: string, value: string) => void;
};
```

---

## Checklist

1. Create `+page.server.ts` with `load` function and `actions` (create, update, updateField, delete)
2. Create `+page.svelte` with `BaseTable`, column config, `CrudDialogs`, and dialog config
3. Add sidebar navigation link in the admin layout
4. Add translation keys to `messages/en.json` and `messages/de.json`
5. (Optional) Create a PocketBase migration in `pb/pb_migrations/` for the new collection
