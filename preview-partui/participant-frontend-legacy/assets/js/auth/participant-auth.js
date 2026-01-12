/**
 * Participant Authentication System
 * Handles participant token-based authentication and QR code login for the participant app
 * Integrates with Supabase backend and participant-role system
 */

import { supabaseClient } from '../core/supabase.js';
import { jwtManager, validateJWTStructure, getParticipantFromJWT } from './jwt-utils.js';
import DebugLogger from '../core/debug-logger.js';

class ParticipantAuth {
    constructor() {
        this.currentParticipant = null;
        this.currentProject = null;
        this.participantRoles = [];
        this.authListeners = [];
        this.sessionKey = 'participant_session';
        this.tokenKey = 'participant_token';
        this.participantToken = null; // Store original token for refresh
        this.logger = new DebugLogger('ParticipantAuth');
    }
    
    /**
     * Initialize the authentication system
     */
    async initialize() {
        try {
            // Check for existing session
            await this.checkExistingSession();
            
            // Setup automatic session refresh
            this.setupSessionRefresh();
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize participant auth:', error);
            return false;
        }
    }
    
    /**
     * Check for existing participant session
     */
    async checkExistingSession() {
        try {
            this.logger.log('Starting session check...');
            
            // First check if we have a valid JWT
            if (jwtManager.isValid()) {
                this.logger.log('Valid JWT found, reconstructing session...');
                
                const participantData = jwtManager.getParticipantData();
                this.logger.log('JWT participant data:', participantData);
                
                if (participantData) {
                    // IMPORTANT: Configure Supabase client with JWT FIRST before any database queries
                    const currentJWT = jwtManager.getJWT();
                    if (currentJWT) {
                        this.logger.log('Configuring Supabase client with JWT before database queries...');
                        await supabaseClient.setParticipantJWT(currentJWT);
                    }
                    
                    // Now load full participant data from database using JWT participant ID
                    try {
                        const { data: fullParticipantData, error } = await supabaseClient
                            .from('participants')
                            .select('*, projects(*)')
                            .eq('id', participantData.id)
                            .limit(1);
                        
                        this.logger.log('Database query result:', { data: fullParticipantData, error });
                        
                        if (!error && fullParticipantData && fullParticipantData.length > 0) {
                            // Use full participant data from database
                            await this.setCurrentParticipant(fullParticipantData[0]);
                            this.logger.log('Full participant data loaded from database');
                        } else {
                            this.logger.warn('Database query failed:', error);
                            // Fallback: reconstruct participant from JWT only
                            const fallbackParticipant = {
                                id: participantData.id,
                                project_id: participantData.project_id,
                                role_id: participantData.role_ids  // Map role_ids from JWT to role_id for database compatibility
                            };
                            await this.setCurrentParticipant(fallbackParticipant);
                            this.logger.warn('Could not load full participant data, using JWT fallback data');
                        }
                    } catch (dbError) {
                        this.logger.warn('Database error loading participant data:', dbError);
                        // Fallback: reconstruct participant from JWT only
                        const fallbackParticipant = {
                            id: participantData.id,
                            project_id: participantData.project_id,
                            role_id: participantData.role_ids  // Map role_ids from JWT to role_id for database compatibility
                        };
                        await this.setCurrentParticipant(fallbackParticipant);
                        this.logger.warn('Could not load participant data from database, using JWT fallback data');
                    }
                    
                    this.logger.log('Participant and project set:', {
                        participant: this.currentParticipant,
                        project: this.currentProject
                    });
                    
                    // Get stored token for future refresh
                    const sessionData = this.getStoredSession();
                    if (sessionData && sessionData.token) {
                        this.participantToken = sessionData.token;
                        
                        // Setup auto-refresh
                        jwtManager.setupAutoRefresh(this.participantToken);
                    }
                    
                    this.logger.log('Session restored from JWT successfully');
                    return true;
                } else {
                    this.logger.warn('JWT is valid but no participant data found');
                }
            } else {
                this.logger.log('No valid JWT found');
            }
            
            // If no valid JWT, try to restore from stored session and re-authenticate
            const sessionData = this.getStoredSession();
            this.logger.log('Checking stored session data:', !!sessionData);
            
            if (sessionData && sessionData.token) {
                this.logger.log('No valid JWT, attempting fresh authentication with stored token...');
                const authResult = await this.authenticateWithToken(sessionData.token);
                this.logger.log('Fresh authentication result:', authResult.success);
                return authResult.success;
            }
            
            this.logger.log('No valid session data found');
            return false;
        } catch (error) {
            this.logger.error('Error checking existing session:', error);
            this.clearSession();
            return false;
        }
    }
    
