/**
 * Supabase Client Wrapper
 * Provides authentication and database operations for the admin interface
 */

import FormService from '../services/FormService.js';
import DebugLogger from './debug-logger.js';

const logger = new DebugLogger('SupabaseClient');

class SupabaseClient {
    constructor() {
        this.client = null;
        this.currentUser = null;
        this.authListeners = [];
        this.isInitialized = false;
        this.currentProjectId = null;
    }

    /**
     * Initialize the Supabase client
     * @param {string} url - Supabase project URL
     * @param {string} anonKey - Supabase anonymous key
     */
    async initialize(url, anonKey) {
        try {
            if (!url || !anonKey) {
                throw new Error('Supabase URL and anonymous key are required');
            }

            this.client = window.supabase.createClient(url, anonKey, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true
                },
                global: {
                    headers: {
                        'X-Client-Info': 'map-survey-admin/1.0.0'
                    }
                }
            });

            // Set up auth state listener
            this.client.auth.onAuthStateChange((event, session) => {
                logger.log('Auth state changed:', event, session?.user?.email);
                
                this.currentUser = session?.user || null;
                
                // Notify all listeners
                this.authListeners.forEach(callback => {
                    try {
                        callback(event, session);
                    } catch (error) {
                        logger.error('Auth listener error:', error);
                    }
                });
            });

            // Check for existing session
            const { data: { session }, error } = await this.client.auth.getSession();
            if (error) {
                logger.warn('Session retrieval error:', error);
            } else if (session) {
                this.currentUser = session.user;
            }

            this.isInitialized = true;
            logger.log('Supabase client initialized successfully');
            
