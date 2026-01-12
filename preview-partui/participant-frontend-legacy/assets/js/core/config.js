/**
 * Application Configuration
 * Central configuration for the Map Survey Admin application
 */

export const config = {
    // Supabase Configuration  
    supabase: {
        url: 'http://192.168.1.91:8000',
        // Standard local Supabase demo keys - replace with your actual keys if different
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MVw2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE',
        // Service role key for participant operations (development only)
        serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKICA.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'
    },

    // Participant App Configuration (anonymous access)
    participant: {
        supabase: {
            url: 'http://192.168.1.91:8000',
            // Use anonymous key for participants - no service role!
            key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
        },
        app: {
            name: 'Participants App',
            version: '1.0.0',
            environment: 'development'
        }
    },

    // Admin Application Settings
    app: {
        name: 'Map Survey Admin',
        version: '1.0.0',
        environment: 'development'
    },

    // UI Settings
    ui: {
        theme: 'light',
        sidebarWidth: '280px',
        defaultPageSize: 25,
        notificationDuration: 5000
    },

    // Feature Flags
    features: {
        workflowBuilder: false, // Coming soon
        realTimeUpdates: true,
        fileUpload: true,
        mapIntegration: true
    }
};

export default config;