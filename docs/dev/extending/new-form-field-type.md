# Adding a New Form Field Type

What you will build: A new field type that participants can fill out in workflow forms, including its type definition, rendering logic for fill/edit/view modes, and optional configuration UI in the workflow builder.

## Files to Touch

| File | Purpose |
|------|---------|
| `src/lib/workflow-builder/types.ts` | Add to the `FieldType` union |
| `src/lib/workflow-builder/field-types.ts` | Field type registry (icon, label, description) |
| `src/lib/components/form-renderer/types.ts` | Add to the renderer's `FieldType` union + options interface |
| `src/lib/components/form-renderer/FieldRenderer.svelte` | Rendering logic for fill/edit/view modes |
| `builder/.../form-editor/FieldConfigPanel.svelte` | Type-specific settings in the builder (optional) |

## Architecture

The form system has two layers:

1. **Workflow builder** (`src/lib/workflow-builder/`) -- defines field types and their metadata for the admin drag-and-drop form designer.
2. **Form renderer** (`src/lib/components/form-renderer/`) -- renders fields for participants in three modes: `fill`, `edit`, and `view`.

The `FieldType` union is duplicated in both layers. Both must be updated.

### Where a field's type and options live (data model)

The field model is unified around a canonical field registry. A field type is a
property of a **field definition**, not of a form placement:

- **`workflow_field_defs`** -- the canonical field registry (one row per field per
  workflow). Holds `field_type`, `field_options`, `validation_rules`, `write_mode`
  (`singleton` / `observation` / `computed`), `view_roles`, `display_config`, and
  `label`. **This is where your new field type's `field_type` value and its
  `field_options` shape are stored.**
- **`tools_form_field_refs`** -- places a field def into a specific form. Holds
  `form_id`, `field_def_id`, and a `config` JSON for placement/layout only (page,
  row index, column position, per-form overrides such as required/placeholder).
  It does **not** carry the field type.

So when you add a field type, the registry (`workflow_field_defs.field_type` /
`workflow_field_defs.field_options`) is what the renderer reads; the form ref only
says "this field appears here, laid out like this."

---

## Step 1: Add to the FieldType Union

Update the union in **both** files:

This union is the source-of-truth list of values that can land in
`workflow_field_defs.field_type` (a `select` column whose allowed values mirror
this union -- adding a new type means extending that column too, see Step 1b).

**`src/lib/workflow-builder/types.ts`:**
```typescript
export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'email'
  | 'date'
  | 'file'
  | 'dropdown'
  | 'multiple_choice'
  | 'smart_dropdown'
  | 'custom_table_selector'
  | 'instance_reference' // value holds workflow_instance id(s); deferred feature
  | 'rating';  // <-- add here
```

**`src/lib/components/form-renderer/types.ts`:**
```typescript
export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'email'
  | 'date'
  | 'file'
  | 'dropdown'
  | 'multiple_choice'
  | 'smart_dropdown'
  | 'custom_table_selector'
  | 'instance_reference'
  | 'rating';  // <-- add here
```

> `instance_reference` is already a member of the union but is a deferred
> feature -- it is a useful example of a type that exists in the registry's
> `field_type` enum before it is fully wired into every renderer mode.

---

## Step 2: Add to the Field Types Registry

This is the single source of truth for field type metadata. It drives the drag-and-drop palette in the form editor, icon display on field cards, and label lookups.

Add your entry to the `FIELD_TYPES` array in `src/lib/workflow-builder/field-types.ts`:

```typescript
import { Star } from '@lucide/svelte'; // pick an appropriate icon

// Add to FIELD_TYPES array:
{
  type: 'rating',
  label: 'Rating',
  description: 'Star or numeric rating input',
  icon: Star
}
```

This automatically makes the field type available in:
- `FieldTypesPalette` -- the drag-and-drop palette in the form editor
- `FieldCard` -- icon display when a field is listed
- `fieldTypeIcons` and `fieldTypeLabels` lookup maps

The existing types for reference:
```
short_text, long_text, number, email, date, file,
dropdown, multiple_choice, smart_dropdown, custom_table_selector,
instance_reference
```

---

## Step 3: Define Options Interface (If Needed)

If your field type has configurable options, define an options interface in `src/lib/components/form-renderer/types.ts`:

```typescript
export interface RatingFieldOptions {
  max_stars?: number;   // default 5
  allow_half?: boolean; // half-star ratings
}
```

Then add it to the `field_options` union on the `FormField` interface:

```typescript
field_options?: DateFieldOptions | FileFieldOptions | DropdownFieldOptions
  | SmartDropdownFieldOptions | CustomTableSelectorOptions
  | RatingFieldOptions  // <-- add here
  | null;
```

---

## Step 4: Add Rendering Logic to FieldRenderer.svelte

Open `src/lib/components/form-renderer/FieldRenderer.svelte`. The component handles three modes via two top-level `{#if}` branches. You need to add cases in both.

### 4a. Extract options in the script block

```typescript
const ratingOptions = $derived(field.field_options as RatingFieldOptions | null);
const maxStars = $derived(ratingOptions?.max_stars ?? 5);
```

### 4b. View mode (inside `{#if isViewMode}`)

Add before the final `{:else}` catch-all for text/number/email fields. The existing order is: `file`, `long_text`, selection fields (`dropdown`/`multiple_choice`/`smart_dropdown`/`custom_table_selector`), `date`, then the catch-all.

