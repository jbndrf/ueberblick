/**
 * JWT Utilities
 * Helper functions for JWT token validation, decoding, and management
 */

import DebugLogger from '../core/debug-logger.js';

/**
 * Decode JWT payload without verification (for reading claims)
 * @param {string} token - JWT token to decode
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function decodeJWT(token) {
    if (!token || typeof token !== 'string') {
        return null;
    }
    
    try {
        // JWT has 3 parts separated by dots: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }
        
        // Decode the payload (middle part)
        const payload = parts[1];
        
        // Add padding if needed for base64 decoding
        const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
        
        // Decode base64
        const decodedPayload = atob(paddedPayload);
        
        // Parse JSON
        return JSON.parse(decodedPayload);
    } catch (error) {
        const logger = new DebugLogger('decodeJWT');
        logger.warn('Failed to decode JWT:', error);
        return null;
    }
}

/**
 * Check if JWT token is expired
 * @param {string} token - JWT token to check
 * @returns {boolean} True if expired, false if valid
 */
export function isJWTExpired(token) {
    const payload = decodeJWT(token);
    if (!payload || !payload.exp) {
        return true; // Treat invalid tokens as expired
    }
    
    // JWT exp is in seconds, Date.now() is in milliseconds
    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now();
    
    // Add 30 second buffer to account for clock skew
    const bufferTime = 30 * 1000;
    
    return currentTime >= (expirationTime - bufferTime);
}

/**
 * Get token expiration time as Date object
 * @param {string} token - JWT token
 * @returns {Date|null} Expiration date or null if invalid
 */
export function getJWTExpiration(token) {
    const payload = decodeJWT(token);
    if (!payload || !payload.exp) {
        return null;
    }
    
    return new Date(payload.exp * 1000);
}

/**
 * Get time until token expires in milliseconds
 * @param {string} token - JWT token
 * @returns {number} Milliseconds until expiration, or 0 if expired/invalid
 */
export function getTimeUntilExpiry(token) {
    const payload = decodeJWT(token);
    if (!payload || !payload.exp) {
        return 0;
    }
    
    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now();
    const timeLeft = expirationTime - currentTime;
    
    return Math.max(0, timeLeft);
}

/**
 * Extract participant data from JWT payload
 * @param {string} token - JWT token
 * @returns {Object|null} Participant data or null if invalid
 */
export function getParticipantFromJWT(token) {
    const payload = decodeJWT(token);
    if (!payload) {
        return null;
    }
    
    return {
        id: payload.participant_id,
        project_id: payload.project_id,
        role_ids: payload.role_ids,
        iat: payload.iat,
        exp: payload.exp,
        iss: payload.iss,
        aud: payload.aud
    };
}

/**
 * Validate JWT structure and basic claims
 * @param {string} token - JWT token to validate
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validateJWTStructure(token) {
    const result = {
        isValid: false,
        errors: []
    };
    
    if (!token || typeof token !== 'string') {
        result.errors.push('Token is required and must be a string');
        return result;
    }
    
    // Check basic JWT structure
    const parts = token.split('.');
    if (parts.length !== 3) {
        result.errors.push('Invalid JWT structure - must have 3 parts');
        return result;
    }
    
    // Try to decode payload
    const payload = decodeJWT(token);
    if (!payload) {
        result.errors.push('Invalid JWT payload - cannot decode');
        return result;
    }
    
    // Check required claims for participant JWT
    const requiredClaims = ['participant_id', 'project_id', 'role_ids', 'iat', 'exp'];
    for (const claim of requiredClaims) {
        if (!payload[claim]) {
            result.errors.push(`Missing required claim: ${claim}`);
        }
    }
    
    // Check if token is expired
    if (isJWTExpired(token)) {
        result.errors.push('Token is expired');
    }
    
    // Check issuer if present (should be Supabase URL)
    if (payload.iss && !payload.iss.includes('supabase') && !payload.iss.includes('kong')) {
        result.errors.push('Invalid issuer');
    }
    
    // Check audience if present
    if (payload.aud && payload.aud !== 'authenticated') {
        result.errors.push('Invalid audience');
    }
    
    result.isValid = result.errors.length === 0;
    return result;
}

/**
 * JWT Token Manager Class
 * Manages JWT storage, validation, and refresh
 */
export class JWTManager {
    constructor() {
        this.currentJWT = null;
        this.refreshPromise = null;
        this.storageKey = 'participant_jwt';
        this.refreshThreshold = 5 * 60 * 1000; // Refresh when 5 minutes or less remain
        this.logger = new DebugLogger('JWTManager');
    }
    
    /**
     * Set current JWT token
     * @param {string} token - JWT token
     * @param {boolean} persist - Whether to persist to localStorage
     */
    setJWT(token, persist = true) {
        if (!token) {
            this.clearJWT();
            return;
        }
        
        const validation = validateJWTStructure(token);
        if (!validation.isValid) {
            const logger = new DebugLogger('JWTManager');
        logger.warn('Invalid JWT token provided:', validation.errors);
            return false;
        }
        
        this.currentJWT = token;
        
        if (persist) {
            try {
                localStorage.setItem(this.storageKey, token);
            } catch (error) {
                const logger = new DebugLogger('JWTManager');
                logger.warn('Failed to persist JWT to localStorage:', error);
            }
        }
        
        return true;
    }
    
