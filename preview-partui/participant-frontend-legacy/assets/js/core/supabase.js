/**
 * Supabase Client Wrapper
 * Provides authentication and database operations for the admin interface
 */

import DebugLogger from './debug-logger.js';

class SupabaseClient {
    constructor() {
        this.client = null;
        this.serviceClient = null; // Service role client for participant operations
        this.currentUser = null;
        this.authListeners = [];
        this.isInitialized = false;
        this.currentProjectId = null;
        this.participantMode = false;
        this.currentJWT = null; // Store JWT for participant authentication
        this.logger = new DebugLogger('SupabaseClient');
    }

    /**
     * Initialize the Supabase client
     * @param {string} url - Supabase project URL
     * @param {string} anonKey - Supabase anonymous key
     * @param {string} serviceRoleKey - Supabase service role key (optional)
     * @param {boolean} participantMode - Whether to initialize for participant app (no service role)
     */
    async initialize(url, anonKey, serviceRoleKey = null, participantMode = false) {
        try {
            if (!url || !anonKey) {
                throw new Error('Supabase URL and anonymous key are required');
            }

            // Store URL and key for later use
            this.supabaseUrl = url;
            this.anonKey = anonKey;

            // Wait for Supabase library to load
            await this.waitForSupabaseLibrary();

            // Client headers and settings depend on mode
            const clientHeaders = participantMode 
                ? { 'X-Client-Info': 'map-survey-participants/1.0.0' }
                : { 'X-Client-Info': 'map-survey-admin/1.0.0' };

            this.client = window.supabase.createClient(url, anonKey, {
                auth: {
                    autoRefreshToken: !participantMode, // Participants don't use Supabase auth
                    persistSession: !participantMode,   // Participants use custom session management
                    detectSessionInUrl: !participantMode
                },
                global: {
                    headers: clientHeaders
                }
            });
            
            // Store participant mode flag
            this.participantMode = participantMode;

            // Create service role client for admin operations (bypasses RLS) - not for participants
            if (serviceRoleKey && !participantMode) {
                this.logger.log('Creating service role client with key length:', serviceRoleKey.length);
                this.serviceClient = window.supabase.createClient(url, serviceRoleKey, {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    },
                    global: {
                        headers: {
                            'X-Client-Info': 'map-survey-participants/1.0.0'
                        }
                    }
                });
                this.logger.log('Service role client created successfully');
            } else if (participantMode) {
                this.logger.log('Participant mode - no service role client created');
            } else {
                this.logger.warn('No service role key provided - participant operations may fail due to RLS');
            }

            // Set up auth state listener - but ignore sessions in participant mode
            if (!participantMode) {
                this.client.auth.onAuthStateChange((event, session) => {
                    this.logger.log('Auth state changed:', event, session?.user?.email);
                    
                    this.currentUser = session?.user || null;
                    
                    // Notify all listeners
                    this.authListeners.forEach(callback => {
                        try {
                            callback(event, session);
                        } catch (error) {
                            this.logger.error('Auth listener error:', error);
                        }
                    });
                });

                // Check for existing session
                const { data: { session }, error } = await this.client.auth.getSession();
                if (error) {
                    this.logger.warn('Session retrieval error:', error);
                } else if (session) {
                    this.currentUser = session.user;
                }
            } else {
                this.logger.log('Participant mode - ignoring admin authentication sessions');
            }

            this.isInitialized = true;
            this.logger.log('Supabase client initialized successfully');
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize Supabase client:', error);
            throw error;
        }
    }

    /**
     * Wait for Supabase library to load
     */
    async waitForSupabaseLibrary(maxAttempts = 50) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            
            const checkForSupabase = () => {
                if (window.supabase && window.supabase.createClient) {
                    resolve();
                    return;
                }
                
                attempts++;
                if (attempts >= maxAttempts) {
                    reject(new Error('Supabase library failed to load after maximum attempts'));
                    return;
                }
                
                setTimeout(checkForSupabase, 100);
            };
            
            checkForSupabase();
        });
    }

    /**
     * Set JWT for participant authentication
     * @param {string} jwt - JWT token from Edge Function
     */
    async setParticipantJWT(jwt) {
        if (!this.participantMode) {
            throw new Error('JWT authentication only available in participant mode');
        }
        
        try {
            // Store JWT for reference
            this.currentJWT = jwt;
            
            // Create a new client with the custom JWT token
            // This is the recommended approach for custom authentication
            this.client = window.supabase.createClient(this.supabaseUrl, this.anonKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false
                },
                global: {
                    headers: {
                        'Authorization': `Bearer ${jwt}`,
                        'X-Client-Info': 'map-survey-participants/1.0.0'
                    }
                }
            });
            
            this.logger.log('Participant JWT set for RLS authentication');
            this.logger.log('JWT token preview:', jwt.substring(0, 50) + '...');
            this.logger.log('New Supabase client created with JWT authorization');
            return true;
        } catch (error) {
            this.logger.error('Failed to set participant JWT:', error);
            return false;
        }
    }
    
    /**
     * Clear participant JWT session
     */
    async clearParticipantJWT() {
        if (!this.participantMode) {
            return;
        }
        
        try {
            // Clear our stored JWT
            this.currentJWT = null;
            
            // Recreate client without JWT authorization
            this.client = window.supabase.createClient(this.supabaseUrl, this.anonKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false
                },
                global: {
                    headers: {
                        'X-Client-Info': 'map-survey-participants/1.0.0'
                    }
                }
            });
            
            this.logger.log('Participant JWT cleared and client reset');
        } catch (error) {
            this.logger.error('Failed to clear participant JWT:', error);
            // Make sure JWT is cleared even if reset fails
            this.currentJWT = null;
        }
    }
    
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        if (this.participantMode) {
            // For participants, check if we have a valid JWT
            // The JWT manager handles validation - we just check if we have one
            return !!this.currentJWT || this.hasValidSupabaseSession();
        }
        
        // For admin mode, use existing logic
        return !!this.currentUser && this.isInitialized;
    }
    
    /**
     * Check if Supabase has a valid session
     * @private
     */
    hasValidSupabaseSession() {
        try {
            const { data: { session } } = this.client.auth.getSession();
            return !!session?.access_token;
        } catch (error) {
            this.logger.warn('Error checking Supabase session:', error);
            return false;
        }
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
            this.logger.error('Sign in error:', error);
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
            this.logger.error('Sign out error:', error);
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
            // Execute RPC function with current authentication context
            const { data, error } = await this.client.rpc(functionName, params);
            if (error) throw error;
            return data;
        } catch (error) {
            this.logger.error(`RPC ${functionName} error:`, error);
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
            this.logger.error(`Get all ${table} error:`, error);
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
            this.logger.error(`Get ${table} by ID error:`, error);
            throw error;
        }
    }

    /**
     * Create a new record
     */
    async create(table, data) {
        try {
            this.logger.log(`SupabaseClient: Creating record in table '${table}' with data:`, data);
            
            // Auto-inject project context for project-related tables
            const enhancedData = this._injectProjectContext(table, data);
            
            this.logger.log(`SupabaseClient: Enhanced data after context injection:`, enhancedData);
            
            const { data: result, error } = await this.from(table)
                .insert(enhancedData)
                .select()
                .single();
                
            if (error) {
                // If the error is RLS-related but insert succeeded, return the input data
                if (error.code === '42501' && error.message.includes('row-level security policy')) {
                    this.logger.warn(`RLS policy prevents reading ${table} after creation, returning input data`);
                    return { ...enhancedData, id: 'created' }; // Placeholder since we can't get the real ID
                }
                throw error;
            }
            return result;
        } catch (error) {
            this.logger.error(`Create ${table} error:`, error);
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
                    this.logger.warn(`RLS policy prevents reading ${table} after update, returning input data`);
                    return { ...data, id };
                }
                throw error;
            }
            return result;
        } catch (error) {
            this.logger.error(`Update ${table} error:`, error);
            throw error;
        }
    }

    /**
     * Update a record with audit trail logging
     */
    async updateWithAudit(table, id, data, auditContext = {}) {
        try {
            // Validate ID parameter
            if (!id || id === 'undefined' || id === 'null' || id === '') {
                throw new Error(`Invalid ID provided for ${table} update: ${id}`);
            }

            // Capture before state for audit
            let beforeState = null;
            try {
                beforeState = await this.getById(table, id);
            } catch (getError) {
                this.logger.warn(`Could not fetch before state for audit: ${getError.message}`);
            }

            // Perform the update
            const result = await this.update(table, id, data);

            // Log audit entry
            try {
                await this.logAuditEntry({
                    table,
                    recordId: id,
                    beforeState,
                    afterState: { ...data, id },
                    activityType: auditContext.activityType || 'update',
                    activitySummary: auditContext.activitySummary || `Updated ${table} record`,
                    activityDetails: auditContext.activityDetails || {},
                    metadata: auditContext.metadata || {}
                });
            } catch (auditError) {
                this.logger.error('Failed to log audit entry:', auditError);
                // Don't fail the update if audit logging fails
            }

            return result;
        } catch (error) {
            this.logger.error(`Update with audit ${table} error:`, error);
            throw error;
        }
    }

    /**
     * Log audit entry to instance_activity_log
     */
    async logAuditEntry(auditData) {
        try {
            const {
                table,
                recordId,
                beforeState,
                afterState,
                activityType,
                activitySummary,
                activityDetails,
                metadata
            } = auditData;

            // Calculate field changes
            const fieldChanges = this.calculateFieldChanges(beforeState, afterState);

            // Get current user info based on authentication mode
            let performedBy = null;
            
            if (this.participantMode) {
                // In participant mode, get user from participant auth
                try {
                    const { default: participantAuth } = await import('../auth/participant-auth.js');
                    const authStatus = participantAuth.getAuthStatus();
                    performedBy = authStatus.participant?.id;
                } catch (authError) {
                    this.logger.warn('Could not get participant auth status:', authError);
                }
            } else {
                // In admin mode, get user from current user
                const currentUser = this.getCurrentUser();
                performedBy = currentUser?.id;
            }

            if (!performedBy) {
                this.logger.warn('No user ID available for audit log');
                return;
            }

            // Determine instance ID based on table
            let instanceId = recordId;
            if (table === 'markers') {
                // For markers, we don't have a direct workflow instance
                // This could be enhanced to link markers to instances if needed
                this.logger.log('Audit logging for marker changes - no instance_id mapping');
                return;
            } else if (table === 'instance_data') {
                // For instance_data, the instanceId is already passed correctly
                // No additional mapping needed
                this.logger.log('Audit logging for instance_data changes');
            } else if (table !== 'workflow_instances') {
                // For other tables, try to find associated instance
                this.logger.log(`Audit logging for ${table} - considering instance mapping`);
                return;
            }

            const auditEntry = {
                instance_id: instanceId,
                activity_type: activityType,
                performed_by: performedBy,
                performed_at: new Date().toISOString(),
                field_changes: fieldChanges,
                activity_summary: activitySummary,
                activity_details: {
                    table: table,
                    record_id: recordId,
                    ...activityDetails
                },
                metadata: {
                    user_agent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    ...metadata
                }
            };

            // Insert audit log entry
            const { error } = await this.from('instance_activity_log')
                .insert(auditEntry);

            if (error) {
                throw error;
            }

            this.logger.log('Audit entry logged successfully', {
                instanceId,
                activityType,
                changedFields: Object.keys(fieldChanges)
            });

        } catch (error) {
            this.logger.error('Failed to log audit entry:', error);
            throw error;
        }
    }

    /**
     * Calculate field changes between before and after states
     */
    calculateFieldChanges(beforeState, afterState) {
        const changes = {};

        if (!beforeState || !afterState) {
            return changes;
        }

        // Compare each field in afterState with beforeState
        Object.keys(afterState).forEach(field => {
            const oldValue = beforeState[field];
            const newValue = afterState[field];

            // Skip system fields that are auto-updated
            if (['updated_at', 'created_at'].includes(field)) {
                return;
            }

            // Compare values (handle different types)
            if (this.isDifferentValue(oldValue, newValue)) {
                changes[field] = {
                    from: oldValue,
                    to: newValue
                };
            }
        });

        return changes;
    }

    /**
     * Check if two values are different for audit purposes
     */
    isDifferentValue(oldValue, newValue) {
        // Handle null/undefined
        if (oldValue == null && newValue == null) {
            return false;
        }
        if (oldValue == null || newValue == null) {
            return true;
        }

        // Handle arrays (for PostGIS coordinates, role arrays, etc.)
        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
            return JSON.stringify(oldValue) !== JSON.stringify(newValue);
        }

        // Handle objects (for JSONB fields)
        if (typeof oldValue === 'object' && typeof newValue === 'object') {
            return JSON.stringify(oldValue) !== JSON.stringify(newValue);
        }

        // Simple comparison
        return oldValue !== newValue;
    }

    /**
     * Upsert data with audit trail logging for instance_data operations
     */
    async upsertInstanceDataWithAudit(instanceId, records, auditContext = {}) {
        try {
            if (!instanceId || !records || records.length === 0) {
                throw new Error('Invalid instanceId or empty records for upsert');
            }

            this.logger.log('Upserting instance data with audit:', {
                instanceId,
                recordCount: records.length,
                auditContext
            });

            // Get before state for audit
            const beforeData = await this.getInstanceDataForAudit(instanceId, records);

            // Perform the upsert
            const { data, error } = await this.from('instance_data')
                .upsert(records, { 
                    onConflict: 'instance_id,field_id',
                    ignoreDuplicates: false 
                })
                .select();

            if (error) {
                throw error;
            }

            // Log audit entry for data submission
            try {
                const fieldChanges = this.calculateInstanceDataChanges(beforeData, records);
                
                await this.logAuditEntry({
                    table: 'instance_data',
                    recordId: instanceId,
                    beforeState: beforeData,
                    afterState: records,
                    activityType: auditContext.activityType || 'form_data_submission',
                    activitySummary: auditContext.activitySummary || `Updated ${records.length} form fields`,
                    activityDetails: {
                        recordCount: records.length,
                        fieldIds: records.map(r => r.field_id),
                        ...auditContext.activityDetails
                    },
                    metadata: {
                        operation: 'upsert',
                        component: 'supabase-client',
                        ...auditContext.metadata
                    }
                });
            } catch (auditError) {
                this.logger.error('Failed to log instance data audit entry:', auditError);
                // Don't fail the operation if audit logging fails
            }

            return data;
        } catch (error) {
            this.logger.error('Upsert instance data with audit error:', error);
            throw error;
        }
    }

    /**
     * Get current instance data for audit comparison
     */
    async getInstanceDataForAudit(instanceId, newRecords) {
        try {
            const fieldIds = newRecords.map(r => r.field_id);
            const { data } = await this.from('instance_data')
                .select('*')
                .eq('instance_id', instanceId)
                .in('field_id', fieldIds);
            
            return data || [];
        } catch (error) {
            this.logger.warn('Could not fetch before state for instance data audit:', error);
            return [];
        }
    }

    /**
     * Calculate changes for instance data operations
     */
    calculateInstanceDataChanges(beforeData, afterRecords) {
        const changes = {};
        
        // Create lookup map for before data
        const beforeMap = new Map();
        beforeData.forEach(item => {
            beforeMap.set(item.field_id, item.field_value);
        });

        // Compare with after records
        afterRecords.forEach(record => {
            const fieldId = record.field_id;
            const oldValue = beforeMap.get(fieldId);
            const newValue = record.field_value;

            if (this.isDifferentValue(oldValue, newValue)) {
                changes[fieldId] = {
                    from: oldValue || null,
                    to: newValue
                };
            }
        });

        return changes;
    }

    /**
     * Update instance data with audit trail logging
     */
    async updateInstanceDataWithAudit(instanceId, fieldId, fieldValue, auditContext = {}) {
        try {
            // Get before state
            const { data: beforeData } = await this.from('instance_data')
                .select('*')
                .eq('instance_id', instanceId)
                .eq('field_id', fieldId)
                .single();

            // Perform the update
            const { data, error } = await this.from('instance_data')
                .update({ field_value: fieldValue })
                .eq('instance_id', instanceId)
                .eq('field_id', fieldId)
                .select();

            if (error) {
                throw error;
            }

            // Log audit entry
            try {
                const fieldChanges = {
                    [fieldId]: {
                        from: beforeData?.field_value || null,
                        to: fieldValue
                    }
                };

                await this.logAuditEntry({
                    table: 'instance_data',
                    recordId: instanceId,
                    beforeState: beforeData,
                    afterState: { field_id: fieldId, field_value: fieldValue },
                    activityType: auditContext.activityType || 'field_update',
                    activitySummary: auditContext.activitySummary || `Updated field ${fieldId}`,
                    activityDetails: {
                        fieldId: fieldId,
                        ...auditContext.activityDetails
                    },
                    metadata: {
                        operation: 'update',
                        component: 'supabase-client',
                        ...auditContext.metadata
                    }
                });
            } catch (auditError) {
                this.logger.error('Failed to log instance data update audit entry:', auditError);
            }

            return data;
        } catch (error) {
            this.logger.error('Update instance data with audit error:', error);
            throw error;
        }
    }

    /**
     * Log file operations with audit trail
     */
    async logFileOperationAudit(instanceId, operation, details, auditContext = {}) {
        try {
            await this.logAuditEntry({
                table: 'workflow_instances', // Associate with workflow instance
                recordId: instanceId,
                beforeState: null,
                afterState: null,
                activityType: auditContext.activityType || 'file_operation',
                activitySummary: auditContext.activitySummary || `File ${operation}: ${details.fileName || 'unknown'}`,
                activityDetails: {
                    operation: operation,
                    fileName: details.fileName,
                    filePath: details.filePath,
                    fileSize: details.fileSize,
                    oldPath: details.oldPath,
                    newPath: details.newPath,
                    ...auditContext.activityDetails
                },
                metadata: {
                    operation: 'file_operation',
                    component: 'file-service',
                    ...auditContext.metadata
                }
            });

            this.logger.log('File operation audit logged:', operation, details);
        } catch (error) {
            this.logger.error('Failed to log file operation audit:', error);
            // Don't throw - file operations shouldn't fail due to audit issues
        }
    }

    /**
     * Add participant role with audit logging
     */
    async addParticipantRoleWithAudit(participantId, roleId, auditContext = {}) {
        try {
            // Get current roles for audit
            const currentRoles = await this.getParticipantRoles(participantId);
            
            // Perform the role addition
            const result = await this._addParticipantRoleInternal(participantId, roleId);
            
            // Get updated roles
            const updatedRoles = await this.getParticipantRoles(participantId);

            // Log audit entry
            try {
                await this.logAuditEntry({
                    table: 'participants',
                    recordId: participantId,
                    beforeState: { roles: currentRoles.map(r => r.id) },
                    afterState: { roles: updatedRoles.map(r => r.id) },
                    activityType: auditContext.activityType || 'role_assignment',
                    activitySummary: auditContext.activitySummary || `Added role to participant`,
                    activityDetails: {
                        participantId: participantId,
                        addedRoleId: roleId,
                        ...auditContext.activityDetails
                    },
                    metadata: {
                        operation: 'role_add',
                        component: 'supabase-client',
                        ...auditContext.metadata
                    }
                });
            } catch (auditError) {
                this.logger.error('Failed to log role assignment audit:', auditError);
            }

            return result;
        } catch (error) {
            this.logger.error('Add participant role with audit error:', error);
            throw error;
        }
    }

    /**
     * Remove participant role with audit logging
     */
    async removeParticipantRoleWithAudit(participantId, roleId, auditContext = {}) {
        try {
            // Get current roles for audit
            const currentRoles = await this.getParticipantRoles(participantId);
            
            // Perform the role removal
            const result = await this._removeParticipantRoleInternal(participantId, roleId);
            
            // Get updated roles
            const updatedRoles = await this.getParticipantRoles(participantId);

            // Log audit entry
            try {
                await this.logAuditEntry({
                    table: 'participants',
                    recordId: participantId,
                    beforeState: { roles: currentRoles.map(r => r.id) },
                    afterState: { roles: updatedRoles.map(r => r.id) },
                    activityType: auditContext.activityType || 'role_removal',
                    activitySummary: auditContext.activitySummary || `Removed role from participant`,
                    activityDetails: {
                        participantId: participantId,
                        removedRoleId: roleId,
                        ...auditContext.activityDetails
                    },
                    metadata: {
                        operation: 'role_remove',
                        component: 'supabase-client',
                        ...auditContext.metadata
                    }
                });
            } catch (auditError) {
                this.logger.error('Failed to log role removal audit:', auditError);
            }

            return result;
        } catch (error) {
            this.logger.error('Remove participant role with audit error:', error);
            throw error;
        }
    }

    /**
     * Set participant roles with audit logging
     */
    async setParticipantRolesWithAudit(participantId, roleIds, auditContext = {}) {
        try {
            // Get current roles for audit
            const currentRoles = await this.getParticipantRoles(participantId);
            
            // Perform the role update
            const result = await this._setParticipantRolesInternal(participantId, roleIds);
            
            // Get updated roles
            const updatedRoles = await this.getParticipantRoles(participantId);

            // Log audit entry
            try {
                const fieldChanges = {
                    roles: {
                        from: currentRoles.map(r => r.id),
                        to: updatedRoles.map(r => r.id)
                    }
                };

                await this.logAuditEntry({
                    table: 'participants',
                    recordId: participantId,
                    beforeState: { roles: currentRoles.map(r => r.id) },
                    afterState: { roles: updatedRoles.map(r => r.id) },
                    activityType: auditContext.activityType || 'role_update',
                    activitySummary: auditContext.activitySummary || `Updated participant roles`,
                    activityDetails: {
                        participantId: participantId,
                        newRoleIds: roleIds,
                        addedRoles: roleIds.filter(id => !currentRoles.find(r => r.id === id)),
                        removedRoles: currentRoles.filter(r => !roleIds.includes(r.id)).map(r => r.id),
                        ...auditContext.activityDetails
                    },
                    metadata: {
                        operation: 'role_set',
                        component: 'supabase-client',
                        ...auditContext.metadata
                    }
                });
            } catch (auditError) {
                this.logger.error('Failed to log role update audit:', auditError);
            }

            return result;
        } catch (error) {
            this.logger.error('Set participant roles with audit error:', error);
            throw error;
        }
    }

    /**
     * Delete records with audit trail logging
     */
    async deleteWithAudit(table, ids, auditContext = {}) {
        try {
            // Handle both single ID and array of IDs
            const idArray = Array.isArray(ids) ? ids : [ids];
            
            // Get records before deletion for audit
            const beforeRecords = [];
            for (const id of idArray) {
                try {
                    const record = await this.getById(table, id);
                    beforeRecords.push(record);
                } catch (getError) {
                    this.logger.warn(`Could not fetch record ${id} before deletion:`, getError);
                }
            }

            // Perform the deletion
            let result;
            if (Array.isArray(ids)) {
                result = await this.deleteBatch(table, ids);
            } else {
                result = await this.delete(table, ids);
            }

            // Log audit entries
            for (let i = 0; i < idArray.length; i++) {
                const recordId = idArray[i];
                const beforeRecord = beforeRecords[i];

                try {
                    await this.logAuditEntry({
                        table: table,
                        recordId: recordId,
                        beforeState: beforeRecord,
                        afterState: null,
                        activityType: auditContext.activityType || 'record_deletion',
                        activitySummary: auditContext.activitySummary || `Deleted ${table} record`,
                        activityDetails: {
                            deletedRecordId: recordId,
                            ...auditContext.activityDetails
                        },
                        metadata: {
                            operation: 'delete',
                            component: 'supabase-client',
                            ...auditContext.metadata
                        }
                    });
                } catch (auditError) {
                    this.logger.error(`Failed to log deletion audit for ${recordId}:`, auditError);
                }
            }

            return result;
        } catch (error) {
            this.logger.error('Delete with audit error:', error);
            throw error;
        }
    }

    /**
     * Add a role to a participant (public method with audit logging)
     */
    async addParticipantRole(participantId, roleId, auditContext = {}) {
        return this.addParticipantRoleWithAudit(participantId, roleId, auditContext);
    }

    /**
     * Remove a role from a participant (public method with audit logging)
     */
    async removeParticipantRole(participantId, roleId, auditContext = {}) {
        return this.removeParticipantRoleWithAudit(participantId, roleId, auditContext);
    }

    /**
     * Set all roles for a participant (public method with audit logging)
     */
    async setParticipantRoles(participantId, roleIds, auditContext = {}) {
        return this.setParticipantRolesWithAudit(participantId, roleIds, auditContext);
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
            this.logger.error(`Delete ${table} error:`, error);
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
            this.logger.warn(`Table access check for ${table}:`, error);
            return false;
        }
    }

    /**
     * Project-specific methods
     */

    /**
     * Get projects for current user
     */
    async getProjects() {
        return this.getAll('projects', {
            orderBy: { column: 'created_at', ascending: false }
        });
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
        this.logger.log(`SupabaseClient: createWithProjectContext called:`, {
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
        
        this.logger.log(`SupabaseClient: Final data for createWithProjectContext:`, finalData);
        
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
            this.logger.warn('No valid project ID found. Current project context is not set.');
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
            this.logger.warn('Failed to load current project:', error);
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
                    this.logger.warn(`RLS policy prevents reading ${table} after batch creation, returning input data`);
                    return enhancedRecords.map((record, index) => ({ ...record, id: `created_${index}` }));
                }
                throw error;
            }
            return data;
        } catch (error) {
            this.logger.error(`Batch create ${table} error:`, error);
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
                    this.logger.warn(`RLS policy prevents reading ${table} after batch update, returning input data`);
                    return ids.map(id => ({ ...data, id }));
                }
                throw error;
            }
            return result;
        } catch (error) {
            this.logger.error(`Batch update ${table} error:`, error);
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
            this.logger.error(`Batch delete ${table} error:`, error);
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
            this.logger.error('Create project error:', error);
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
            
            return await this.updateWithAudit('custom_tables', tableId, data, {
                activityType: 'custom_table_update',
                activitySummary: `Updated custom table: ${table.table_name}`,
                activityDetails: {
                    tableName: table.table_name,
                    projectId: table.project_id,
                    component: 'custom-table-management'
                }
            });
        } catch (error) {
            this.logger.error(`Update custom table error:`, error);
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
            this.logger.error(`Create custom table column error:`, error);
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
            
            return await this.updateWithAudit('custom_table_columns', columnId, columnData, {
                activityType: 'custom_table_column_update',
                activitySummary: `Updated column: ${column.column_name}`,
                activityDetails: {
                    columnName: column.column_name,
                    tableName: table.table_name,
                    tableId: table.id,
                    component: 'custom-table-management'
                }
            });
        } catch (error) {
            this.logger.error(`Update custom table column error:`, error);
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
            
            return await this.deleteWithAudit('custom_table_columns', columnId, {
                activityType: 'custom_table_column_deletion',
                activitySummary: `Deleted column: ${column.column_name}`,
                activityDetails: {
                    columnName: column.column_name,
                    tableName: table.table_name,
                    tableId: table.id,
                    component: 'custom-table-management'
                }
            });
        } catch (error) {
            this.logger.error(`Delete custom table column error:`, error);
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
            this.logger.error(`Create custom table error:`, error);
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
            this.logger.error(`Get custom table with columns error:`, error);
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
            this.logger.error(`Get table data preview error:`, error);
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
            
            // Get all table data for audit before deletion
            const { data: tableData } = await this.from('custom_table_data')
                .select('id')
                .eq('table_id', tableId);
            const dataIds = tableData?.map(d => d.id) || [];
            
            // Get all table columns for audit before deletion
            const { data: tableColumns } = await this.from('custom_table_columns')
                .select('id')
                .eq('table_id', tableId);
            const columnIds = tableColumns?.map(c => c.id) || [];

            // Delete table data with audit
            if (dataIds.length > 0) {
                await this.deleteWithAudit('custom_table_data', dataIds, {
                    activityType: 'custom_table_data_deletion',
                    activitySummary: `Deleted ${dataIds.length} data records from custom table`,
                    activityDetails: {
                        tableId: tableId,
                        tableName: table.table_name,
                        component: 'custom-table-management'
                    }
                });
            }
            
            // Delete table columns with audit
            if (columnIds.length > 0) {
                await this.deleteWithAudit('custom_table_columns', columnIds, {
                    activityType: 'custom_table_columns_deletion',
                    activitySummary: `Deleted ${columnIds.length} columns from custom table`,
                    activityDetails: {
                        tableId: tableId,
                        tableName: table.table_name,
                        component: 'custom-table-management'
                    }
                });
            }
            
            // Delete table with audit
            return await this.deleteWithAudit('custom_tables', tableId, {
                activityType: 'custom_table_deletion',
                activitySummary: `Deleted custom table: ${table.table_name}`,
                activityDetails: {
                    tableName: table.table_name,
                    projectId: table.project_id,
                    component: 'custom-table-management'
                }
            });
        } catch (error) {
            this.logger.error(`Delete custom table error:`, error);
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
        
        this.logger.log(`SupabaseClient: _injectProjectContext check for table '${table}':`, {
            isProjectTable: projectTables.includes(table),
            hasProjectIdInData: !!data.project_id,
            currentProjectId: currentProjectId,
            willInject: projectTables.includes(table) && !data.project_id && currentProjectId
        });
        
        // Don't inject if table doesn't need it or data already has project_id
        if (!projectTables.includes(table) || data.project_id || !currentProjectId) {
            return data;
        }
        
        this.logger.log(`SupabaseClient: Injecting project context (${currentProjectId}) for table: ${table}`);
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
     * Get the client to use for participant operations (regular client with fallback to service)
     */
    getParticipantClient() {
        // Use regular client with JWT authentication for RLS-compliant operations
        return this.client;
    }

    /**
     * Get all roles assigned to a participant
     */
    async getParticipantRoles(participantId) {
        try {
            this.logger.log('Getting participant roles for:', participantId);
            
            // Try regular client first (same as login), fall back to service client
            let participant = null;
            let participantError = null;
            
            // First attempt with regular client using JWT
            this.logger.log('Attempting with regular client (with JWT)...');
            
            // Use the from() method which will inject JWT headers automatically
            const { data: participantData1, error: error1 } = await this.from('participants')
                .select('role_id, project_id')
                .eq('id', participantId)
                .single();
            
            if (!error1) {
                participant = participantData1;
                this.logger.log('Success with regular client');
            } else {
                this.logger.log('Regular client failed:', error1);
                
                // Fall back to service client
                if (this.serviceClient) {
                    this.logger.log('Attempting with service client...');
                    const { data: participantData2, error: error2 } = await this.serviceClient
                        .from('participants')
                        .select('role_id, project_id')
                        .eq('id', participantId)
                        .single();
                    
                    if (!error2) {
                        participant = participantData2;
                        this.logger.log('Success with service client');
                    } else {
                        this.logger.log('Service client also failed:', error2);
                        participantError = error2;
                    }
                } else {
                    participantError = error1;
                }
            }
            
            if (participantError) {
                this.logger.error('Participant query error:', participantError);
                return [];
            }
            
            // If no role assigned, return empty array
            if (!participant.role_id) {
                this.logger.warn('No role assigned to participant:', participantId);
                return [];
            }
            
            // Handle different role_id formats
            let roleIds = [];
            this.logger.log('participant.role_id type:', typeof participant.role_id);
            this.logger.log('participant.role_id value:', participant.role_id);
            this.logger.log('participant.role_id raw:', JSON.stringify(participant.role_id));
            
            if (Array.isArray(participant.role_id)) {
                // role_id is already an array of UUIDs
                this.logger.log('Processing as array');
                roleIds = participant.role_id.filter(id => id && typeof id === 'string' && id !== 'null');
            } else if (typeof participant.role_id === 'string') {
                this.logger.log('Processing as string');
                try {
                    // Try to parse as JSON array first
                    const parsed = JSON.parse(participant.role_id);
                    if (Array.isArray(parsed)) {
                        this.logger.log('Parsed as JSON array:', parsed);
                        roleIds = parsed.filter(id => id && typeof id === 'string' && id !== 'null');
                    } else {
                        this.logger.log('Parsed as single JSON value:', parsed);
                        roleIds = [parsed];
                    }
                } catch (e) {
                    this.logger.log('Not JSON, trying comma-separated or single ID');
                    // Not JSON, try comma-separated or single ID
                    if (participant.role_id.includes(',')) {
                        roleIds = participant.role_id.split(',').map(id => id.trim()).filter(id => id.length > 0 && id !== 'null');
                    } else {
                        roleIds = [participant.role_id.trim()];
                    }
                }
            } else if (participant.role_id) {
                this.logger.log('Processing as single UUID');
                // Single UUID
                roleIds = [participant.role_id];
            }
            
            // Filter out null values and empty strings
            roleIds = roleIds.filter(id => id && id !== 'null' && id.length > 0);
            
            this.logger.log('Processed roleIds:', roleIds);
            
            // Get role details for all role IDs
            const roles = [];
            for (const roleId of roleIds) {
                try {
                    // Try regular client first, fall back to service client for roles table
                    let role = null;
                    let roleError = null;
                    
                    // Use the from() method which will inject JWT headers automatically
                    const { data: roleData1, error: error1 } = await this.from('roles')
                        .select('id, name, description, permissions')
                        .eq('id', roleId)
                        .single();
                    
                    if (!error1) {
                        role = roleData1;
                    } else if (this.serviceClient) {
                        const { data: roleData2, error: error2 } = await this.serviceClient
                            .from('roles')
                            .select('id, name, description, permissions')
                            .eq('id', roleId)
                            .single();
                        
                        if (!error2) {
                            role = roleData2;
                        } else {
                            roleError = error2;
                        }
                    } else {
                        roleError = error1;
                    }
                    
                    if (roleError) {
                        this.logger.warn('Role not found:', roleId, roleError);
                        continue;
                    }
                    
                    if (role) {
                        roles.push(role);
                    }
                } catch (err) {
                    this.logger.warn('Error fetching role:', roleId, err);
                }
            }
            
            return roles;
        } catch (error) {
            this.logger.error('Get participant roles error:', error);
            return [];
        }
    }
    
    /**
     * Add a role to a participant (internal method without audit)
     */
    async _addParticipantRoleInternal(participantId, roleId) {
        try {
            // Try junction table approach first
            const { data, error } = await this.client
                .from('participant_roles')
                .insert({
                    participant_id: participantId,
                    role_id: roleId
                })
                .select();
            
            if (!error) return data;
            
            // If junction table doesn't exist, handle array-based role_id column
            const participant = await this.getById('participants', participantId);
            if (participant) {
                if (Array.isArray(participant.role_id)) {
                    // Add to existing array if not already present
                    if (!participant.role_id.includes(roleId)) {
                        const updatedRoles = [...participant.role_id, roleId];
                        return await this.update('participants', participantId, { role_id: updatedRoles });
                    }
                    return participant; // Role already exists
                } else {
                    // Try as array format
                    try {
                        return await this.update('participants', participantId, { role_id: [roleId] });
                    } catch (arrayError) {
                        // Fallback to single value
                        return await this.update('participants', participantId, { role_id: roleId });
                    }
                }
            }
        } catch (error) {
            this.logger.error('Add participant role error:', error);
            throw error;
        }
    }
    
    /**
     * Remove a role from a participant (internal method without audit)
     */
    async _removeParticipantRoleInternal(participantId, roleId) {
        try {
            // Try junction table approach first
            const { error } = await this.client
                .from('participant_roles')
                .delete()
                .eq('participant_id', participantId)
                .eq('role_id', roleId);
            
            if (!error) return;
            
            // If junction table doesn't exist, handle array-based role_id column
            const participant = await this.getById('participants', participantId);
            if (participant && participant.role_id) {
                // Check if role_id is an array
                if (Array.isArray(participant.role_id)) {
                    const updatedRoles = participant.role_id.filter(id => id !== roleId);
                    return await this.update('participants', participantId, { role_id: updatedRoles });
                } else if (participant.role_id === roleId) {
                    // Single role_id column
                    return await this.update('participants', participantId, { role_id: null });
                }
            }
        } catch (error) {
            this.logger.error('Remove participant role error:', error);
            throw error;
        }
    }
    
    /**
     * Set all roles for a participant (replaces existing roles) - internal method without audit
     */
    async _setParticipantRolesInternal(participantId, roleIds) {
        try {
            // Input validation
            if (!Array.isArray(roleIds)) {
                throw new Error('roleIds must be an array');
            }
            
            // Try junction table approach first
            const { error: deleteError } = await this.client
                .from('participant_roles')
                .delete()
                .eq('participant_id', participantId);
            
            if (!deleteError) {
                // Insert new roles
                if (roleIds.length > 0) {
                    const { data, error: insertError } = await this.client
                        .from('participant_roles')
                        .insert(
                            roleIds.map(roleId => ({
                                participant_id: participantId,
                                role_id: roleId
                            }))
                        );
                    
                    if (insertError) throw insertError;
                    return data;
                }
                return [];
            }
            
            // Fallback to direct participants table update
            try {
                // Try as array first (PostgreSQL array format)
                return await this.update('participants', participantId, { role_id: roleIds });
            } catch (arrayError) {
                // If array fails, try single role approach
                const newRoleId = roleIds.length > 0 ? roleIds[0] : null;
                return await this.update('participants', participantId, { role_id: newRoleId });
            }
        } catch (error) {
            this.logger.error('Set participant roles error:', error);
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
            this.logger.error('Bulk assign roles error:', error);
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
            
            // Try to get additional roles from junction table
            let participantRolesMap = new Map();
            try {
                let junctionQuery = this.client
                    .from('participant_roles')
                    .select('participant_id, role_id');
                
                if (projectId) {
                    // Filter by participants in this project
                    const participantIds = participants.map(p => p.id);
                    junctionQuery = junctionQuery.in('participant_id', participantIds);
                }
                
                const { data: junctionData } = await junctionQuery;
                
                if (junctionData) {
                    // Group junction roles by participant
                    junctionData.forEach(item => {
                        if (!participantRolesMap.has(item.participant_id)) {
                            participantRolesMap.set(item.participant_id, []);
                        }
                        const role = rolesMap.get(item.role_id);
                        if (role) {
                            participantRolesMap.get(item.participant_id).push(role);
                        }
                    });
                }
            } catch (junctionError) {
                this.logger.log('Junction table not available, using single role approach:', junctionError.message);
            }
            
            // Enhance participants with all their roles
            return participants.map(participant => {
                const junctionRoles = participantRolesMap.get(participant.id) || [];
                const allRoles = [];
                
                // Debug logging for role data format
                if (participant.role_id && participant.id) {
                    this.logger.log(`Participant ${participant.name} (${participant.id}) role_id:`, {
                        role_id: participant.role_id,
                        isArray: Array.isArray(participant.role_id),
                        type: typeof participant.role_id
                    });
                }
                
                // Add roles from participants table (handle both single role and array)
                if (participant.role_id) {
                    if (Array.isArray(participant.role_id)) {
                        // Handle array of role IDs
                        participant.role_id.forEach(roleId => {
                            const role = rolesMap.get(roleId);
                            if (role) {
                                allRoles.push(role);
                            }
                        });
                    } else {
                        // Handle single role ID
                        const singleRole = rolesMap.get(participant.role_id);
                        if (singleRole) {
                            allRoles.push(singleRole);
                        }
                    }
                }
                
                // Add junction table roles (avoiding duplicates)
                junctionRoles.forEach(role => {
                    if (!allRoles.find(r => r.id === role.id)) {
                        allRoles.push(role);
                    }
                });
                
                return {
                    ...participant,
                    participant_roles: allRoles,
                    role_names: allRoles.length > 0 ? allRoles.map(r => r.name).join(', ') : 'No roles assigned'
                };
            });
            
        } catch (error) {
            this.logger.error('Get participants with roles error:', error);
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
            this.logger.error(`Create marker category error:`, error);
            throw error;
        }
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
        this.logger.warn('Failed to parse stored config:', error);
        return null;
    }
}

