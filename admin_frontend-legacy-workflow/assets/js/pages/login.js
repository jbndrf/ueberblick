/**
 * Login Page Component
 * Handles user authentication with email/password
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n, i18nDOM } from '../core/i18n.js';

const logger = new DebugLogger('LoginPage');

export default function LoginPage() {
    // Initialize the page functionality after a short delay
    setTimeout(initializeLoginPage, 50);
    
    // Add i18n translation after rendering
    setTimeout(() => i18nDOM.translateDataAttributes(), 50);
    
    return `
        <div class="login-container" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%); z-index: 1000;">
            <div class="login-card" style="background: var(--color-bg-primary); padding: var(--spacing-3xl); border-radius: var(--border-radius-xl); box-shadow: var(--shadow-xl); width: 100%; max-width: 400px; margin: var(--spacing-lg);">
                
                <!-- Logo/Header -->
                <div style="text-align: center; margin-bottom: var(--spacing-2xl);">
                    <h1 style="color: var(--color-primary); margin-bottom: var(--spacing-xs);" data-i18n="login.title">PunktStudio<br>Admin-Interface</h1>
                </div>

                <!-- Login Form -->
                <form id="login-form" class="login-form">
                    
                    <!-- Email Field -->
                    <div class="form-group">
                        <label class="form-label" for="email" data-i18n="login.email">Email Address</label>
                        <input 
                            type="email" 
                            id="email" 
                            name="email"
                            class="form-input" 
                            data-i18n-placeholder="login.email"
                            required
                            autocomplete="email"
                            autofocus
                        >
                        <div class="form-error" id="email-error"></div>
                    </div>

                    <!-- Password Field -->
                    <div class="form-group">
                        <label class="form-label" for="password" data-i18n="login.password">Password</label>
                        <div style="position: relative;">
                            <input 
                                type="password" 
                                id="password" 
                                name="password"
                                class="form-input" 
                                data-i18n-placeholder="login.password"
                                required
                                autocomplete="current-password"
                                style="padding-right: 3rem;"
                            >
                            <button 
                                type="button" 
                                id="toggle-password"
                                style="position: absolute; right: var(--spacing-sm); top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--color-text-tertiary); cursor: pointer; padding: var(--spacing-xs);"
                                title="Show/hide password"
                            >
                                Show
                            </button>
                        </div>
                        <div class="form-error" id="password-error"></div>
                    </div>

                    <!-- Remember Me -->
                    <div class="form-group" style="margin-bottom: var(--spacing-xl);">
                        <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
                            <input type="checkbox" id="remember" name="remember" class="form-checkbox">
                            <span style="font-size: var(--font-size-sm); color: var(--color-text-secondary);">Keep me signed in</span>
                        </label>
                    </div>

                    <!-- Submit Button -->
                    <button 
                        type="submit" 
                        id="login-btn"
                        class="btn btn-primary"
                        style="width: 100%; padding: var(--spacing-md); font-size: var(--font-size-base);"
                    >
                        <span id="login-btn-text" data-i18n="login.sign_in">Sign In</span>
                        <div id="login-btn-spinner" class="loading-dots" style="display: none;"></div>
                    </button>

                    <!-- General Error Message -->
                    <div id="login-error" class="alert alert-error" style="display: none; margin-top: var(--spacing-md);">
                        <div id="login-error-message"></div>
                    </div>

                </form>


            

            </div>
        </div>
    `;
}

// Initialize login page functionality when content is loaded
// Note: Don't use DOMContentLoaded since this is loaded dynamically
function initializeLoginPage() {
    // Wait for page content to be loaded
    setTimeout(() => {
        const form = document.getElementById('login-form');
        if (!form) return; // Not on login page
        
        setupLoginForm();
        checkConnectionStatus();
    }, 100);
}

function setupLoginForm() {
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const loginBtn = document.getElementById('login-btn');
    const loginBtnText = document.getElementById('login-btn-text');
    const loginBtnSpinner = document.getElementById('login-btn-spinner');
    const loginError = document.getElementById('login-error');
    const loginErrorMessage = document.getElementById('login-error-message');

    if (!form) return;

    // Toggle password visibility
    if (togglePasswordBtn && passwordInput) {
        // Set initial text
        togglePasswordBtn.textContent = 'Show';
        
        Utils.DOM.on(togglePasswordBtn, 'click', (e) => {
            e.preventDefault();
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            togglePasswordBtn.textContent = isPassword ? 'Hide' : 'Show';
        });
    }

    // Form submission
    Utils.DOM.on(form, 'submit', async (e) => {
        e.preventDefault();
        
        // Clear previous errors
        clearErrors();
        
        // Get form data
        const formData = new FormData(form);
        const email = formData.get('email').trim();
        const password = formData.get('password');
        
        // Validate form
        const validation = validateLoginForm(email, password);
        if (!validation.isValid) {
            showValidationErrors(validation.errors);
            return;
        }
        
        // Show loading state
        setLoadingState(true);
        
        try {
            // Attempt login
            await supabaseClient.signIn(email, password);
            
            // Success! Navigation will be handled by auth state change
            logger.log('Login successful');
            
        } catch (error) {
            logger.error('Login error:', error);
            const errorMessage = error.message === 'Invalid login credentials' 
                ? i18n.t('login.invalid_credentials')
                : i18n.t('login.network_error');
            showLoginError(errorMessage);
        } finally {
            setLoadingState(false);
        }
    });

    // Real-time validation
    if (emailInput) {
        Utils.DOM.on(emailInput, 'blur', () => {
            const email = emailInput.value.trim();
            if (email && !Utils.Validation.isEmail(email)) {
                showFieldError('email', i18n.t('login.invalid_credentials'));
            } else {
                clearFieldError('email');
            }
        });
    }

    if (passwordInput) {
        Utils.DOM.on(passwordInput, 'input', () => {
            if (passwordInput.value.length > 0) {
                clearFieldError('password');
                clearLoginError();
            }
        });
    }

    function setLoadingState(loading) {
        if (loginBtn) {
            loginBtn.disabled = loading;
        }
        if (loginBtnText) {
            if (loading) {
                loginBtnText.textContent = i18n.t('login.signing_in');
                Utils.DOM.toggle(loginBtnText, true);
            } else {
                loginBtnText.textContent = i18n.t('login.sign_in');
                Utils.DOM.toggle(loginBtnText, true);
            }
        }
        if (loginBtnSpinner) {
            Utils.DOM.toggle(loginBtnSpinner, loading);
        }
    }

    function validateLoginForm(email, password) {
        const errors = {};
        
        if (!email) {
            errors.email = i18n.t('login.email');
        } else if (!Utils.Validation.isEmail(email)) {
            errors.email = i18n.t('login.invalid_credentials');
        }
        
        if (!password) {
            errors.password = i18n.t('login.password');
        } else if (password.length < 6) {
            errors.password = i18n.t('login.invalid_credentials');
        }
        
        return {
            isValid: Object.keys(errors).length === 0,
            errors
        };
    }

    function showValidationErrors(errors) {
        Object.entries(errors).forEach(([field, message]) => {
            showFieldError(field, message);
        });
    }

    function showFieldError(field, message) {
        const errorElement = document.getElementById(`${field}-error`);
        const inputElement = document.getElementById(field);
        
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
        
        if (inputElement) {
            inputElement.classList.add('error');
        }
    }

    function clearFieldError(field) {
        const errorElement = document.getElementById(`${field}-error`);
        const inputElement = document.getElementById(field);
        
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }
        
        if (inputElement) {
            inputElement.classList.remove('error');
        }
    }

    function clearErrors() {
        clearFieldError('email');
        clearFieldError('password');
        clearLoginError();
    }

    function showLoginError(message) {
        if (loginError && loginErrorMessage) {
            loginErrorMessage.textContent = message;
            Utils.DOM.show(loginError);
        }
    }

    function clearLoginError() {
        if (loginError) {
            Utils.DOM.hide(loginError);
        }
    }
}

async function checkConnectionStatus() {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;
    
    try {
        const health = await supabaseClient.healthCheck();
        if (health.status === 'ok') {
            statusElement.innerHTML = '<span style="color: var(--color-success);">Connected</span>';
        } else {
            statusElement.innerHTML = '<span style="color: var(--color-error);">Connection Error</span>';
        }
    } catch (error) {
        statusElement.innerHTML = '<span style="color: var(--color-error);">Failed to Connect</span>';
    }
}