    /**
     * Get current JWT token
     * @returns {string|null} Current JWT token or null
     */
    getJWT() {
        this.logger.log('getJWT: Checking for valid JWT...');
        
        if (this.currentJWT) {
            const isExpired = isJWTExpired(this.currentJWT);
            this.logger.log('Memory JWT check:', { hasJWT: true, isExpired });
            
            if (!isExpired) {
                return this.currentJWT;
            } else {
                this.logger.log('Memory JWT is expired, clearing it');
                this.currentJWT = null;
            }
        }
        
        // Try to load from localStorage if not in memory
        if (!this.currentJWT) {
            try {
                const storedToken = localStorage.getItem(this.storageKey);
                this.logger.log('Stored JWT check:', { hasStored: !!storedToken });
                
                if (storedToken) {
                    const isExpired = isJWTExpired(storedToken);
                    this.logger.log('Stored JWT expiry check:', { isExpired });
                    
                    if (!isExpired) {
                        this.currentJWT = storedToken;
                        this.logger.log('Using stored JWT');
                        return this.currentJWT;
                    } else {
                        this.logger.log('Stored JWT is expired, removing it');
                        localStorage.removeItem(this.storageKey);
                    }
                }
            } catch (error) {
                this.logger.warn('Failed to load JWT from localStorage:', error);
            }
        }
        
        this.logger.log('No valid JWT found');
        return null;
    }
    
    /**
     * Clear current JWT token
     */
    clearJWT() {
        this.currentJWT = null;
        try {
            localStorage.removeItem(this.storageKey);
        } catch (error) {
            this.logger.warn('Failed to clear JWT from localStorage:', error);
        }
    }
    
    /**
     * Check if current token is valid and not expired
     * @returns {boolean} True if valid, false otherwise
     */
    isValid() {
        const token = this.getJWT();
        const isValid = token !== null;
        
        this.logger.log('JWT isValid check:', {
            hasToken: !!token,
            tokenLength: token?.length || 0,
            isValid,
            tokenPreview: token ? token.substring(0, 20) + '...' : 'none'
        });
        
        return isValid;
    }
    
    /**
     * Check if token needs refresh (close to expiry)
     * @returns {boolean} True if refresh is needed
     */
    needsRefresh() {
        const token = this.currentJWT || this.getJWT();
        if (!token) {
            return true;
        }
        
        const timeLeft = getTimeUntilExpiry(token);
        return timeLeft <= this.refreshThreshold;
    }
    
    /**
     * Get participant data from current JWT
     * @returns {Object|null} Participant data or null
     */
    getParticipantData() {
        const token = this.getJWT();
        return token ? getParticipantFromJWT(token) : null;
    }
    
    /**
     * Refresh JWT token using the edge function
     * @param {string} participantToken - Original participant token
     * @returns {Promise<boolean>} Success status
     */
    async refreshJWT(participantToken) {
        // Prevent multiple simultaneous refresh attempts
        if (this.refreshPromise) {
            return await this.refreshPromise;
        }
        
        this.refreshPromise = this._performRefresh(participantToken);
        
        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.refreshPromise = null;
        }
    }
    
    /**
     * Internal method to perform JWT refresh
     * @private
     */
    async _performRefresh(participantToken) {
        try {
            if (!participantToken) {
                this.logger.error('Cannot refresh JWT: no participant token provided');
                return false;
            }
            
            // Import config to get Supabase URL
            const { config } = await import('../core/config.js');
            const edgeFunctionUrl = `${config.participant.supabase.url}/functions/v1/token-to-jwt`;
            
            const response = await fetch(edgeFunctionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.participant.supabase.key}`
                },
                body: JSON.stringify({ token: participantToken })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error('JWT refresh failed:', errorText);
                return false;
            }
            
            const data = await response.json();
            
            if (data.jwt) {
                this.setJWT(data.jwt, true);
                
                // Update Supabase client with new JWT
                try {
                    const { supabaseClient } = await import('../core/supabase.js');
                    await supabaseClient.setParticipantJWT(data.jwt);
                } catch (error) {
                    this.logger.warn('Failed to update Supabase client with refreshed JWT:', error);
                }
                
                this.logger.log('JWT refreshed successfully');
                return true;
            } else {
                this.logger.error('JWT refresh response missing token');
                return false;
            }
            
        } catch (error) {
            this.logger.error('JWT refresh error:', error);
            return false;
        }
    }
    
    /**
     * Setup automatic token refresh
     * @param {string} participantToken - Original participant token for refresh
     */
    setupAutoRefresh(participantToken) {
        // Check for refresh need every minute
        const refreshInterval = setInterval(async () => {
            if (this.needsRefresh()) {
                this.logger.log('JWT near expiry, attempting refresh...');
                const success = await this.refreshJWT(participantToken);
                if (!success) {
                    this.logger.warn('JWT refresh failed, clearing token');
                    this.clearJWT();
                    clearInterval(refreshInterval);
                    
                    // Dispatch event for logout
                    window.dispatchEvent(new CustomEvent('authStateChanged', {
                        detail: {
                            isAuthenticated: false,
                            reason: 'jwt_refresh_failed'
                        }
                    }));
                }
            }
        }, 60000); // Check every minute
        
        // Store interval ID for cleanup
        this.refreshIntervalId = refreshInterval;
        
        return refreshInterval;
    }
    
    /**
     * Stop automatic refresh
     */
    stopAutoRefresh() {
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
            this.refreshIntervalId = null;
        }
    }
}

// Create singleton instance
const jwtManager = new JWTManager();

// Export utilities and manager
export {
    jwtManager
};

// Export as default for easy importing
export default {
    decodeJWT,
    isJWTExpired,
    getJWTExpiration,
    getTimeUntilExpiry,
    getParticipantFromJWT,
    validateJWTStructure,
    JWTManager,
    jwtManager
};