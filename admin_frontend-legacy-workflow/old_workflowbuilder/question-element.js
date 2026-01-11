/**
 * QuestionElement Component
 * Reusable individual question type component with configuration and preview
 */

class QuestionElement {
    constructor(fieldType, fieldData = null) {
        this.fieldType = fieldType;
        this.fieldTypeConfig = this.getFieldTypeConfig(fieldType);
        this.id = fieldData?.id || this.generateId();
        this.data = fieldData || this.createDefaultData();
        this.callbacks = {
            onChange: null,
            onRemove: null,
            onCopy: null
        };
    }

    /**
     * Get field type configuration
     */
    getFieldTypeConfig(fieldType) {
        const configs = {
            short: { 
                label: 'Short Text', 
                icon: '📝',
                hasOptions: false, 
                description: 'Single line text input',
                validation: ['required', 'minLength', 'maxLength', 'pattern']
            },
            long: { 
                label: 'Long Text', 
                icon: '📄',
                hasOptions: false, 
                description: 'Multi-line text area',
                validation: ['required', 'minLength', 'maxLength']
            },
            multiple: { 
                label: 'Multiple Choice', 
                icon: '☑️',
                hasOptions: true, 
                description: 'Radio buttons or checkboxes',
                validation: ['required', 'minSelections', 'maxSelections']
            },
            dropdown: { 
                label: 'Dropdown', 
                icon: '📋',
                hasOptions: true, 
                description: 'Select dropdown list',
                validation: ['required']
            },
            smart_dropdown: { 
                label: 'Smart Dropdown', 
                icon: '🔗',
                hasOptions: false, 
                hasMappings: true, 
                description: 'Dynamic options based on other fields',
                validation: ['required']
            },
            date: { 
                label: 'Date', 
                icon: '📅',
                hasOptions: false, 
                description: 'Date picker input',
                validation: ['required', 'minDate', 'maxDate']
            },
            file: { 
                label: 'File Upload', 
                icon: '📎',
                hasOptions: false, 
                description: 'File attachment input',
                validation: ['required', 'fileTypes', 'maxFileSize']
            },
            number: { 
                label: 'Number', 
                icon: '🔢',
                hasOptions: false, 
                description: 'Numeric input with validation',
                validation: ['required', 'min', 'max', 'step']
            },
            email: { 
                label: 'Email', 
                icon: '📧',
                hasOptions: false, 
                description: 'Email address validation',
                validation: ['required', 'emailFormat']
            }
        };
        
        return configs[fieldType] || configs.short;
    }

    /**
     * Create default field data
     */
    createDefaultData() {
        return {
            id: this.id,
            field_key: this.generateFieldKey(),
            field_label: `${this.fieldTypeConfig.label} Field`,
            field_type: this.fieldType,
            field_order: 1,
            is_required: false,
            placeholder: '',
            help_text: '',
            validation_rules: {},
            field_options: this.fieldTypeConfig.hasOptions ? { options: ['Option 1', 'Option 2', 'Option 3'] } : {},
            conditional_logic: {}
        };
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return 'qe_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate field key
     */
    generateFieldKey() {
        const base = this.fieldType.replace('_', '') + '_field';
        return base + '_' + Math.random().toString(36).substr(2, 5);
    }

    /**
     * Set callbacks
     */
    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    /**
     * Update field data
     */
    updateData(updates) {
        Object.assign(this.data, updates);
        this.triggerCallback('onChange', this);
    }

    /**
     * Trigger callback
     */
    triggerCallback(name, ...args) {
        if (this.callbacks[name] && typeof this.callbacks[name] === 'function') {
            this.callbacks[name](...args);
        }
    }

    /**
     * Render simple question type card
     */
    renderTypeCard() {
        return `
            <div class="question-type-card" data-field-type="${this.fieldType}">
                <div class="type-card-icon">${this.fieldTypeConfig.icon}</div>
                <div class="type-card-content">
                    <h4 class="type-card-title">${this.fieldTypeConfig.label}</h4>
                    <p class="type-card-description">${this.fieldTypeConfig.description}</p>
                </div>
            </div>
        `;
    }

    /**
     * Render configured question instance
     */
    renderInstance() {
        return `
            <div class="question-instance" data-element-id="${this.id}">
                <div class="question-instance-header">
                    <div class="question-type-indicator">
                        <span class="question-icon">${this.fieldTypeConfig.icon}</span>
                        <span class="question-type">${this.fieldTypeConfig.label}</span>
                    </div>
                    <div class="question-actions">
                        <button type="button" class="btn-icon btn-edit" onclick="formBuilder.editQuestion('${this.id}')" 
                                title="Edit Question">✏️</button>
                        <button type="button" class="btn-icon btn-copy" onclick="formBuilder.copyQuestion('${this.id}')" 
                                title="Copy Question">📋</button>
                        <button type="button" class="btn-icon btn-remove" onclick="formBuilder.removeQuestion('${this.id}')" 
                                title="Remove Question">🗑️</button>
                    </div>
                </div>
                <div class="question-instance-content">
                    <div class="question-label">${this.data.field_label}</div>
                    ${this.data.help_text ? `<div class="question-help">${this.data.help_text}</div>` : ''}
                    <div class="question-preview">${this.renderPreview()}</div>
                </div>
            </div>
        `;
    }

    /**
     * Render question preview
     */
    renderPreview() {
        switch (this.fieldType) {
            case 'short':
                return `<input type="text" placeholder="${this.data.placeholder || 'Enter text...'}" disabled>`;
            
            case 'long':
                return `<textarea placeholder="${this.data.placeholder || 'Enter text...'}" rows="3" disabled></textarea>`;
            
            case 'multiple':
                if (!this.data.field_options?.options) return '<p class="preview-note">No options configured</p>';
                return this.data.field_options.options.map((option, index) => 
                    `<label class="preview-option"><input type="radio" name="preview_${this.id}" disabled> ${option}</label>`
                ).join('');
            
            case 'dropdown':
                if (!this.data.field_options?.options) return '<p class="preview-note">No options configured</p>';
                return `
                    <select disabled>
                        <option>${this.data.placeholder || 'Select an option...'}</option>
                        ${this.data.field_options.options.map(option => `<option>${option}</option>`).join('')}
                    </select>
                `;
            
            case 'smart_dropdown':
                return `
                    <select disabled>
                        <option>Dynamic options based on: ${this.data.field_options?.source_field || 'Not configured'}</option>
                    </select>
                `;
            
            case 'date':
                return `<input type="date" disabled>`;
            
            case 'file':
                return `<input type="file" disabled> <span class="file-note">File upload</span>`;
            
            case 'number':
                return `<input type="number" placeholder="${this.data.placeholder || '0'}" disabled>`;
            
            case 'email':
                return `<input type="email" placeholder="${this.data.placeholder || 'email@example.com'}" disabled>`;
            
            default:
                return `<input type="text" placeholder="Unknown field type" disabled>`;
        }
    }



















    /**
     * Export to form field format
     */
    toFormField() {
        return {
            id: this.data.id,
            field_key: this.data.field_key,
            field_label: this.data.field_label,
            field_type: this.data.field_type,
            field_order: this.data.field_order,
            is_required: this.data.is_required,
            placeholder: this.data.placeholder,
            help_text: this.data.help_text,
            validation_rules: this.data.validation_rules,
            field_options: this.data.field_options,
            conditional_logic: this.data.conditional_logic
        };
    }
}

export default QuestionElement;