            return true;
        } catch (error) {
            logger.error('Failed to initialize Supabase client:', error);
            throw error;
        }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.currentUser && this.isInitialized;
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }


    /**
     * Get current project ID context
     */
    getCurrentProjectContext() {
        return this.getCurrentProjectId();
    }

    /**
     * Clear project context
     */
    clearProjectContext() {
        this.currentProjectId = null;
    }

    /**
     * Add auth state change listener
     */
    onAuthStateChange(callback) {
        this.authListeners.push(callback);
        
        // Return unsubscribe function
        return () => {
            const index = this.authListeners.indexOf(callback);
            if (index > -1) {
                this.authListeners.splice(index, 1);
            }
        };
    }

    /**
     * Sign in with email and password
     */
    async signIn(email, password) {
        try {
            const { data, error } = await this.client.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            return { user: data.user, session: data.session };
        } catch (error) {
            logger.error('Sign in error:', error);
            throw error;
        }
    }

    /**
     * Sign out current user
     */
    async signOut() {
        try {
            const { error } = await this.client.auth.signOut();
            if (error) throw error;
            
            this.currentUser = null;
            return true;
        } catch (error) {
            logger.error('Sign out error:', error);
            throw error;
        }
    }

    /**
     * Generic database query method
     */
    from(table) {
        if (!this.isInitialized) {
            throw new Error('Supabase client not initialized');
        }
        return this.client.from(table);
    }

    /**
     * Execute RPC function
     */
    async rpc(functionName, params = {}) {
        try {
            const { data, error } = await this.client.rpc(functionName, params);
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`RPC ${functionName} error:`, error);
            throw error;
        }
    }

    /**
     * Storage operations
     */
    get storage() {
        if (!this.isInitialized) {
            throw new Error('Supabase client not initialized');
        }
        return this.client.storage;
    }

    // CRUD Helper Methods

    /**
     * Get all records from a table with optional filtering
     */
    async getAll(table, options = {}) {
        try {
            let query = this.from(table).select(options.select || '*');
            
            // Apply filters
            if (options.filter) {
                Object.entries(options.filter).forEach(([column, value]) => {
                    query = query.eq(column, value);
                });
            }
            
            // Apply ordering
            if (options.orderBy) {
                const { column, ascending = true } = options.orderBy;
                query = query.order(column, { ascending });
            }
            
            // Apply limit
            if (options.limit) {
                query = query.limit(options.limit);
            }

            const { data, error } = await query;
            if (error) throw error;
            
            return data;
        } catch (error) {
            logger.error(`Get all ${table} error:`, error);
            throw error;
        }
    }

    /**
     * Get a single record by ID
     */
    async getById(table, id, select = '*') {
        try {
            // Validate ID parameter
            if (!id || id === 'undefined' || id === 'null' || id === '') {
                throw new Error(`Invalid ID provided for ${table}: ${id}`);
            }

            const { data, error } = await this.from(table)
                .select(select)
                .eq('id', id)
                .single();
                
            if (error) throw error;
            return data;
        } catch (error) {
            logger.error(`Get ${table} by ID error:`, error);
            throw error;
        }
    }

    /**
     * Create a new record
     */
    async create(table, data) {
        try {
            logger.log('Creating record in table:', table, 'with data:', data);
            
            // Auto-inject project context for project-related tables
            const enhancedData = this._injectProjectContext(table, data);
            
            logger.log('Enhanced data after context injection:', enhancedData);
            
            const { data: result, error } = await this.from(table)
                .insert(enhancedData)
                .select()
                .single();
                
            if (error) {
                // If the error is RLS-related but insert succeeded, return the input data
                if (error.code === '42501' && error.message.includes('row-level security policy')) {
                    logger.warn(`RLS policy prevents reading ${table} after creation, returning input data`);
                    return { ...enhancedData, id: 'created' }; // Placeholder since we can't get the real ID
                }
                throw error;
            }
            return result;
        } catch (error) {
            logger.error(`Create ${table} error:`, error);
            throw error;
        }
    }

    /**
     * Update a record by ID
     */
    async update(table, id, data) {
        try {
            // Validate ID parameter
            if (!id || id === 'undefined' || id === 'null' || id === '') {
                throw new Error(`Invalid ID provided for ${table} update: ${id}`);
            }

            const { data: result, error } = await this.from(table)
                .update(data)
                .eq('id', id)
                .select()
                .single();
                
            if (error) {
                // If the error is RLS-related but update succeeded, return the input data
                if (error.code === '42501' && error.message.includes('row-level security policy')) {
                    logger.warn(`RLS policy prevents reading ${table} after update, returning input data`);
                    return { ...data, id };
                }
                throw error;
            }
            return result;
        } catch (error) {
            logger.error(`Update ${table} error:`, error);
            throw error;
        }
    }

    /**
     * Delete a record by ID
     */
    async delete(table, id) {
        try {
            // Validate ID parameter
            if (!id || id === 'undefined' || id === 'null' || id === '') {
                throw new Error(`Invalid ID provided for ${table} delete: ${id}`);
            }

            const { error } = await this.from(table)
                .delete()
                .eq('id', id);
                
            if (error) throw error;
            return true;
        } catch (error) {
            logger.error(`Delete ${table} error:`, error);
            throw error;
        }
    }

    /**
     * Check if a table exists and user has access
     */
    async checkTableAccess(table) {
        try {
            const { data, error } = await this.from(table)
                .select('id')
                .limit(1);
                
            if (error && error.code === 'PGRST116') {
                // Table doesn't exist or no access
                return false;
            }
            
            return true;
        } catch (error) {
            logger.warn(`Table access check for ${table}:`, error);
            return false;
        }
    }

    /**
     * Project-specific methods
     */

    /**
     * Get projects for current user
     * @deprecated Use getUserProjects() instead for explicit owner filtering
     */
    async getProjects() {
        // For security, delegate to getUserProjects to ensure proper filtering
        return this.getUserProjects();
    }

    /**
     * Get participants for a project
     */
    async getParticipants(projectId) {
        return this.getAll('participants', {
            filter: { project_id: projectId },
            orderBy: { column: 'created_at', ascending: false }
        });
    }

    /**
     * Get roles for a project
     */
    async getRoles(projectId) {
        return this.getAll('roles', {
            filter: { project_id: projectId },
            orderBy: { column: 'created_at', ascending: false }
        });
    }

    /**
     * Get markers for a project
     */
    async getMarkers(projectId) {
        return this.getAll('markers', {
            filter: { project_id: projectId },
            orderBy: { column: 'created_at', ascending: false }
        });
    }

    /**
     * Get custom tables for a project
     */
    async getCustomTables(projectId) {
        return this.getAll('custom_tables', {
            filter: { project_id: projectId },
            orderBy: { column: 'created_at', ascending: false }
        });
    }

    /**
     * Get custom table columns
     */
    async getCustomTableColumns(tableId) {
        return this.getAll('custom_table_columns', {
            filter: { table_id: tableId },
            orderBy: { column: 'created_at', ascending: true }
        });
    }

    /**
     * Get custom table data
     */
    async getCustomTableData(tableId, options = {}) {
        return this.getAll('custom_table_data', {
            filter: { table_id: tableId },
            orderBy: { column: 'created_at', ascending: false },
            ...options
        });
    }

    /**
     * Get map settings for a project
     */
    async getMapSettings(projectId) {
        return this.getAll('map_settings', {
            filter: { project_id: projectId },
            orderBy: { column: 'created_at', ascending: false }
        });
    }

    /**
     * Get workflows for a project
     */
    async getWorkflows(projectId) {
        return this.getAll('workflows', {
            filter: { project_id: projectId },
            orderBy: { column: 'created_at', ascending: false }
        });
    }

    /**
     * Project Context Management
     */

    /**
     * Get projects for current user (only projects they own or have access to)
     */
    async getUserProjects() {
        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        return this.getAll('projects', {
            filter: { owner_id: currentUser.id },
            orderBy: { column: 'created_at', ascending: false }
        });
    }

    /**
     * Get project by ID with ownership verification
     */
    async getProjectById(projectId) {
        // Validate project ID
        if (!projectId || projectId === 'undefined' || projectId === 'null' || projectId === '') {
            throw new Error('Invalid project ID provided');
        }

        const currentUser = this.getCurrentUser();
        if (!currentUser) {
            throw new Error('User not authenticated');
        }

        const project = await this.getById('projects', projectId);
        
        // Verify user has access to this project
        if (project.owner_id !== currentUser.id) {
            throw new Error('Access denied to this project');
        }
        
        return project;
    }

    /**
     * Get data scoped to a specific project
     */
    async getProjectScopedData(table, projectId, options = {}) {
        // Verify project access first
        await this.getProjectById(projectId);
        
        return this.getAll(table, {
            filter: { project_id: projectId, ...options.filter },
            orderBy: options.orderBy || { column: 'created_at', ascending: false },
            select: options.select,
            limit: options.limit
        });
    }

    /**
     * Create record with project context
     */
    async createWithProjectContext(table, projectId, data) {
        logger.log('createWithProjectContext called:', {
            table: table,
            projectId: projectId,
            data: data
        });
        
        // Verify project access first
        await this.getProjectById(projectId);
        
        const finalData = {
            ...data,
            project_id: projectId
        };
        
        logger.log('Final data for createWithProjectContext:', finalData);
        
        return this.create(table, finalData);
    }

    /**
     * Update record with project context verification
     */
    async updateWithProjectContext(table, projectId, id, data) {
        // Verify project access first
        await this.getProjectById(projectId);
        
        // Verify the record belongs to this project
        const existingRecord = await this.getById(table, id);
        if (existingRecord.project_id !== projectId) {
            throw new Error('Record does not belong to this project');
        }
        
        return this.update(table, id, data);
    }

    /**
     * Delete record with project context verification
     */
    async deleteWithProjectContext(table, projectId, id) {
        // Verify project access first
        await this.getProjectById(projectId);
        
        // Verify the record belongs to this project
        const existingRecord = await this.getById(table, id);
        if (existingRecord.project_id !== projectId) {
            throw new Error('Record does not belong to this project');
        }
        
        return this.delete(table, id);
    }

    /**
     * Current Project Context Management
     */
    
    /**
     * Set current project context
     */
    setCurrentProject(projectId) {
        // Validate projectId before setting
        if (projectId && projectId !== 'undefined' && projectId !== 'null' && projectId !== '') {
            localStorage.setItem('current_project_id', projectId);
            this.currentProjectId = projectId;
        } else {
            localStorage.removeItem('current_project_id');
            this.currentProjectId = null;
        }
        
        // Trigger project change event
        window.dispatchEvent(new CustomEvent('projectChanged', { 
            detail: { projectId: this.currentProjectId } 
        }));
    }

    /**
     * Get current project ID
     */
    getCurrentProjectId() {
        if (!this.currentProjectId) {
            this.currentProjectId = localStorage.getItem('current_project_id');
        }
        
        // Validate that we have a valid project ID before returning
        if (!this.currentProjectId || this.currentProjectId === 'undefined' || this.currentProjectId === 'null') {
            logger.warn('No valid project ID found. Current project context is not set.');
            return null;
        }
        
        return this.currentProjectId;
    }

    /**
     * Get current project data
     */
    async getCurrentProject() {
        const projectId = this.getCurrentProjectId();
        if (!projectId) return null;
        
        try {
            return await this.getProjectById(projectId);
        } catch (error) {
            logger.warn('Failed to load current project:', error);
            // Clear invalid project ID
            this.setCurrentProject(null);
            return null;
        }
    }

    /**
     * Check if user has access to project
     */
    async hasProjectAccess(projectId) {
        try {
            await this.getProjectById(projectId);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Batch operations
     */

    /**
     * Create multiple records
     */
    async createBatch(table, records) {
        try {
            // Auto-inject project context for all records
            const enhancedRecords = records.map(record => this._injectProjectContext(table, record));
            
            const { data, error } = await this.from(table)
                .insert(enhancedRecords)
                .select();
                
            if (error) {
                // If the error is RLS-related but insert succeeded, return the input data
                if (error.code === '42501' && error.message.includes('row-level security policy')) {
                    logger.warn(`RLS policy prevents reading ${table} after batch creation, returning input data`);
                    return enhancedRecords.map((record, index) => ({ ...record, id: `created_${index}` }));
                }
                throw error;
            }
            return data;
        } catch (error) {
            logger.error(`Batch create ${table} error:`, error);
            throw error;
        }
    }

    /**
     * Update multiple records with same data
     */
    async updateBatch(table, ids, data) {
        try {
            const { data: result, error } = await this.from(table)
                .update(data)
                .in('id', ids)
                .select();
                
            if (error) {
                // If the error is RLS-related but update succeeded, return the input data
                if (error.code === '42501' && error.message.includes('row-level security policy')) {
                    logger.warn(`RLS policy prevents reading ${table} after batch update, returning input data`);
                    return ids.map(id => ({ ...data, id }));
                }
                throw error;
            }
            return result;
        } catch (error) {
            logger.error(`Batch update ${table} error:`, error);
            throw error;
        }
    }

    /**
     * Delete multiple records
     */
    async deleteBatch(table, ids) {
        try {
            const { error } = await this.from(table)
                .delete()
                .in('id', ids);
                
            if (error) throw error;
            return true;
        } catch (error) {
            logger.error(`Batch delete ${table} error:`, error);
            throw error;
        }
    }

    /**
     * Transaction-like operations using RPC
     */

    /**
     * Create a new project with default settings
     */
    async createProject(projectData) {
        try {
            // Use generic create method instead of RPC function
            const result = await this.create('projects', projectData);
            return result;
        } catch (error) {
            logger.error('Create project error:', error);
            throw error;
        }
    }

    /**
     * Custom Table Management Methods
     */

    /**
     * Get a single custom table by ID
     */
    async getCustomTable(tableId) {
        return this.getById('custom_tables', tableId);
    }

    /**
     * Update custom table
     */
    async updateCustomTable(tableId, data) {
        try {
            // Get table and verify access
            const table = await this.getById('custom_tables', tableId);
            await this.getProjectById(table.project_id);
            
            return await this.update('custom_tables', tableId, data);
        } catch (error) {
            logger.error(`Update custom table error:`, error);
            throw error;
        }
    }

    /**
     * Create custom table column (simplified - always text, never required)
     */
    async createCustomTableColumn(tableId, columnData) {
        try {
            // Verify table exists and user has access
            const table = await this.getById('custom_tables', tableId);
            await this.getProjectById(table.project_id);
            
            return await this.create('custom_table_columns', {
                table_id: tableId,
                column_name: columnData.column_name,
                column_type: 'text', // Always text for simplicity
                is_required: false,  // Never required for simplicity
                default_value: null  // Always null for simplicity
            });
        } catch (error) {
            logger.error(`Create custom table column error:`, error);
            throw error;
        }
    }

    /**
     * Update custom table column
     */
    async updateCustomTableColumn(columnId, columnData) {
        try {
            // Get column and verify access
            const column = await this.getById('custom_table_columns', columnId);
            const table = await this.getById('custom_tables', column.table_id);
            await this.getProjectById(table.project_id);
            
            return await this.update('custom_table_columns', columnId, columnData);
        } catch (error) {
            logger.error(`Update custom table column error:`, error);
            throw error;
        }
    }

    /**
     * Delete custom table column
     */
    async deleteCustomTableColumn(columnId) {
        try {
            // Get column and verify access
            const column = await this.getById('custom_table_columns', columnId);
            const table = await this.getById('custom_tables', column.table_id);
            await this.getProjectById(table.project_id);
            
            // Don't allow deleting main column
            if (column.column_name === table.main_column) {
                throw new Error('Cannot delete the main column');
            }
            
            return await this.delete('custom_table_columns', columnId);
        } catch (error) {
            logger.error(`Delete custom table column error:`, error);
            throw error;
        }
    }

    /**
     * Create a custom table with initial column
     */
    async createCustomTable(projectId, tableData) {
        try {
            await this.getProjectById(projectId);
            
            // Create the custom table record
            const table = await this.createWithProjectContext('custom_tables', projectId, {
                table_name: tableData.table_name,
                display_name: tableData.display_name,
                description: tableData.description || null,
                main_column: tableData.main_column
            });

            // Create initial main column (always text, but required since it's the main column)
            if (tableData.main_column) {
                await this.create('custom_table_columns', {
                    table_id: table.id,
                    column_name: tableData.main_column,
                    column_type: 'text',
                    is_required: false, // Even main column is not required for simplicity
                    default_value: null
                });
            }

            return table;
        } catch (error) {
            logger.error(`Create custom table error:`, error);
            throw error;
        }
    }

    /**
     * Get custom table with its columns and stats
     */
    async getCustomTableWithColumns(tableId) {
        try {
            // Get table details
            const table = await this.getById('custom_tables', tableId);
            
            // Get columns
            const columns = await this.getCustomTableColumns(tableId);
            
            // Get record count
            const data = await this.getCustomTableData(tableId, { limit: 1 });
            const recordCount = data.length;
            
            return {
                ...table,
                columns,
                column_count: columns.length,
                record_count: recordCount
            };
        } catch (error) {
            logger.error(`Get custom table with columns error:`, error);
            throw error;
        }
    }


    /**
     * Get table data preview (limited rows)
     */
    async getTableDataPreview(tableId, limit = 3) {
        try {
            // Verify table access
            const table = await this.getById('custom_tables', tableId);
            await this.getProjectById(table.project_id);
            
            return await this.getCustomTableData(tableId, { limit });
        } catch (error) {
            logger.error(`Get table data preview error:`, error);
            throw error;
        }
    }

    /**
     * Delete custom table and all its data
     */
    async deleteCustomTable(tableId) {
        try {
            // Get table and verify access
            const table = await this.getById('custom_tables', tableId);
            await this.getProjectById(table.project_id);
            
            // Delete in order: data, columns, then table
            // Note: Database should handle cascading deletes, but we'll be explicit
            
            // Delete table data
            const { error: dataError } = await this.from('custom_table_data')
                .delete()
                .eq('table_id', tableId);
            if (dataError && dataError.code !== 'PGRST116') {
                throw dataError;
            }
            
            // Delete table columns
            const { error: columnsError } = await this.from('custom_table_columns')
                .delete()
                .eq('table_id', tableId);
            if (columnsError && columnsError.code !== 'PGRST116') {
                throw columnsError;
            }
            
            // Delete table
            return await this.delete('custom_tables', tableId);
        } catch (error) {
            logger.error(`Delete custom table error:`, error);
            throw error;
        }
    }

    /**
     * Utility methods
     */

    /**
     * Inject project context for project-related tables
     * @private
     */
    _injectProjectContext(table, data) {
        // Tables that need project_id injection
        const projectTables = [
            'participants', 'roles', 'markers', 'marker_categories',
            'custom_tables', 'map_settings', 'workflows', 'forms',
            'rules', 'ui_configurations'
        ];
        
        const currentProjectId = this.getCurrentProjectId();
        
        logger.log('_injectProjectContext check for table:', table, {
            isProjectTable: projectTables.includes(table),
            hasProjectIdInData: !!data.project_id,
            currentProjectId: currentProjectId,
            willInject: projectTables.includes(table) && !data.project_id && currentProjectId
        });
        
        // Don't inject if table doesn't need it or data already has project_id
        if (!projectTables.includes(table) || data.project_id || !currentProjectId) {
            return data;
        }
        
        logger.log('Injecting project context for table:', table, 'projectId:', currentProjectId);
        return {
            ...data,
            project_id: currentProjectId
        };
    }

    /**
     * Format error messages for display
     */
    formatError(error) {
        if (error.message) {
            return error.message;
        }
        
        // Handle specific Supabase error codes
        switch (error.code) {
            case 'PGRST116':
                return 'Table or view not found';
            case 'PGRST301':
                return 'Insufficient permissions';
            case '23505':
                return 'This record already exists';
            case '23503':
                return 'Referenced record does not exist';
            case '42501':
                return 'Permission denied';
            default:
                return 'An unexpected error occurred';
        }
    }

    /**
     * Participant-Role relationship methods for many-to-many support
     */
    
    /**
     * Get all roles assigned to a participant
     */
    async getParticipantRoles(participantId) {
        try {
            const allRoles = [];
            
            // Get participant with role_id array
            const { data: participant, error: participantError } = await this.client
                .from('participants')
                .select('role_id, project_id')
                .eq('id', participantId)
                .single();
            
            if (participantError) throw participantError;
            
            // Return empty array if no roles assigned
            if (!participant.role_id || (Array.isArray(participant.role_id) && participant.role_id.length === 0)) {
                return [];
            }
            
            // Get all roles for the project
            const { data: projectRoles, error: rolesError } = await this.client
                .from('roles')
                .select('*')
                .eq('project_id', participant.project_id);
            
            if (rolesError) throw rolesError;
            
            // Create roles map for quick lookup
            const rolesMap = new Map();
            (projectRoles || []).forEach(role => {
                rolesMap.set(role.id, role);
            });
            
            // Handle role_id as array (current database schema)
            if (Array.isArray(participant.role_id)) {
                participant.role_id.forEach(roleId => {
                    if (rolesMap.has(roleId)) {
                        allRoles.push(rolesMap.get(roleId));
                    }
                });
            } else if (participant.role_id && rolesMap.has(participant.role_id)) {
                // Handle single role_id (legacy support)
                allRoles.push(rolesMap.get(participant.role_id));
            }
            
            return allRoles;
        } catch (error) {
            logger.error('Get participant roles error:', error);
            return [];
        }
    }
    
    /**
     * Add a role to a participant
     */
    async addParticipantRole(participantId, roleId) {
        try {
            // Get current participant data
            const participant = await this.getById('participants', participantId);
            if (!participant) {
                throw new Error('Participant not found');
            }
            
            // Handle array-based role_id column
            if (Array.isArray(participant.role_id)) {
                // Add to existing array if not already present
                if (!participant.role_id.includes(roleId)) {
                    const updatedRoles = [...participant.role_id, roleId];
                    return await this.update('participants', participantId, { role_id: updatedRoles });
                }
                return participant; // Role already exists
            } else if (participant.role_id) {
                // Convert single role to array and add new role
                const updatedRoles = participant.role_id === roleId ? [roleId] : [participant.role_id, roleId];
                return await this.update('participants', participantId, { role_id: updatedRoles });
            } else {
                // No existing roles, add as array
                return await this.update('participants', participantId, { role_id: [roleId] });
            }
        } catch (error) {
            logger.error('Add participant role error:', error);
            throw error;
        }
    }
    
    /**
     * Remove a role from a participant
     */
    async removeParticipantRole(participantId, roleId) {
        try {
            // Get current participant data
            const participant = await this.getById('participants', participantId);
            if (!participant || !participant.role_id) {
                return; // No roles to remove
            }
            
            // Handle array-based role_id column
            if (Array.isArray(participant.role_id)) {
                const updatedRoles = participant.role_id.filter(id => id !== roleId);
                return await this.update('participants', participantId, { role_id: updatedRoles });
            } else if (participant.role_id === roleId) {
                // Single role_id - set to empty array
                return await this.update('participants', participantId, { role_id: [] });
            }
        } catch (error) {
            logger.error('Remove participant role error:', error);
            throw error;
        }
    }
    
    /**
     * Set all roles for a participant (replaces existing roles)
     */
    async setParticipantRoles(participantId, roleIds) {
        try {
            // Input validation
            if (!Array.isArray(roleIds)) {
                throw new Error('roleIds must be an array');
            }
            
            // Update participant with array of role IDs
            return await this.update('participants', participantId, { role_id: roleIds });
        } catch (error) {
            logger.error('Set participant roles error:', error);
            throw error;
        }
    }
    
    /**
     * Bulk assign roles to multiple participants
     */
    async bulkAssignRoles(participantIds, roleIds, mode = 'replace') {
        try {
            // Input validation
            if (!Array.isArray(participantIds)) {
                throw new Error('participantIds must be an array');
            }
            if (!Array.isArray(roleIds)) {
                throw new Error('roleIds must be an array');
            }
            if (participantIds.length === 0) {
                throw new Error('participantIds array cannot be empty');
            }
            if (roleIds.length === 0) {
                throw new Error('roleIds array cannot be empty');
            }
            
            const results = [];
            
            for (const participantId of participantIds) {
                if (mode === 'replace') {
                    results.push(await this.setParticipantRoles(participantId, roleIds));
                } else if (mode === 'add') {
                    for (const roleId of roleIds) {
                        results.push(await this.addParticipantRole(participantId, roleId));
                    }
                }
            }
            
            return results;
        } catch (error) {
            logger.error('Bulk assign roles error:', error);
            throw error;
        }
    }
    
    /**
     * Get participants with their roles (enhanced for multi-role support)
     */
    async getParticipantsWithRoles(projectId = null) {
        try {
            // First, get all participants
            let participantsQuery = this.client.from('participants').select('*');
            if (projectId) {
                participantsQuery = participantsQuery.eq('project_id', projectId);
            }
            
            const { data: participants, error: participantsError } = await participantsQuery;
            if (participantsError) throw participantsError;
            
            if (participants.length === 0) {
                return [];
            }
            
            // Get all roles for the project
            const rolesQuery = projectId 
                ? this.client.from('roles').select('*').eq('project_id', projectId)
                : this.client.from('roles').select('*');
            
            const { data: allRoles, error: rolesError } = await rolesQuery;
            if (rolesError) throw rolesError;
            
            // Create a map of roles for quick lookup
            const rolesMap = new Map();
            (allRoles || []).forEach(role => {
                rolesMap.set(role.id, role);
            });
            
            // Enhance participants with their roles from the array column
            return participants.map(participant => {
                const allRoles = [];
                
                // Add roles from participants table (handle both single role and array)
                if (participant.role_id) {
                    if (Array.isArray(participant.role_id)) {
                        // Handle array of role IDs (current database schema)
                        participant.role_id.forEach(roleId => {
                            const role = rolesMap.get(roleId);
                            if (role) {
                                allRoles.push(role);
                            }
                        });
                    } else {
                        // Handle single role ID (legacy support)
                        const singleRole = rolesMap.get(participant.role_id);
                        if (singleRole) {
                            allRoles.push(singleRole);
                        }
                    }
                }
                
                return {
                    ...participant,
                    participant_roles: allRoles,
                    role_names: allRoles.length > 0 ? allRoles.map(r => r.name).join(', ') : 'No roles assigned'
                };
            });
            
        } catch (error) {
            logger.error('Get participants with roles error:', error);
            throw error;
        }
    }

    /**
     * Marker Category Management Methods
     */

    /**
     * Get a single marker category by ID
     */
    async getMarkerCategory(categoryId) {
        return this.getById('marker_categories', categoryId);
    }


    /**
     * Get markers for a specific category
     */
    async getMarkersByCategory(categoryId) {
        return this.getAll('markers', {
            filter: { category_id: categoryId },
            orderBy: { column: 'created_at', ascending: false }
        });
    }

    /**
     * Create a marker category with initial setup
     */
    async createMarkerCategory(projectId, categoryData) {
        try {
            await this.getProjectById(projectId);
            
            // Create the marker category record
            const category = await this.createWithProjectContext('marker_categories', projectId, {
                name: categoryData.name,
                description: categoryData.description || null
            });

            return category;
        } catch (error) {
            logger.error(`Create marker category error:`, error);
            throw error;
        }
    }


    /**
     * Parse project configuration file
     */
    parseProjectConfigFile(fileContent, fileType) {
        try {
            let configData;
            
            if (fileType === 'application/json' || fileType === 'text/json') {
                configData = JSON.parse(fileContent);
            } else {
                throw new Error('Unsupported file type. Please upload a JSON file.');
            }
            
            // Validate required structure
            if (!configData || typeof configData !== 'object') {
                throw new Error('Invalid configuration file format');
            }
            
            if (!configData.project || !configData.project.name) {
                throw new Error('Configuration must contain a project with a name');
            }
            
            return configData;
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error('Invalid JSON format in configuration file');
            }
            throw error;
        }
    }

    /**
     * Import project from configuration file
     */
    async importProjectFromFile(configData) {
        try {
            const currentUser = this.getCurrentUser();
            if (!currentUser) {
                throw new Error('User not authenticated');
            }

            logger.log('Starting project import from configuration data');
            const results = {
                project: null,
                roles: [],
                categories: [],
                participants: [],
                markers: [],
                workflows: [],
                tables: [],
                mapSettings: null
            };

            // Validate configuration structure
            if (!configData.project) {
                throw new Error('Configuration must contain a project definition');
            }

            // Create the main project
            const projectData = {
                name: configData.project.name,
                description: configData.project.description || null,
                owner_id: currentUser.id,
                settings: configData.project.settings || {},
                is_active: true
            };
            
            results.project = await this.create('projects', projectData);
            logger.log('Created project:', results.project);

            // Create roles
            if (configData.roles && Array.isArray(configData.roles)) {
                const rolesData = configData.roles.map(role => ({
                    ...role,
                    project_id: results.project.id
                }));
                results.roles = await this.createBatch('roles', rolesData);
                logger.log('Created roles:', results.roles.length);
            }

            // Create marker categories  
            if (configData.marker_categories && Array.isArray(configData.marker_categories)) {
                const categoriesData = configData.marker_categories.map(category => ({
                    ...category,
                    project_id: results.project.id
                }));
                results.categories = await this.createBatch('marker_categories', categoriesData);
                logger.log('Created marker categories:', results.categories.length);
            }

            // Create participants with role mapping
            if (configData.participants && Array.isArray(configData.participants)) {
                const participantsData = configData.participants.map(participant => {
                    let roleIds = [];
                    
                    // Map role names to role IDs
                    if (participant.role_names && Array.isArray(participant.role_names)) {
                        roleIds = participant.role_names.map(roleName => {
                            const role = results.roles.find(r => r.name === roleName);
                            return role ? role.id : null;
                        }).filter(id => id !== null);
                    }
                    
                    return {
                        name: participant.name,
                        email: participant.email,
                        phone: participant.phone || null,
                        token: participant.token,
                        role_id: roleIds,
                        is_active: participant.is_active !== false,
                        metadata: participant.metadata || {},
                        project_id: results.project.id
                    };
                });
                results.participants = await this.createBatch('participants', participantsData);
                logger.log('Created participants:', results.participants.length);
            }

            // Create markers with category mapping
            if (configData.markers && Array.isArray(configData.markers)) {
                const markersData = configData.markers.map(marker => {
                    let categoryId = null;
                    
                    // Map category name to category ID
                    if (marker.category_name) {
                        const category = results.categories.find(c => c.name === marker.category_name);
                        categoryId = category ? category.id : null;
                    }
                    
                    return {
                        title: marker.title,
                        description: marker.description || null,
                        category_id: categoryId,
                        location: marker.location,
                        properties: marker.properties || {},
                        visible_to_roles: marker.visible_to_roles || [],
                        project_id: results.project.id
                    };
                });
                results.markers = await this.createBatch('markers', markersData);
                logger.log('Created markers:', results.markers.length);
            }

            // Create workflows with stages and actions using proper form architecture
            if (configData.workflows && Array.isArray(configData.workflows)) {
                for (const workflowConfig of configData.workflows) {
                    await this.importWorkflowWithProperForms(workflowConfig, results);
                }
                logger.log('Created workflows with proper form architecture:', results.workflows.length);
            }
            

            // Create custom tables
            if (configData.custom_tables && Array.isArray(configData.custom_tables)) {
                for (const tableConfig of configData.custom_tables) {
                    const tableData = {
                        table_name: tableConfig.table_name,
                        display_name: tableConfig.display_name,
                        description: tableConfig.description || null,
                        main_column: tableConfig.main_column,
                        project_id: results.project.id
                    };
                    
                    const createdTable = await this.create('custom_tables', tableData);
                    results.tables.push(createdTable);
                    
                    // Create columns for this table
                    if (tableConfig.columns && Array.isArray(tableConfig.columns)) {
                        const columnsData = tableConfig.columns.map(column => ({
                            table_id: createdTable.id,
                            column_name: column.column_name,
                            column_type: column.column_type || 'text',
                            is_required: column.is_required || false,
                            default_value: column.default_value || null
                        }));
                        await this.createBatch('custom_table_columns', columnsData);
                    }
                    
                    // Import table data if provided
                    if (tableConfig.data && Array.isArray(tableConfig.data)) {
                        const tableDataRecords = tableConfig.data.map(dataRow => ({
                            table_id: createdTable.id,
                            row_data: dataRow
                        }));
                        await this.createBatch('custom_table_data', tableDataRecords);
                        logger.log(`Created ${tableDataRecords.length} data records for table ${tableConfig.display_name}`);
                    }
                }
                logger.log('Created custom tables:', results.tables.length);
            }

            // Create map settings
            if (configData.map_settings) {
                const mapSettingsData = {
                    ...configData.map_settings,
                    project_id: results.project.id
                };
                results.mapSettings = await this.create('map_settings', mapSettingsData);
                logger.log('Created map settings');
            }

            return results;

        } catch (error) {
            logger.error('Import project from file error:', error);
            throw error;
        }
    }

    /**
     * Import workflow with proper form architecture
     * Creates forms in dedicated tables with proper field_options handling
     */
    async importWorkflowWithProperForms(workflowConfig, results) {
        logger.log('Importing workflow with proper forms:', workflowConfig.workflow.name);
        
        // Initialize FormService for this project
        const formService = new FormService(results.project.id);
        
        // Create the workflow
        const workflowData = {
            name: workflowConfig.workflow.name,
            description: workflowConfig.workflow.description,
            workflow_type: workflowConfig.workflow.workflow_type || 'incident',
            marker_color: workflowConfig.workflow.marker_color || '#007bff',
            icon_config: workflowConfig.workflow.icon_config || {},
            is_active: workflowConfig.workflow.is_active !== false,
            project_id: results.project.id
        };
        
        const createdWorkflow = await this.create('workflows', workflowData);
        results.workflows.push(createdWorkflow);
        
        // Create workflow stages with proper form handling
        const stageIdMapping = new Map();
        if (workflowConfig.stages && Array.isArray(workflowConfig.stages)) {
            for (let i = 0; i < workflowConfig.stages.length; i++) {
                const stage = workflowConfig.stages[i];
                
                // Map role names to role IDs for visible_to_roles
                let visibleToRoleIds = [];
                if (stage.allowedRoles && Array.isArray(stage.allowedRoles)) {
                    visibleToRoleIds = stage.allowedRoles.map(roleRef => {
                        // If it's a UUID, keep it as is
                        if (typeof roleRef === 'string' && roleRef.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                            return roleRef;
                        }
                        // Otherwise, try to find role by name
                        const role = results.roles.find(r => r.name === roleRef);
                        return role ? role.id : null;
                    }).filter(id => id !== null);
                }
                
                // Create form if stage has formFields
                let stageFormId = null;
                if (stage.formFields && Array.isArray(stage.formFields) && stage.formFields.length > 0) {
                    logger.log('Creating form for stage:', stage.name);
                    
                    // Normalize form fields with proper field_options
                    const normalizedFields = stage.formFields.map(field => this.normalizeFormField(field));
                    
                    const form = await formService.createFormWithFields({
                        name: `${stage.name} Form`,
                        description: `Form for workflow stage: ${stage.name}`
                    }, normalizedFields);
                    
                    stageFormId = form.id;
                    logger.log('Created stage form:', stageFormId);
                }
                
                // Create stage with proper form reference
                const stageData = {
                    workflow_id: createdWorkflow.id,
                    stage_key: stage.key,
                    stage_name: stage.name,
                    stage_type: stage.type,
                    stage_order: stage.order,
                    max_duration_hours: stage.maxHours || 24,
                    visible_to_roles: visibleToRoleIds,
                    position_x: stage.x || 0,
                    position_y: stage.y || 0,
                    initial_form_id: stageFormId,
                    visual_config: {
                        // Keep minimal UI state, no embedded forms
                        position_x: stage.x || 0,
                        position_y: stage.y || 0
                    }
                };
                
                const createdStage = await this.create('workflow_stages', stageData);
                
                // Build mapping from original stage IDs/keys to new database IDs
                const originalId = stage.id || stage.key;
                stageIdMapping.set(originalId, createdStage.id);
                
                logger.log('Created stage:', stage.name, 'with form:', stageFormId);
            }
        }
        
        // Create workflow actions with proper form handling
        if (workflowConfig.actions && Array.isArray(workflowConfig.actions)) {
            for (const action of workflowConfig.actions) {
                // Map role names to role IDs for allowedRoles
                let allowedRoleIds = [];
                if (action.allowedRoles && Array.isArray(action.allowedRoles)) {
                    allowedRoleIds = action.allowedRoles.map(roleRef => {
                        // If it's a UUID, keep it as is
                        if (typeof roleRef === 'string' && roleRef.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                            return roleRef;
                        }
                        // Otherwise, try to find role by name
                        const role = results.roles.find(r => r.name === roleRef);
                        return role ? role.id : null;
                    }).filter(id => id !== null);
                }
                
                // Create form if action has formFields
                let actionFormId = null;
                if (action.formFields && Array.isArray(action.formFields) && action.formFields.length > 0) {
                    logger.log('Creating form for action:', action.name);
                    
                    // Normalize form fields with proper field_options
                    const normalizedFields = action.formFields.map(field => this.normalizeFormField(field));
                    
                    const form = await formService.createFormWithFields({
                        name: `${action.name} Form`,
                        description: `Form for workflow action: ${action.name}`
                    }, normalizedFields);
                    
                    actionFormId = form.id;
                    logger.log('Created action form:', actionFormId);
                }
                
                // Map stage IDs using the mapping we created
                const mappedFromStageId = stageIdMapping.get(action.fromStageId) || action.fromStageId;
                const mappedToStageId = stageIdMapping.get(action.toStageId) || action.toStageId;
                
                // Create action with proper form reference
                const actionData = {
                    workflow_id: createdWorkflow.id,
                    from_stage_id: mappedFromStageId,
                    to_stage_id: mappedToStageId,
                    action_name: action.name,
                    action_type: action.type,
                    button_label: action.buttonLabel || 'Next',
                    button_color: action.buttonColor || '#007bff',
                    allowed_roles: allowedRoleIds,
                    conditions: action.conditions || {},
                    requires_confirmation: action.requiresConfirmation || false,
                    confirmation_message: action.confirmationMessage || '',
                    form_id: actionFormId,
                    visual_config: {
                        // Keep minimal UI state, no embedded forms
                        editableFields: action.editableFields || []
                    }
                };
                
                await this.create('workflow_actions', actionData);
                logger.log('Created action:', action.name, 'with form:', actionFormId);
            }
        }
        
        logger.log('Workflow imported with proper form architecture:', createdWorkflow.name);
    }
    
    /**
     * Normalize form field from import format to proper database format
     */
    normalizeFormField(field) {
        // Build proper field_options based on field type
        const fieldType = this.normalizeFieldType(field.type);
        
        // Start with the field's existing field_options or empty object
        let fieldOptions = field.field_options || {};
        
        // If field_options is empty, build proper options based on field type
        if (Object.keys(fieldOptions).length === 0) {
            switch (fieldType) {
                case 'dropdown':
                case 'multiple_choice':
                    fieldOptions = {
                        options: field.options || [],
                        allow_other: field.allow_other || false,
                        randomize_order: field.randomize_order || false,
                        ...(fieldType === 'multiple_choice' && { allow_multiple: field.allow_multiple || false })
                    };
                    break;
                    
                case 'smart_dropdown':
                    fieldOptions = {
                        source_type: field.source_type || 'field',
                        source_field: field.source_field || '',
                        source_table_id: field.source_table_id || null,
                        display_column: field.display_column || '',
                        value_column: field.value_column || '',
                        mappings: field.mappings || [],
                        allow_create: field.allow_create || false,
                        default_options: field.default_options || []
                    };
                    break;
                    
                case 'file':
                    fieldOptions = {
                        accept: field.accept || '',
                        multiple: field.multiple || false,
                        max_size: field.max_size || 10485760,
                        max_files: field.max_files || 1
                    };
                    break;
                    
                case 'number':
                    fieldOptions = {
                        step: field.step || 1,
                        min: field.min || null,
                        max: field.max || null
                    };
                    break;
                    
                case 'date':
                    fieldOptions = {
                        format: field.format || 'yyyy-mm-dd',
                        min_date: field.min_date || null,
                        max_date: field.max_date || null
                    };
                    break;
                    
                case 'short_text':
                case 'long_text':
                    fieldOptions = {
                        min_length: field.min_length || null,
                        max_length: field.max_length || null,
                        pattern: field.pattern || null
                    };
                    break;
                    
                case 'email':
                    fieldOptions = {
                        domains: field.domains || [],
                        require_verification: field.require_verification || false
                    };
                    break;
                    
                case 'signature':
                    fieldOptions = {
                        width: field.width || 400,
                        height: field.height || 200,
                        background_color: field.background_color || '#ffffff',
                        pen_color: field.pen_color || '#000000'
                    };
                    break;
                    
                default:
                    // For legacy support, check if options exist
                    if (field.options && Array.isArray(field.options)) {
                        fieldOptions = { options: field.options };
                    }
                    break;
            }
        }
        
        return {
            field_key: field.key,
            field_label: field.label,
            field_type: fieldType,
            field_order: field.order || 1,
            is_required: field.required || false,
            placeholder: field.placeholder || '',
            help_text: field.help || '',
            validation_rules: field.validation_rules || {},
            field_options: fieldOptions,
            conditional_logic: field.conditional_logic || {}
        };
    }
    
    /**
     * Normalize field type from import format to database format
     */
    normalizeFieldType(importType) {
        const typeMapping = {
            'short': 'short_text',
            'long': 'long_text',
            'text': 'short_text',
            'dropdown': 'dropdown',
            'select': 'dropdown',
            'multiple': 'multiple_choice',
            'date': 'date',
            'file': 'file',
            'number': 'number',
            'email': 'email',
            'smart_dropdown': 'smart_dropdown',
            'signature': 'signature'
        };
        
        return typeMapping[importType] || importType || 'short_text';
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const { data, error } = await this.client
                .from('projects')
                .select('id')
                .limit(1);
                
            return { 
                status: error ? 'error' : 'ok', 
                error: error?.message 
            };
        } catch (error) {
            return { 
                status: 'error', 
                error: error.message 
            };
        }
    }
}

