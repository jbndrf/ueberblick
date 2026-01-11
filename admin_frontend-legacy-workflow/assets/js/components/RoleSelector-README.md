# RoleSelector Component

A reusable, feature-rich role selection component with tag-based interface, on-the-fly role creation, keyboard navigation, and smart suggestions.

## Features

- ✅ **Tag-based interface** - Selected roles appear as removable tags
- ✅ **On-the-fly role creation** - Create new roles by typing
- ✅ **Keyboard navigation** - Full arrow key support with highlighting
- ✅ **Smart suggestions** - Autocomplete with existing roles
- ✅ **Hash trigger** - Type `#` to see all available roles
- ✅ **Quick select dropdown** - Button to quickly pick from existing roles
- ✅ **Real-time filtering** - Hide already selected roles from suggestions
- ✅ **Maximum selections** - Optional limit on number of roles
- ✅ **Customizable labels** - Custom placeholder text and labels
- ✅ **Event callbacks** - React to selection changes, role creation, errors
- ✅ **Disable/enable** - Dynamic control over component state
- ✅ **Responsive design** - Works on mobile and desktop

## Basic Usage

```javascript
import RoleSelector from './components/role-selector.js';

// Create a basic role selector
const selector = new RoleSelector('containerId', {
    projectId: 'your-project-id',
    onSelectionChange: (roles) => {
        console.log('Selected roles:', roles);
    }
});
```

## HTML Structure Required

```html
<!-- Container for the role selector -->
<div id="roleSelector"></div>

<!-- Include CSS -->
<link rel="stylesheet" href="assets/css/components/role-selector.css">
```

## Configuration Options

```javascript
const options = {
    // Required
    projectId: 'uuid',              // Project ID for loading roles
    
    // Labels and Text
    label: 'Roles:',                // Label above the input
    placeholder: 'Type role...',     // Input placeholder text
    
    // Behavior
    allowCreate: true,               // Allow creating new roles
    showQuickSelect: true,           // Show dropdown button
    maxSelections: null,             // Max number of roles (null = unlimited)
    disabled: false,                 // Start disabled
    
    // Callbacks
    onSelectionChange: (roles) => {},  // Called when selection changes
    onRoleCreate: (role) => {},        // Called when new role is created
    onError: (error) => {}             // Called on errors
};
```

## API Methods

### Core Methods

```javascript
// Get/Set selected roles
const roles = selector.getSelectedRoles();        // Returns array of {id, name} objects
const roleIds = selector.getSelectedRoleIds();    // Returns array of role IDs
selector.setSelectedRoles([{id: 'uuid', name: 'Admin'}]);

// Control selection
selector.clearSelection();                        // Remove all selections

// Component state
selector.setDisabled(true);                       // Enable/disable component
selector.refresh();                               // Reload project roles from database
selector.destroy();                               // Cleanup and remove component
```

### Selection Format

Selected roles are returned as objects:
```javascript
[
    { id: 'role-uuid-1', name: 'Administrator' },
    { id: 'role-uuid-2', name: 'Editor' }
]
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Type normally` | Search existing roles or type new role name |
| `#` | Show all available roles |
| `#search` | Filter roles containing "search" |
| `↑ / ↓` | Navigate through suggestions |
| `Enter / Tab` | Select highlighted suggestion |
| `Escape` | Close suggestions and blur input |

## Events and Callbacks

### onSelectionChange
Called whenever the selection changes:
```javascript
onSelectionChange: (roles) => {
    console.log('New selection:', roles);
    // Update your form data, trigger validation, etc.
}
```

### onRoleCreate
Called when a new role is created:
```javascript
onRoleCreate: (role) => {
    console.log('Created role:', role.name);
    // Show notification, update other UI, etc.
}
```

### onError
Called when errors occur:
```javascript
onError: (error) => {
    console.error('Role selector error:', error);
    // Show error message to user
}
```

## Usage Examples

### Basic Form Integration
```javascript
const selector = new RoleSelector('roles-container', {
    projectId: currentProject.id,
    label: 'Required Roles:',
    onSelectionChange: (roles) => {
        formData.requiredRoles = roles.map(r => r.id);
        validateForm();
    }
});
```

### Read-only Display
```javascript
const selector = new RoleSelector('display-container', {
    projectId: currentProject.id,
    label: 'Assigned Roles:',
    allowCreate: false,
    showQuickSelect: false,
    disabled: true
});
selector.setSelectedRoles(existingRoles);
```

### Limited Selection
```javascript
const selector = new RoleSelector('team-container', {
    projectId: currentProject.id,
    label: 'Team Members (max 5):',
    maxSelections: 5,
    placeholder: 'Add team members...'
});
```

### Custom Styling

The component uses CSS custom properties for easy theming:

```css
.role-selector {
    --color-primary: #007bff;
    --color-border: #ddd;
    --border-radius: 4px;
}
```

## Integration with Existing Projects

### Workflow Builder Integration
The RoleSelector is already integrated into the workflow builder:
- Stage role assignment
- Action role assignment  
- Automatic role inheritance
- Real-time role creation

### Adding to Other Pages
1. Include the CSS file
2. Import the RoleSelector class
3. Create instances with appropriate options
4. Handle the callback events

## Error Handling

The component handles various error scenarios:
- Database connection issues
- Role creation failures
- Invalid project IDs
- Network timeouts

All errors are reported through the `onError` callback and logged to console.

## Browser Support

- Modern browsers with ES6 module support
- Mobile browsers (responsive design)
- Dark mode support (automatic detection)

## Dependencies

- Supabase client for database operations
- App notification system (optional)
- CSS custom properties support

## Performance Notes

- Roles are cached after initial load
- Suggestions are filtered client-side for speed
- Database writes only happen for role creation
- Component cleanup prevents memory leaks

## Future Enhancements

Potential additions:
- Role permissions preview
- Bulk role operations
- Role hierarchy support
- Custom role validation rules
- Export/import role selections
- Integration with user management systems