function storeConfig(config) {
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        return true;
    } catch (error) {
        this.logger.error('Failed to store config:', error);
        return false;
    }
}

function clearStoredConfig() {
    try {
        localStorage.removeItem(CONFIG_KEY);
        return true;
    } catch (error) {
        this.logger.error('Failed to clear config:', error);
        return false;
    }
}

// Auto-initialize if config exists
async function initializeFromStoredConfig() {
    const config = getStoredConfig();
    if (config && config.supabaseUrl && config.supabaseAnonKey) {
        try {
            // Import the default config to get the service role key
            const { config: defaultConfig } = await import('./config.js');
            const serviceRoleKey = defaultConfig.supabase.serviceRoleKey;
            
            // For participant frontend, always initialize in participant mode
            const isParticipantMode = window.location.pathname.includes('participants_frontend') || 
                                    window.location.pathname.includes('login.html') ||
                                    window.location.pathname.includes('map.html');
            
            console.log('Auto-initializing with participant mode:', isParticipantMode);
            
            await supabaseClient.initialize(
                config.supabaseUrl, 
                config.supabaseAnonKey, 
                isParticipantMode ? null : serviceRoleKey, // No service role for participants
                isParticipantMode // Participant mode
            );
            return true;
        } catch (error) {
            console.error('Auto-initialization failed:', error);
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