// Create singleton instance
const supabaseClient = new SupabaseClient();

// Configuration management
const CONFIG_KEY = 'map_survey_config';

function getStoredConfig() {
    try {
        const config = localStorage.getItem(CONFIG_KEY);
        return config ? JSON.parse(config) : null;
    } catch (error) {
        logger.warn('Failed to parse stored config:', error);
        return null;
    }
}

function storeConfig(config) {
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        return true;
    } catch (error) {
        logger.error('Failed to store config:', error);
        return false;
    }
}

function clearStoredConfig() {
    try {
        localStorage.removeItem(CONFIG_KEY);
        return true;
    } catch (error) {
        logger.error('Failed to clear config:', error);
        return false;
    }
}

// Auto-initialize if config exists
async function initializeFromStoredConfig() {
    const config = getStoredConfig();
    if (config && config.supabaseUrl && config.supabaseAnonKey) {
        try {
            await supabaseClient.initialize(config.supabaseUrl, config.supabaseAnonKey);
            return true;
        } catch (error) {
            logger.error('Auto-initialization failed:', error);
            clearStoredConfig();
            return false;
        }
    }
    return false;
}

// Export the client and utilities
export {
    supabaseClient,
    getStoredConfig,
    storeConfig,
    clearStoredConfig,
    initializeFromStoredConfig
};