# MobileMultiSelect

A responsive multi-select component with mobile-optimized full-screen modal and desktop dropdown.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `selectedIds` | `string[]` | `[]` | Bindable array of selected option IDs |
| `options` | `T[]` | `[]` | Bindable array of available options |
| `getOptionId` | `(option: T) => string` | **required** | Extract ID from option |
| `getOptionLabel` | `(option: T) => string` | **required** | Extract display label from option |
| `getOptionDescription` | `(option: T) => string \| undefined` | - | Optional description text |
| `placeholder` | `string` | `'Select options...'` | Trigger placeholder |
| `singleSelect` | `boolean` | `false` | Single selection mode |
| `disabled` | `boolean` | `false` | Disable the selector |
| `class` | `string` | `''` | Additional CSS classes |
| `allowCreate` | `boolean` | `false` | Allow creating new options |
| `onCreateOption` | `(label: string) => Promise<T> \| T` | - | Callback to create option |
| `createLabel` | `(query: string) => string` | `Create "${query}"` | Create button label |
| `hideSelected` | `boolean` | `false` | Hide selected from list |

## Usage

```svelte
<script lang="ts">
  import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';

  type Tag = { id: string; name: string; description?: string };

  let tags: Tag[] = [
    { id: '1', name: 'Important', description: 'High priority items' },
    { id: '2', name: 'Review', description: 'Needs review' }
  ];
  let selectedTagIds: string[] = $state([]);
</script>

<MobileMultiSelect
  bind:selectedIds={selectedTagIds}
  bind:options={tags}
  getOptionId={(t) => t.id}
  getOptionLabel={(t) => t.name}
  getOptionDescription={(t) => t.description}
  placeholder="Select tags..."
/>
```

## With Create

```svelte
<MobileMultiSelect
  bind:selectedIds={selectedTagIds}
  bind:options={tags}
  getOptionId={(t) => t.id}
  getOptionLabel={(t) => t.name}
  allowCreate
  onCreateOption={async (name) => {
    const newTag = await api.createTag({ name });
    return newTag;
  }}
/>
```

## Single Select

```svelte
<MobileMultiSelect
  bind:selectedIds={selectedCategoryId}
  options={categories}
  getOptionId={(c) => c.id}
  getOptionLabel={(c) => c.name}
  singleSelect
  placeholder="Select category..."
/>
```
