/**
 * FormService - Proper form management using dedicated tables
 * Replaces embedded form approach with proper database relationships
 */

import { supabaseClient } from '../core/supabase.js';
import DebugLogger from '../core/debug-logger.js';

class FormService {
    constructor(projectId) {
        this.projectId = projectId;
        this.logger = new DebugLogger('FormService');
    }
    
    /**
     * Create form with fields in proper tables
     */
    async createFormWithFields(formData, fields) {
        this.logger.log('Creating form with fields:', formData.name);
        
        // 1. Create form
        const { data: form, error: formError } = await supabaseClient.client
            .from('forms')
            .insert({
                project_id: this.projectId,
                name: formData.name,
                description: formData.description || '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();
            
        if (formError) throw formError;
        
        // 2. Create form fields (excluding placeholders)
        const nonPlaceholderFields = fields ? fields.filter(field => !field.is_placeholder) : [];
        if (nonPlaceholderFields && nonPlaceholderFields.length > 0) {
            const fieldsData = nonPlaceholderFields.map((field, index) => ({
                form_id: form.id,
                field_key: field.field_key || field.key || this.generateFieldKey(field.field_type || field.type || 'text', index),
                field_label: field.field_label || field.label || 'Unnamed Field',
                field_type: this.normalizeFieldType(field.field_type || field.type || 'short_text'),
                field_order: field.field_order || field.order || index + 1,
                is_required: field.is_required !== undefined ? field.is_required : (field.required || false),
                placeholder: field.placeholder || '',
                help_text: field.help_text || field.help || '',
                validation_rules: field.validation_rules || {},
                field_options: this.buildFieldOptions(field),
                conditional_logic: field.conditional_logic || {},
                page: field.page || 1,
                page_title: field.page_title || null,
                created_at: new Date().toISOString()
            }));
            
            // Debug log the data being sent
            this.logger.log('Attempting to insert form fields data:', fieldsData);
            
            const { error: fieldsError } = await supabaseClient.client
                .from('form_fields')
                .insert(fieldsData);
                
            if (fieldsError) {
                this.logger.error('Form fields insertion failed:', {
                    error: fieldsError,
                    data: fieldsData,
                    dataCount: fieldsData.length
                });
                throw new Error(`Failed to create form fields: ${fieldsError.message}. Details: ${JSON.stringify(fieldsError)}`);
            }
            
            this.logger.log(`Created ${fieldsData.length} form fields`);
        }
        
        this.logger.log('Form created successfully:', form.id);
        return form;
    }
    
    /**
     * Load complete form with fields
     */
    async loadFormWithFields(formId) {
        // Load form
        const { data: form, error: formError } = await supabaseClient.client
            .from('forms')
            .select('*')
            .eq('id', formId)
            .single();
            
        if (formError) throw formError;
        
        // Load form fields
        const { data: fields, error: fieldsError } = await supabaseClient.client
            .from('form_fields')
            .select('*')
            .eq('form_id', formId)
            .order('field_order');
            
        if (fieldsError) throw fieldsError;
        
        return { form, fields: fields || [] };
    }
    
    /**
     * Update form fields
     */
    async updateFormFields(formId, fields) {
        // Delete existing fields
        await supabaseClient.client
            .from('form_fields')
            .delete()
            .eq('form_id', formId);
        
        // Insert updated fields (excluding placeholders)
        const nonPlaceholderFields = fields ? fields.filter(field => !field.is_placeholder) : [];
        if (nonPlaceholderFields && nonPlaceholderFields.length > 0) {
            const fieldsData = nonPlaceholderFields.map((field, index) => ({
                form_id: formId,
                field_key: field.field_key || field.key || this.generateFieldKey(field.field_type || field.type || 'text', index),
                field_label: field.field_label || field.label || 'Unnamed Field',
                field_type: this.normalizeFieldType(field.field_type || field.type || 'short_text'),
                field_order: field.field_order || field.order || index + 1,
                is_required: field.is_required !== undefined ? field.is_required : (field.required || false),
                placeholder: field.placeholder || '',
                help_text: field.help_text || field.help || '',
                validation_rules: field.validation_rules || {},
                field_options: this.buildFieldOptions(field),
                conditional_logic: field.conditional_logic || {},
                page: field.page || 1,
                page_title: field.page_title || null,
                created_at: new Date().toISOString()
            }));
            
            const { error: fieldsError } = await supabaseClient.client
                .from('form_fields')
                .insert(fieldsData);
                
            if (fieldsError) throw fieldsError;
        }
    }
    
    /**
     * Delete specific field by ID
     */
    async deleteField(fieldId) {
        this.logger.log('Deleting form field:', fieldId);
        
        // Check if field has existing data
        const { data: instanceData, error: instanceError } = await supabaseClient.client
            .from('instance_data')
            .select('id')
            .eq('field_id', fieldId)
            .limit(1);
        
        if (instanceError) throw instanceError;
        
        const { data: editableFields, error: editableError } = await supabaseClient.client
            .from('action_editable_fields')
            .select('id')
            .eq('field_id', fieldId)
            .limit(1);
        
        if (editableError) throw editableError;
        
        const hasInstanceData = instanceData && instanceData.length > 0;
        const hasEditableFields = editableFields && editableFields.length > 0;
        
        if (hasInstanceData || hasEditableFields) {
            this.logger.warn(`Cannot delete field ${fieldId}: has existing data references`);
            throw new Error(`Cannot delete field: it has existing customer data. Remove references first.`);
        }
        
        // Safe to delete - no customer data references
        const { error: deleteError } = await supabaseClient.client
            .from('form_fields')
            .delete()
            .eq('id', fieldId);
        
        if (deleteError) throw deleteError;
        
        this.logger.log('Form field deleted successfully:', fieldId);
        return true;
    }

    /**
     * Delete form and all fields
     */
    async deleteForm(formId) {
        // Delete fields first
        await supabaseClient.client
            .from('form_fields')
            .delete()
            .eq('form_id', formId);
            
        // Delete form
        await supabaseClient.client
            .from('forms')
            .delete()
            .eq('id', formId);
    }
    
    /**
     * Build proper field_options based on field type and configuration
     */
    buildFieldOptions(field) {
        const fieldType = field.field_type || field.type || 'short_text';
        
        // Debug logging
        this.logger.log('Building field_options for field:', {
            fieldType,
            fieldKey: field.field_key || field.key,
            existingOptions: field.field_options,
            legacyOptions: field.options
        });
        
        // If field_options exists and is not empty, use it
        // Special case: for dropdown/multiple choice fields, also check if options array is populated
        if (field.field_options && typeof field.field_options === 'object' && Object.keys(field.field_options).length > 0) {
            // For dropdown/multiple choice fields, ensure options array is not empty
            if ((fieldType === 'dropdown' || fieldType === 'multiple' || fieldType === 'multiple_choice') && 
                field.field_options.options && Array.isArray(field.field_options.options) && field.field_options.options.length > 0) {
                this.logger.log('Using existing field_options with valid options:', field.field_options);
                return field.field_options;
            }
            // For other field types, use existing field_options if they exist
            else if (fieldType !== 'dropdown' && fieldType !== 'multiple' && fieldType !== 'multiple_choice') {
                this.logger.log('Using existing field_options:', field.field_options);
                return field.field_options;
            }
            // If dropdown/multiple choice has empty options, fall through to rebuild
        }
        
        // Build field_options based on field type
        let result;
        switch (fieldType) {
            case 'dropdown':
            case 'multiple':
            case 'multiple_choice':
                result = {
                    options: field.field_options?.options || field.options || [],
                    allow_other: field.field_options?.allow_other || field.allow_other || false,
                    randomize_order: field.field_options?.randomize_order || field.randomize_order || false,
                    ...(fieldType === 'multiple_choice' && { allow_multiple: field.field_options?.allow_multiple || field.allow_multiple || false })
                };
                break;
                
            case 'smart_dropdown':
                result = {
                    source_type: field.field_options?.source_type || field.source_type || 'field',
                    source_field: field.field_options?.source_field || field.source_field || '',
                    source_table_id: field.field_options?.source_table_id || field.source_table_id || null,
                    display_column: field.field_options?.display_column || field.display_column || '',
                    value_column: field.field_options?.value_column || field.value_column || '',
                    mappings: field.field_options?.mappings || field.mappings || [],
                    allow_create: field.field_options?.allow_create || field.allow_create || false,
                    default_options: field.field_options?.default_options || field.default_options || []
                };
                break;
                
            case 'file':
                result = {
                    accept: field.accept || '',
                    multiple: field.multiple || false,
                    max_size: field.max_size || 10485760, // 10MB default
                    max_files: field.max_files || 1
                };
                break;
                
            case 'number':
                result = {
                    step: field.step || 1,
                    min: field.min || null,
                    max: field.max || null
                };
                break;
                
            case 'date':
                result = {
                    format: field.format || 'yyyy-mm-dd',
                    min_date: field.min_date || null,
                    max_date: field.max_date || null
                };
                break;
                
            case 'short_text':
            case 'long_text':
                result = {
                    min_length: field.min_length || null,
                    max_length: field.max_length || null,
                    pattern: field.pattern || null
                };
                break;
                
            case 'email':
                result = {
                    domains: field.domains || [],
                    require_verification: field.require_verification || false
                };
                break;
                
            case 'signature':
                result = {
                    width: field.width || 400,
                    height: field.height || 200,
                    background_color: field.background_color || '#ffffff',
                    pen_color: field.pen_color || '#000000'
                };
                break;
                
            default:
                // For legacy support, check if options exist
                if (field.options && Array.isArray(field.options)) {
                    this.logger.log('Using legacy options format:', field.options);
                    result = { options: field.options };
                } else {
                    this.logger.warn('No options found, returning empty object');
                    result = {};
                }
                break;
        }
        
        this.logger.log('Built field_options:', result);
        return result;
    }
    
    /**
     * Generate a unique field key using random characters
     */
    generateFieldKey(fieldType, index) {
        // Generate 10 random characters (alphanumeric) with timestamp to ensure uniqueness
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        // Add timestamp suffix to guarantee uniqueness
        result += Date.now().toString().slice(-2);
        return result;
    }
    
    /**
     * Normalize legacy field types to new format
     */
    normalizeFieldType(fieldType) {
        const typeMapping = {
            'short': 'short_text',
            'long': 'long_text',
            'dropdown': 'dropdown',
            'multiple': 'multiple_choice',
            'date': 'date',
            'file': 'file',
            'number': 'number',
            'email': 'email',
            'smart_dropdown': 'smart_dropdown',
            'signature': 'signature'
        };
        
        return typeMapping[fieldType] || fieldType || 'short_text';
    }
    
    /**
     * Check if form has existing instance data that would be lost
     */
    async checkFormHasInstanceData(formId) {
        try {
            // Check for instance data
            const { data: instanceData, error: instanceError } = await supabaseClient.client
                .from('instance_data')
                .select('id')
                .eq('form_id', formId)
                .limit(1);
            
            if (instanceError) throw instanceError;
            
            // Check for action editable fields
            const { data: editableFields, error: editableError } = await supabaseClient.client
                .from('action_editable_fields')
                .select('id')
                .eq('form_id', formId)
                .limit(1);
            
            if (editableError) throw editableError;
            
            const hasInstanceData = instanceData && instanceData.length > 0;
            const hasEditableFields = editableFields && editableFields.length > 0;
            const hasAnyReferences = hasInstanceData || hasEditableFields;
            
            this.logger.log(`Form ${formId} reference check: instance_data=${hasInstanceData}, action_editable_fields=${hasEditableFields}`);
            
            return {
                hasData: hasAnyReferences,
                count: (instanceData?.length || 0) + (editableFields?.length || 0),
                hasInstanceData,
                hasEditableFields
            };
            
        } catch (error) {
            this.logger.error('Failed to check form references:', error);
            // Assume data exists to be safe
            return { hasData: true, count: 1 };
        }
    }

    /**
     * Update form fields with data preservation
     */
    async updateFormFields(formId, fields) {
        // Check for existing data first
        const dataCheck = await this.checkFormHasInstanceData(formId);
        
        if (dataCheck.hasData) {
            this.logger.log(`Form ${formId} has existing data - using preservation mode`);
            return await this.updateFormFieldsPreservingData(formId, fields);
        } else {
            this.logger.log(`Form ${formId} has no data - using recreate mode`);
            return await this.recreateFormFields(formId, fields);
        }
    }
    
    /**
     * Update form fields preserving existing data
     */
    async updateFormFieldsPreservingData(formId, fields) {
        try {
            this.logger.log('Updating form fields with data preservation for form:', formId);
            
            // Get existing fields
            const { data: existingFields, error: fetchError } = await supabaseClient.client
                .from('form_fields')
                .select('*')
                .eq('form_id', formId);
            
            if (fetchError) throw fetchError;
            
            const existingFieldMap = new Map(existingFields.map(f => [f.id, f]));
            const updatedFieldIds = new Set();
            
            // Process each new field (excluding placeholders)
            const nonPlaceholderFields = fields.filter(field => !field.is_placeholder);
            for (const newField of nonPlaceholderFields) {
                if (existingFieldMap.has(newField.id)) {
                    // Update existing field
                    const generatedKey = this.generateFieldKey(newField.field_type || newField.type || 'text', fields.indexOf(newField));
                    const fieldKey = newField.field_key || newField.key || generatedKey;
                    
                    // Debug logging
                    this.logger.log(`Updating field with key: ${fieldKey} (original: ${newField.field_key}, fallback: ${newField.key}, generated: ${generatedKey})`);
                    
                    const { error: updateError } = await supabaseClient.client
                        .from('form_fields')
                        .update({
                            field_key: fieldKey,
                            field_label: newField.field_label || newField.label || 'Unnamed Field',
                            field_type: this.normalizeFieldType(newField.field_type || newField.type || 'short_text'),
                            field_order: newField.field_order || newField.order || fields.indexOf(newField) + 1,
                            is_required: newField.is_required !== undefined ? newField.is_required : (newField.required || false),
                            placeholder: newField.placeholder || '',
                            help_text: newField.help_text || newField.help || '',
                            validation_rules: newField.validation_rules || {},
                            field_options: this.buildFieldOptions(newField),
                            conditional_logic: newField.conditional_logic || {},
                            page: newField.page || 1,
                            page_title: newField.page_title || null
                        })
                        .eq('id', newField.id);
                    
                    if (updateError) {
                        if (updateError.code === '23505') {
                            // Duplicate key error - generate a new unique key
                            this.logger.log(`Duplicate key detected for field ${fieldKey}, generating new key...`);
                            const newUniqueKey = this.generateFieldKey(newField.field_type || newField.type || 'text', fields.indexOf(newField));
                            
                            const { error: retryError } = await supabaseClient.client
                                .from('form_fields')
                                .update({
                                    field_key: newUniqueKey,
                                    field_label: newField.field_label || newField.label || 'Unnamed Field',
                                    field_type: this.normalizeFieldType(newField.field_type || newField.type || 'short_text'),
                                    field_order: newField.field_order || newField.order || fields.indexOf(newField) + 1,
                                    is_required: newField.is_required !== undefined ? newField.is_required : (newField.required || false),
                                    placeholder: newField.placeholder || '',
                                    help_text: newField.help_text || newField.help || '',
                                    validation_rules: newField.validation_rules || {},
                                    field_options: this.buildFieldOptions(newField),
                                    conditional_logic: newField.conditional_logic || {},
                                    page: newField.page || 1,
                                    page_title: newField.page_title || null
                                })
                                .eq('id', newField.id);
                            
                            if (retryError) throw retryError;
                            this.logger.log(`Successfully updated field with new key: ${newUniqueKey}`);
                        } else {
                            throw updateError;
                        }
                    }
                    updatedFieldIds.add(newField.id);
                    
                } else {
                    // Create new field
                    const generatedKey = this.generateFieldKey(newField.field_type || newField.type || 'text', fields.indexOf(newField));
                    const fieldKey = newField.field_key || newField.key || generatedKey;
                    
                    // Debug logging
                    this.logger.log(`Creating field with key: ${fieldKey} (original: ${newField.field_key}, fallback: ${newField.key}, generated: ${generatedKey})`);
                    
                    const fieldData = {
                        id: newField.id,
                        form_id: formId,
                        field_key: fieldKey,
                        field_label: newField.field_label || newField.label || 'Unnamed Field',
                        field_type: this.normalizeFieldType(newField.field_type || newField.type || 'short_text'),
                        field_order: newField.field_order || newField.order || fields.indexOf(newField) + 1,
                        is_required: newField.is_required !== undefined ? newField.is_required : (newField.required || false),
                        placeholder: newField.placeholder || '',
                        help_text: newField.help_text || newField.help || '',
                        validation_rules: newField.validation_rules || {},
                        field_options: this.buildFieldOptions(newField),
                        conditional_logic: newField.conditional_logic || {},
                        page: newField.page || 1,
                        page_title: newField.page_title || null,
                        created_at: new Date().toISOString()
                    };
                    
                    const { error: createError } = await supabaseClient.client
                        .from('form_fields')
                        .insert(fieldData);
                    
                    if (createError) {
                        if (createError.code === '23505') {
                            // Duplicate key error - generate a new unique key and retry
                            this.logger.log(`Duplicate key detected for new field ${fieldKey}, generating new key...`);
                            const newUniqueKey = this.generateFieldKey(newField.field_type || newField.type || 'text', fields.indexOf(newField));
                            fieldData.field_key = newUniqueKey;
                            
                            const { error: retryError } = await supabaseClient.client
                                .from('form_fields')
                                .insert(fieldData);
                            
                            if (retryError) throw retryError;
                            this.logger.log(`Successfully created field with new key: ${newUniqueKey}`);
                        } else {
                            throw createError;
                        }
                    }
                    updatedFieldIds.add(newField.id);
                }
            }
            
            // Note: We do NOT delete fields that are no longer in the new set
            // This preserves references from instance_data.field_id
            
            this.logger.log(`Updated ${updatedFieldIds.size} fields, preserving customer data`);
            return { success: true, updated: updatedFieldIds.size };
            
        } catch (error) {
            this.logger.error('Failed to update form fields preserving data:', error);
            throw error;
        }
    }
    
    /**
     * Recreate form fields (safe when no data exists)
     */
    async recreateFormFields(formId, fields) {
        try {
            this.logger.log('Recreating form fields for form:', formId);
            
            // Delete existing fields
            const { error: deleteError } = await supabaseClient.client
                .from('form_fields')
                .delete()
                .eq('form_id', formId);
            
            if (deleteError) throw deleteError;
            
            // Insert new fields (excluding placeholders)
            const nonPlaceholderFields = fields ? fields.filter(field => !field.is_placeholder) : [];
            if (nonPlaceholderFields && nonPlaceholderFields.length > 0) {
                const fieldsData = nonPlaceholderFields.map((field, index) => ({
                    form_id: formId,
                    field_key: field.field_key || field.key || this.generateFieldKey(field.field_type || field.type || 'text', index),
                    field_label: field.field_label || field.label || 'Unnamed Field',
                    field_type: this.normalizeFieldType(field.field_type || field.type || 'short_text'),
                    field_order: field.field_order || field.order || index + 1,
                    is_required: field.is_required !== undefined ? field.is_required : (field.required || false),
                    placeholder: field.placeholder || '',
                    help_text: field.help_text || field.help || '',
                    validation_rules: field.validation_rules || {},
                    field_options: this.buildFieldOptions(field),
                    conditional_logic: field.conditional_logic || {},
                    page: field.page || 1,
                    page_title: field.page_title || null,
                    created_at: new Date().toISOString()
                }));
                
                const { error: insertError } = await supabaseClient.client
                    .from('form_fields')
                    .insert(fieldsData);
                
                if (insertError) throw insertError;
            }
            
            this.logger.log('Recreated', nonPlaceholderFields.length, 'fields');
            return { success: true, created: nonPlaceholderFields.length };
            
        } catch (error) {
            this.logger.error('Failed to recreate form fields:', error);
            throw error;
        }
    }
}

export default FormService;