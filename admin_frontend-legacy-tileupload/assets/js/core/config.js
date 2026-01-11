/**
 * Application Configuration
 * Central configuration for the PunktStudio Admin-Interface application
 */

export const config = {
    // Supabase Configuration
    supabase: {
        url: 'http://192.168.1.91:8000',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
    },

    // Application Settings
    app: {
        name: 'PunktStudio Admin-Interface',
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