    /**
     * Authenticate participant with token
     * @param {string} token - Participant token
     * @returns {Object} Authentication result
     */
    async authenticateWithToken(token) {
        try {
            this.logger.log('Starting participant authentication...');
            
            if (!token || typeof token !== 'string') {
                throw new Error('Valid token is required');
            }
            
            // Clean and validate token format
            const cleanToken = token.trim();
            if (cleanToken.length === 0) {
                throw new Error('Token cannot be empty');
            }
            
            this.logger.log('Token validation passed, starting JWT exchange...');
            
            // Exchange token for JWT via Edge Function
            const jwtResult = await this.exchangeTokenForJWT(cleanToken);
            this.logger.log('JWT exchange result:', jwtResult);
            
            if (!jwtResult.success) {
                this.logger.error('JWT exchange failed:', jwtResult.error);
                throw new Error(jwtResult.error || 'Failed to authenticate token');
            }
            
            const { jwt, participant, expires_at } = jwtResult;
            this.logger.log('JWT exchange successful, setting up participant...');
            
            // Store the JWT using our JWT manager
            if (!jwtManager.setJWT(jwt, true)) {
                throw new Error('Failed to store JWT token');
            }
            
            // Configure Supabase client with JWT
            await supabaseClient.setParticipantJWT(jwt);
            
            // Store the original token for refresh
            this.participantToken = cleanToken;
            
            // Set current participant and create session
            await this.setCurrentParticipant(participant);
            this.logger.log('Participant set, storing session...');
            
            // Create session with token for refresh
            this.storeSession({
                token: cleanToken,
                participantId: participant.id,
                projectId: participant.project_id,
                projectData: participant.projects, // Store project data for session restoration
                loginTime: Date.now(),
                jwtExpiry: expires_at
            });
            
            // Setup automatic JWT refresh
            jwtManager.setupAutoRefresh(cleanToken);
            
            this.logger.log('Session stored successfully');
            
            // Dispatch global authentication event for SPA
            window.dispatchEvent(new CustomEvent('authStateChanged', {
                detail: {
                    isAuthenticated: true,
                    participant: participant,
                    currentRole: this.getCurrentRole(),
                    project: this.currentProject
                }
            }));
            
            // Notify legacy listeners for backward compatibility
            this.notifyAuthListeners('login', participant);
            
            this.logger.log('Authentication completed successfully!');
            
            return {
                success: true,
                participant: participant,
                project: this.currentProject,
                roles: this.participantRoles
            };
            
        } catch (error) {
            this.logger.error('Token authentication failed:', error);
            this.logger.error('Authentication error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Authenticate with QR code (UUID)
     * @param {string} uuid - QR code UUID
     * @returns {Object} Authentication result
     */
    async authenticateWithQR(uuid) {
        try {
            if (!uuid || typeof uuid !== 'string') {
                throw new Error('Valid QR code is required');
            }
            
            // QR codes in this system are the same as tokens
            // The QR code contains the participant token
            return await this.authenticateWithToken(uuid);
            
        } catch (error) {
            this.logger.error('QR authentication failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Exchange participant token for JWT via Edge Function
     * @param {string} token - Participant token
     * @returns {Object} JWT exchange result
     */
    async exchangeTokenForJWT(token) {
        try {
            this.logger.log('Starting JWT exchange for token:', token.substring(0, 8) + '...');
            
            // Import config to get Supabase URL
            const { config } = await import('../core/config.js');
            const edgeFunctionUrl = `${config.supabase.url}/functions/v1/token-to-jwt`;
            
            this.logger.log('Edge Function URL:', edgeFunctionUrl);
            this.logger.log('Using anon key length:', config.supabase.anonKey?.length);
            
            const requestBody = { token };
            this.logger.log('Request body:', requestBody);
            
            // Add timeout wrapper for fetch
            const fetchWithTimeout = async (url, options, timeoutMs = 10000) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                
                try {
                    this.logger.log('Making fetch request to:', url);
                    this.logger.log('Request options:', options);
                    
                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    this.logger.log('Fetch completed successfully');
                    return response;
                } catch (error) {
                    clearTimeout(timeoutId);
                    this.logger.log('Fetch error:', error);
                    this.logger.log('Error type:', error.constructor.name);
                    this.logger.log('Error message:', error.message);
                    
                    if (error.name === 'AbortError') {
                        throw new Error(`Request timed out after ${timeoutMs}ms`);
                    }
                    throw error;
                }
            };

            const response = await fetchWithTimeout(edgeFunctionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.supabase.anonKey}`
                },
                body: JSON.stringify(requestBody)
            }, 10000);
            
            this.logger.log('Response status:', response.status, response.statusText);
            this.logger.log('Response headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error('Edge Function error response:', errorText);
                
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { error: errorText };
                }
                
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.logger.log('JWT exchange successful:', {
                hasJWT: !!data.jwt,
                participant: data.participant,
                expiresAt: data.expires_at
            });
            
            return {
                success: true,
                jwt: data.jwt,
                participant: data.participant,
                expires_at: data.expires_at
            };
            
        } catch (error) {
            this.logger.error('JWT exchange failed:', error);
            this.logger.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    
    
    /**
     * Set current participant and load associated data
     * @param {Object} participant - Participant data from database
     */
    async setCurrentParticipant(participant) {
        try {
            this.currentParticipant = participant;
            
            // Set project data - handle both formats
            if (participant.projects) {
                // From database query with joined projects table
                this.currentProject = participant.projects;
            } else if (participant.project_id) {
                // From JWT - we have project_id but need to fetch project details
                this.currentProject = { id: participant.project_id };
                
                // Try to load full project data
                try {
                    const { data: projectData, error } = await supabaseClient
                        .from('projects')
                        .select('*')
                        .eq('id', participant.project_id)
                        .limit(1);
                    
                    if (!error && projectData && projectData.length > 0) {
                        this.currentProject = projectData[0];
                        this.logger.log('Project data loaded:', projectData[0].name);
                    }
                } catch (projectError) {
                    this.logger.warn('Could not load full project data:', projectError);
                }
            }
            
            // Load participant roles - handle if some roles don't exist
            try {
                this.participantRoles = await this.loadParticipantRoles(participant.id);
                this.logger.log('Loaded roles:', this.participantRoles.length);
                
                // If no roles loaded but we have role_id in JWT data, use JWT fallback
                if (this.participantRoles.length === 0 && participant.role_id && Array.isArray(participant.role_id)) {
                    this.participantRoles = participant.role_id.map(roleId => ({
                        id: roleId,
                        name: `Role ${roleId.substring(0, 8)}`, // Basic fallback name
                        description: 'Role from JWT data'
                    }));
                    this.logger.log('No roles from database, using JWT role fallback data:', this.participantRoles.length, 'roles');
                }
            } catch (roleError) {
                this.logger.warn('Could not load all participant roles:', roleError);
                // If we have role_id in the participant data (from JWT), create basic role objects
                if (participant.role_id && Array.isArray(participant.role_id)) {
                    this.participantRoles = participant.role_id.map(roleId => ({
                        id: roleId,
                        name: `Role ${roleId.substring(0, 8)}`, // Basic fallback name
                        description: 'Role from JWT data'
                    }));
                    this.logger.log('Using JWT role fallback data after error:', this.participantRoles.length, 'roles');
                } else {
                    this.participantRoles = [];
                }
            }
            
        } catch (error) {
            this.logger.error('Error setting current participant:', error);
            throw error;
        }
    }
    
    /**
     * Load roles directly using role IDs (from JWT)
     * @param {string|Array} roleIds - Role ID or array of role IDs
     * @returns {Array} Array of role objects
     */
    async loadRolesDirectly(roleIds) {
        try {
            // Normalize role IDs to array
            let roleIdArray = [];
            
            if (Array.isArray(roleIds)) {
                roleIdArray = roleIds;
            } else if (typeof roleIds === 'string') {
                try {
                    const parsed = JSON.parse(roleIds);
                    roleIdArray = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    roleIdArray = [roleIds];
                }
            } else {
                roleIdArray = [roleIds];
            }
            
            this.logger.log('Loading roles directly for IDs:', roleIdArray);
            
            // Load roles directly from roles table using JWT
            const roles = [];
            for (const roleId of roleIdArray) {
                try {
                    const { data: roleData, error } = await supabaseClient.from('roles')
                        .select('id, name, description, permissions')
                        .eq('id', roleId)
                        .limit(1);
                    
                    if (!error && roleData && roleData.length > 0) {
                        roles.push(roleData[0]);
                        this.logger.log('Loaded role:', roleData[0].name);
                    } else {
                        this.logger.warn('Failed to load role:', roleId, error?.message || 'No role found');
                    }
                } catch (roleError) {
                    this.logger.warn('Error loading role:', roleId, roleError);
                }
            }
            
            return roles;
            
        } catch (error) {
            this.logger.error('Error loading roles directly:', error);
            return [];
        }
    }
    
    /**
     * Load roles for a participant
     * @param {string} participantId - Participant ID
     * @returns {Array} Array of role objects
     */
    async loadParticipantRoles(participantId) {
        try {
            // Use the Supabase client's participant role method
            const roles = await supabaseClient.getParticipantRoles(participantId);
            return roles || [];
            
        } catch (error) {
            this.logger.error('Error loading participant roles:', error);
            return [];
        }
    }
    
    /**
     * Logout participant and clear session
     */
    async logout() {
        try {
            const participant = this.currentParticipant;
            
            // Stop auto-refresh
            jwtManager.stopAutoRefresh();
            
            // Clear JWT
            jwtManager.clearJWT();
            
            // Clear Supabase JWT
            await supabaseClient.clearParticipantJWT();
            
            // Clear current state
            this.currentParticipant = null;
            this.currentProject = null;
            this.participantRoles = [];
            this.participantToken = null;
            
            // Clear stored session
            this.clearSession();
            
            // Notify listeners
            this.notifyAuthListeners('logout', participant);
            
            return true;
            
        } catch (error) {
            this.logger.error('Error during logout:', error);
            return false;
        }
    }
    
    /**
     * Check if participant is authenticated
     * @returns {boolean} Whether participant is authenticated
     */
    isAuthenticated() {
        const hasValidJWT = jwtManager.isValid();
        const hasParticipant = !!this.currentParticipant;
        const hasProject = !!this.currentProject;
        
        this.logger.log('isAuthenticated check:', {
            hasValidJWT,
            hasParticipant,
            hasProject,
            participantId: this.currentParticipant?.id,
            projectId: this.currentProject?.id,
            result: hasValidJWT && hasParticipant && hasProject
        });
        
        // Must have valid JWT and participant data
        return hasValidJWT && hasParticipant && hasProject;
    }
    
    /**
     * Get current participant
     * @returns {Object|null} Current participant data
     */
    getCurrentParticipant() {
        return this.currentParticipant;
    }
    
    /**
     * Get current project
     * @returns {Object|null} Current project data
     */
    getCurrentProject() {
        return this.currentProject;
    }
    
    /**
     * Get participant roles
     * @returns {Array} Array of role objects
     */
    getParticipantRoles() {
        return this.participantRoles || [];
    }
    
    /**
     * Get current role (first role if multiple)
     * @returns {Object|null} Current role object
     */
    getCurrentRole() {
        const roles = this.getParticipantRoles();
        return roles.length > 0 ? roles[0] : null;
    }
    
    /**
     * Check if participant has a specific role (UI DISPLAY ONLY - NOT FOR SECURITY)
     * Security is handled by RLS policies at database level
     * @param {string} roleName - Name of the role to check
     * @returns {boolean} Whether participant has the role
     */
    hasRole(roleName) {
        if (!roleName || !this.participantRoles) return false;
        
        return this.participantRoles.some(role => 
            role.name && role.name.toLowerCase() === roleName.toLowerCase()
        );
    }
    
    /**
     * Check if participant has any of the specified roles (UI DISPLAY ONLY - NOT FOR SECURITY)
     * Security is handled by RLS policies at database level
     * @param {Array} roleNames - Array of role names to check
     * @returns {boolean} Whether participant has any of the roles
     */
    hasAnyRole(roleNames) {
        if (!Array.isArray(roleNames) || !this.participantRoles) return false;
        
        return roleNames.some(roleName => this.hasRole(roleName));
    }
    
    /**
     * Get role names as a comma-separated string
     * @returns {string} Role names joined by commas
     */
    getRoleNames() {
        if (!this.participantRoles || this.participantRoles.length === 0) {
            return 'No roles assigned';
        }
        
        return this.participantRoles.map(role => role.name).join(', ');
    }
    
    /**
     * Session Management
     */
    
    /**
     * Store session data in localStorage
     * @param {Object} sessionData - Session data to store
     */
    storeSession(sessionData) {
        try {
            const sessionInfo = {
                ...sessionData,
                timestamp: Date.now()
            };
            
            localStorage.setItem(this.sessionKey, JSON.stringify(sessionInfo));
            
            // Also store just the token for quick access
            localStorage.setItem(this.tokenKey, sessionData.token);
            
        } catch (error) {
            this.logger.error('Error storing session:', error);
        }
    }
    
    /**
     * Get stored session data
     * @returns {Object|null} Stored session data or null
     */
    getStoredSession() {
        try {
            const sessionData = localStorage.getItem(this.sessionKey);
            return sessionData ? JSON.parse(sessionData) : null;
        } catch (error) {
            this.logger.error('Error reading stored session:', error);
            return null;
        }
    }
    
    /**
     * Clear stored session
     */
    clearSession() {
        try {
            localStorage.removeItem(this.sessionKey);
            localStorage.removeItem(this.tokenKey);
        } catch (error) {
            this.logger.error('Error clearing session:', error);
        }
    }
    
    /**
     * Setup automatic session refresh
     */
    setupSessionRefresh() {
        // JWT auto-refresh is now handled by jwtManager.setupAutoRefresh()
        // This method is kept for compatibility but delegates to JWT manager
        if (this.participantToken) {
            jwtManager.setupAutoRefresh(this.participantToken);
        }
    }
    
    /**
     * Authentication Event Listeners
     */
    
    /**
     * Add authentication state change listener
     * @param {Function} callback - Callback function to call on auth state change
     * @returns {Function} Unsubscribe function
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
     * Notify auth listeners of state changes
     * @param {string} event - Event type ('login', 'logout', 'error')
     * @param {Object} data - Event data
     */
    notifyAuthListeners(event, data) {
        // Dispatch global event for SPA
        if (event === 'logout') {
            window.dispatchEvent(new CustomEvent('authStateChanged', {
                detail: {
                    isAuthenticated: false,
                    participant: null,
                    currentRole: null,
                    project: null
                }
            }));
        }
        
        // Call legacy listeners
        this.authListeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                this.logger.error('Auth listener error:', error);
            }
        });
    }
    
    /**
     * Utility Methods
     */
    
    /**
     * Get redirect URL after successful authentication
     * @returns {string} URL to redirect to
     */
    getRedirectUrl() {
        // For MPA, redirect to map page
        return 'map.html';
    }
    
    /**
     * Generate QR code data for sharing
     * @returns {string|null} QR code data or null if not authenticated
     */
    getQRCodeData() {
        if (!this.isAuthenticated() || !this.currentParticipant) {
            return null;
        }
        
        return this.currentParticipant.token;
    }
    
    /**
     * Get participant display name
     * @returns {string} Display name for the participant
     */
    getDisplayName() {
        if (!this.currentParticipant) return 'Anonymous';
        
        return this.currentParticipant.name || 
               this.currentParticipant.email || 
               `Participant ${this.currentParticipant.id}`;
    }
    
    /**
     * Debug and monitoring methods
     */
    
    /**
     * Get authentication status for debugging
     * @returns {Object} Authentication status information
     */
    getAuthStatus() {
        const jwtData = jwtManager.getParticipantData();
        return {
            isAuthenticated: this.isAuthenticated(),
            hasValidJWT: jwtManager.isValid(),
            jwtNeedsRefresh: jwtManager.needsRefresh(),
            participant: this.currentParticipant ? {
                id: this.currentParticipant.id,
                name: this.currentParticipant.name,
                email: this.currentParticipant.email,
                isActive: this.currentParticipant.is_active,
                expiresAt: this.currentParticipant.expires_at
            } : null,
            project: this.currentProject ? {
                id: this.currentProject.id,
                name: this.currentProject.name,
                isActive: this.currentProject.is_active
            } : null,
            roles: this.participantRoles.map(role => ({
                id: role.id,
                name: role.name
            })),
            sessionExists: !!this.getStoredSession(),
            jwtExpiry: jwtData ? new Date(jwtData.exp * 1000).toISOString() : null
        };
    }
}

// Create singleton instance
const participantAuth = new ParticipantAuth();

// Export as ES6 module
export default participantAuth;

// Also make available globally for non-module usage
if (typeof window !== 'undefined') {
    window.ParticipantAuth = participantAuth;
}