```svelte
{:else if field.field_type === 'rating'}
  <div class="rounded-md border border-input bg-background px-3 py-2 text-sm min-h-10 flex items-center">
    {#if hasValue}
      {#each Array(maxStars) as _, i}
        <span class={i < (value as number) ? 'text-amber-500' : 'text-muted-foreground/30'}>
          *
        </span>
      {/each}
      <span class="ml-2 text-muted-foreground">{value}/{maxStars}</span>
    {:else}
      <span class="text-muted-foreground italic">No rating</span>
    {/if}
  </div>
```

### 4c. Fill/edit mode (inside `{:else}`)

Add before the closing `{/if}` of the fill/edit section. The existing order is: `short_text`, `long_text`, `number`, `email`, `date`, `file`, `dropdown`, `multiple_choice`, `smart_dropdown`, `custom_table_selector`.

```svelte
{:else if field.field_type === 'rating'}
  <div class="flex items-center gap-1">
    {#each Array(maxStars) as _, i}
      <button
        type="button"
        class="text-2xl transition-colors {i < ((value as number) || 0)
          ? 'text-amber-500'
          : 'text-muted-foreground/30'} hover:text-amber-400"
        {disabled}
        onclick={() => onValueChange?.(i + 1)}
      >
        *
      </button>
    {/each}
  </div>
```

**Placement matters.** Always add your `{:else if}` blocks before the final catch-all in each section. Each branch for a field type must handle both filled and empty states.

---

## Step 5: Add Config UI in Workflow Builder (Optional)

If your field type has configurable options (like `max_stars`), add a config section to `FieldConfigPanel.svelte` in the form editor view.

The panel is located at:
```
src/routes/admin/projects/[projectId]/workflows/[workflowId]/
  builder/right-sidebar/views/form-editor/FieldConfigPanel.svelte
```

The panel receives the selected field as a prop and calls `onUpdate` with partial field updates. Add a type-specific section:

```svelte
{#if field.field_type === 'rating'}
  <div class="space-y-3">
    <div class="space-y-1.5">
      <Label>Max Stars</Label>
      <Input
        type="number"
        min="1"
        max="10"
        value={field.field_options?.max_stars ?? 5}
        oninput={(e) => onUpdate?.({
          field_options: {
            ...field.field_options,
            max_stars: parseInt(e.currentTarget.value) || 5
          }
        })}
      />
    </div>

    <div class="flex items-center justify-between">
      <Label>Allow Half Stars</Label>
      <Switch
        checked={field.field_options?.allow_half ?? false}
        onCheckedChange={(checked) => onUpdate?.({
          field_options: {
            ...field.field_options,
            allow_half: checked
          }
        })}
      />
    </div>
  </div>
{/if}
```

The `FieldConfigPanel` already handles common settings (label, placeholder, help text, required toggle) for all field types. Your section only needs to cover type-specific options.

---

## Step 6: Test

Test your field type in three contexts:

1. **Workflow builder** -- drag the field type from the palette onto a form. Verify the icon and label display correctly on the `FieldCard`. Configure any type-specific options.
2. **Participant fill mode** -- create a workflow instance and fill in the form. The field should accept input and validate correctly.
3. **Participant view mode** -- view a submitted form. The stored value should display in a readable format.

All three modes (`fill`, `edit`, `view`) must have an explicit case in `FieldRenderer.svelte`. If a mode does not have a specific case, it falls through to the default text rendering, which may not be appropriate.

---

## Data Storage

### Where the type and options live

A field's definition lives in **`workflow_field_defs`**:

- `field_type` -- a PocketBase `select` column whose allowed values mirror the
  `FieldType` union. **Because it is a constrained `select`, adding a new type
  requires a migration** that appends the new value to this column's `values`
  list (see `pb/pb_migrations/`). This is the one schema change a new field type
  needs; nothing else about the registry changes.
- `field_options` -- a JSON column that accepts any structure, so your
  type-specific options interface needs no schema change.

Placement of a def into a form lives in **`tools_form_field_refs`** (`form_id`,
`field_def_id`, `config` JSON for layout/overrides). No changes there for a new
type.

### Where submitted values live

Field values are stored append-only in **`workflow_field_values`** -- one row per
recorded value, keyed by `instance_id` + `field_def_id`, with the value in
`value` (or `file_value` for uploads) and a `recorded_at` timestamp. Values are
never updated in place; the current value of a field is the row with the latest
`recorded_at`. Your field type's value should be a simple JSON-serializable type:

| Value Type | Used By |
|------------|---------|
| `string` | `short_text`, `long_text`, `email`, `dropdown`, `smart_dropdown` |
| `number` | `number`, `rating` |
| `string` (ISO) | `date` |
| `string[]` | `multiple_choice`, `custom_table_selector` (with `allow_multiple`) |
| file uploads | `file` (stored in `file_value`, handled via FormData, not JSON) |

The only database migration a new field type needs is appending its value to the
`field_type` `select` column on `workflow_field_defs`; the `workflow_field_values`
schema is type-agnostic and needs no change.

---

## Checklist

- [ ] `FieldType` union updated in `src/lib/workflow-builder/types.ts`
- [ ] `FieldType` union updated in `src/lib/components/form-renderer/types.ts`
- [ ] New value appended to the `field_type` `select` column on `workflow_field_defs` via a migration in `pb/pb_migrations/`
- [ ] Entry added to `FIELD_TYPES` array in `src/lib/workflow-builder/field-types.ts` with icon, label, description
- [ ] Options interface defined (if the field has configurable settings)
- [ ] Options interface added to `FormField.field_options` union
- [ ] View mode rendering added to `FieldRenderer.svelte` (handles both value-present and empty states)
- [ ] Fill/edit mode rendering added to `FieldRenderer.svelte` (handles input, disabled state, error styling)
- [ ] Config panel section added to `FieldConfigPanel.svelte` (if options exist)
- [ ] Value type is JSON-serializable and documented
