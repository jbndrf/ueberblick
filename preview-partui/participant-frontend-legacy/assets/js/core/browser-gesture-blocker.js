/**
 * Enhanced Browser Gesture Blocker
 * 
 * Completely prevents browser gestures and system-level touch interactions
 * that interfere with web app functionality on mobile devices
 * 
 * Features:
 * - Blocks iOS Safari swipe gestures (back/forward navigation)
 * - Prevents Android Chrome pull-to-refresh and swipe navigation
 * - Blocks zoom gestures (pinch-to-zoom, double-tap zoom)
 * - Prevents scroll bouncing and overscroll effects
 * - Stops long-press context menus
 * - Blocks text selection gestures
 * - Prevents system gesture recognition
 * - Selective allowing of touch events for legitimate UI components
 * - Comprehensive mobile browser gesture prevention
 */

import DebugLogger from './debug-logger.js';

class BrowserGestureBlocker {
    constructor() {
        this.logger = new DebugLogger('BrowserGestureBlocker');
        this.isActive = false;
        this.preventSystemGestures = true;
        
        // Elements that should be allowed to handle gestures
        this.allowedSelectors = [
            '.bottom-sheet-header',
            '.bottom-sheet-content', 
            '.sidebar-header',
            '.sidebar-content',
            '.close-btn',
            '.leaflet-container',
            '.leaflet-control',
            '.map-control-button',
            '.mobile-control-button',
            '.fab',
            '.fab-menu',
            '.fab-options',
            'input',
            'textarea',
            'select',
            'button',
            '.scrollable-content',
            '.form-field',
            '.workflow-content'
        ];
        
        // Track gesture state
        this.gestureState = {
            isTracking: false,
            startX: 0,
            startY: 0,
            startTime: 0,
            lastX: 0,
            lastY: 0,
            touchCount: 0,
            preventNext: false
        };
        
        this.blockedGestures = [];
        this.gestureEventHandlers = new Map();
        
        // Performance tracking
        this.gestureBlockCount = 0;
        this.lastBlockTime = 0;
    }
    
    /**
     * Initialize comprehensive gesture blocking
     */
    initialize() {
        try {
            // Apply CSS-based gesture prevention first
            this.applyCSSGesturePrevention();
            
            // Setup JavaScript event-based blocking
            this.setupGestureBlocking();
            
            // Setup system-level gesture prevention
            this.setupSystemGesturePrevention();
            
            // Setup viewport and meta tag optimizations
            this.optimizeViewportSettings();
            
            this.isActive = true;
            this.logger.log('Enhanced browser gesture blocking initialized');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize gesture blocking:', error);
            return false;
        }
    }
    
    /**
     * Apply CSS-based gesture prevention
     */
    applyCSSGesturePrevention() {
        // Create comprehensive CSS rules for gesture prevention
        const style = document.createElement('style');
        style.id = 'gesture-blocker-styles';
        style.textContent = `
            /* Comprehensive gesture blocking */
            html, body {
                touch-action: none !important;
                overscroll-behavior: none !important;
                overscroll-behavior-x: none !important;
                overscroll-behavior-y: none !important;
                user-select: none !important;
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                -webkit-touch-callout: none !important;
                -webkit-tap-highlight-color: transparent !important;
                -ms-touch-action: none !important;
                -ms-content-zooming: none !important;
                -ms-user-select: none !important;
            }
            
            /* Allow text selection by default, prevent only where needed */
            * {
                -webkit-touch-callout: none !important;
            }
            
            /* Prevent text selection only on interactive UI elements */
            .fab, .fab-menu, .fab-options, .mobile-controls, .map-control-button, 
            .mobile-control-button, button, .btn, .leaflet-control {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
            
            /* Explicitly allow text selection for content areas */
            .bottom-sheet-content, .sidebar-content, .workflow-content, 
            .form-content, .marker-details, .content-area, .workflow-data-content,
            .marker-detail-content, p, span, div:not(.btn):not(.control):not(.fab), 
            input, textarea, [contenteditable="true"] {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
                touch-action: manipulation !important;
                -webkit-touch-callout: default !important;
            }
            
            /* Map container specific settings */
            .leaflet-container {
                touch-action: pan-x pan-y !important;
            }
            
            /* Scrollable areas */
            .scrollable-content, .bottom-sheet-content, .sidebar-content {
                touch-action: pan-y !important;
                overscroll-behavior: contain !important;
            }
            
            /* Prevent iOS bounce and pull-to-refresh */
            body {
                position: fixed !important;
                overflow: hidden !important;
                width: 100% !important;
                height: 100% !important;
            }
            
            /* App container to enable scrolling where needed */
            #map, .map-container {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                overflow: hidden !important;
            }
        `;
        
        // Remove existing style if present
        const existingStyle = document.getElementById('gesture-blocker-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        document.head.appendChild(style);
        this.logger.log('CSS gesture prevention applied');
    }
    
    /**
     * Setup comprehensive gesture blocking event listeners
     */
    setupGestureBlocking() {
        // High priority touch events with capture
        this.addGestureBlocker(document, 'touchstart', (e) => {
            this.handleTouchStart(e);
        }, { passive: false, capture: true });
        
        this.addGestureBlocker(document, 'touchmove', (e) => {
            this.handleTouchMove(e);
        }, { passive: false, capture: true });
        
        this.addGestureBlocker(document, 'touchend', (e) => {
            this.handleTouchEnd(e);
        }, { passive: false, capture: true });
        
        this.addGestureBlocker(document, 'touchcancel', (e) => {
            this.handleTouchCancel(e);
        }, { passive: false, capture: true });
        
        // Prevent all mouse-based gestures that could interfere
        this.addGestureBlocker(document, 'contextmenu', (e) => {
            if (!this.shouldAllowGestures(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { passive: false, capture: true });
        
        // Prevent text selection
        this.addGestureBlocker(document, 'selectstart', (e) => {
            if (!this.shouldAllowTextSelection(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { passive: false, capture: true });
        
        // Prevent drag and drop
        this.addGestureBlocker(document, 'dragstart', (e) => {
            if (!this.shouldAllowGestures(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { passive: false, capture: true });
        
        // iOS-specific gesture events
        this.addGestureBlocker(document, 'gesturestart', (e) => {
            if (!this.shouldAllowGestures(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { passive: false, capture: true });
        
        this.addGestureBlocker(document, 'gesturechange', (e) => {
            if (!this.shouldAllowGestures(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { passive: false, capture: true });
        
        this.addGestureBlocker(document, 'gestureend', (e) => {
            if (!this.shouldAllowGestures(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { passive: false, capture: true });
        
        // Prevent zoom with mouse wheel
        this.addGestureBlocker(document, 'wheel', (e) => {
            if (!this.shouldAllowGestures(e.target) && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { passive: false, capture: true });
        
        // Prevent keyboard shortcuts that could interfere
        this.addGestureBlocker(document, 'keydown', (e) => {
            this.handleKeyDown(e);
        }, { passive: false, capture: true });
    }
    
    /**
     * Setup system-level gesture prevention
     */
    setupSystemGesturePrevention() {
        // Prevent scroll restoration
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }
        
        // Prevent default scroll behavior
        this.addGestureBlocker(window, 'scroll', (e) => {
            if (this.preventSystemGestures) {
                window.scrollTo(0, 0);
            }
        }, { passive: false, capture: true });
        
        // Prevent resize handling that could trigger gestures
        this.addGestureBlocker(window, 'resize', (e) => {
            // Reset any gesture state on resize
            this.resetGestureState();
        }, { passive: true });
        
        // Prevent orientation change gestures
        this.addGestureBlocker(window, 'orientationchange', (e) => {
            this.resetGestureState();
            // Force re-application of styles after orientation change
            setTimeout(() => {
                this.applyCSSGesturePrevention();
            }, 100);
        }, { passive: true });
    }
    
    /**
     * Optimize viewport settings for gesture prevention
     */
    optimizeViewportSettings() {
        // Update or create viewport meta tag for optimal gesture prevention
        let viewportMeta = document.querySelector('meta[name="viewport"]');
        if (!viewportMeta) {
            viewportMeta = document.createElement('meta');
            viewportMeta.name = 'viewport';
            document.head.appendChild(viewportMeta);
        }
        
        // Set comprehensive viewport settings
        viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover';
        
        // Add additional meta tags for better mobile behavior
        const metaTags = [
            { name: 'mobile-web-app-capable', content: 'yes' },
            { name: 'apple-mobile-web-app-capable', content: 'yes' },
            { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
            { name: 'apple-touch-fullscreen', content: 'yes' },
            { name: 'HandheldFriendly', content: 'true' },
            { name: 'format-detection', content: 'telephone=no' }
        ];
        
        metaTags.forEach(({ name, content }) => {
            let meta = document.querySelector(`meta[name="${name}"]`);
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = name;
                document.head.appendChild(meta);
            }
            meta.content = content;
        });
        
        this.logger.log('Viewport settings optimized for gesture prevention');
    }
    
    /**
     * Handle touch start events with comprehensive gesture detection
     */
    handleTouchStart(e) {
        if (!e.touches || e.touches.length === 0) return;
        
        const touch = e.touches[0];
        const target = e.target;
        
        // Update gesture state
        this.gestureState.isTracking = true;
        this.gestureState.startX = touch.clientX;
        this.gestureState.startY = touch.clientY;
        this.gestureState.lastX = touch.clientX;
        this.gestureState.lastY = touch.clientY;
        this.gestureState.startTime = Date.now();
        this.gestureState.touchCount = e.touches.length;
        
        // Prevent multi-touch gestures immediately
        if (e.touches.length > 1) {
            if (!this.shouldAllowGestures(target)) {
                e.preventDefault();
                e.stopPropagation();
                this.logGestureBlock('multi-touch start');
                return false;
            }
        }
        
        // Check for edge swipe potential - but exclude mobile control buttons
        const isNearLeftEdge = touch.clientX < 20;
        const isNearRightEdge = touch.clientX > window.innerWidth - 20;
        const isNearTopEdge = touch.clientY < 20;
        
        // Don't mark edge prevention for allowed gestures (including mobile control buttons)
        if ((isNearLeftEdge || isNearRightEdge || isNearTopEdge) && !this.shouldAllowGestures(target)) {
            // Mark for potential prevention
            this.gestureState.preventNext = true;
        }
    }
    
    /**
     * Handle touch move events with advanced gesture analysis
     */
    handleTouchMove(e) {
        if (!this.gestureState.isTracking || !e.touches || e.touches.length === 0) return;
        
        const touch = e.touches[0];
        const target = e.target;
        const currentTime = Date.now();
        
        // Calculate movement deltas
        const deltaX = touch.clientX - this.gestureState.startX;
        const deltaY = touch.clientY - this.gestureState.startY;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const timeDiff = currentTime - this.gestureState.startTime;
        const velocity = distance / Math.max(timeDiff, 1);
        
        // Update last position
        this.gestureState.lastX = touch.clientX;
        this.gestureState.lastY = touch.clientY;
        
        // Prevent multi-touch gestures
        if (e.touches.length > 1) {
            if (!this.shouldAllowGestures(target)) {
                e.preventDefault();
                e.stopPropagation();
                this.logGestureBlock('multi-touch move');
                return false;
            }
        }
        
        // Check for problematic gesture patterns
        const isEdgeSwipe = this.detectEdgeSwipe(deltaX, deltaY, velocity);
        const isPullToRefresh = this.detectPullToRefresh(deltaY, velocity);
        const isFastSwipe = velocity > 2 && (absDeltaX > 100 || absDeltaY > 100);
        
        if (!this.shouldAllowGestures(target)) {
            // Prevent edge swipes (browser navigation)
            if (isEdgeSwipe) {
                e.preventDefault();
                e.stopPropagation();
                this.logGestureBlock('edge swipe');
                return false;
            }
            
            // Prevent pull-to-refresh
            if (isPullToRefresh) {
                e.preventDefault();
                e.stopPropagation();
                this.logGestureBlock('pull-to-refresh');
                return false;
            }
            
            // Prevent fast swipes that could trigger system gestures
            if (isFastSwipe) {
                e.preventDefault();
                e.stopPropagation();
                this.logGestureBlock('fast swipe');
                return false;
            }
            
            // Prevent any marked gestures
            if (this.gestureState.preventNext) {
                e.preventDefault();
                e.stopPropagation();
                this.logGestureBlock('marked gesture');
                return false;
            }
        }
    }
    
    /**
     * Detect edge swipe gestures
     */
    detectEdgeSwipe(deltaX, deltaY, velocity) {
        const startX = this.gestureState.startX;
        const startY = this.gestureState.startY;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);
        
        // Check if touch started in mobile controls area (bottom 80px)
        const isInMobileControlsArea = startY > window.innerHeight - 80;
        
        // Horizontal swipe from screen edge
        const isHorizontalSwipe = absDeltaX > absDeltaY && absDeltaX > 30;
        const isFromLeftEdge = startX < 30 && deltaX > 50;
        const isFromRightEdge = startX > window.innerWidth - 30 && deltaX < -50;
        const isFastEnough = velocity > 0.5;
        
        // Don't detect edge swipes in mobile controls area
        if (isInMobileControlsArea) {
            return false;
        }
        
        return isHorizontalSwipe && (isFromLeftEdge || isFromRightEdge) && isFastEnough;
    }
    
    /**
     * Detect pull-to-refresh gesture
     */
    detectPullToRefresh(deltaY, velocity) {
        const startY = this.gestureState.startY;
        const isFromTop = startY < 50;
        const isPullingDown = deltaY > 80;
        const isFastEnough = velocity > 0.3;
        
        return isFromTop && isPullingDown && isFastEnough;
    }
    
    /**
     * Handle touch end events
     */
    handleTouchEnd(e) {
        const target = e.target;
        
        // Check for double-tap gesture (zoom)
        if (this.detectDoubleTap() && !this.shouldAllowGestures(target)) {
            e.preventDefault();
            e.stopPropagation();
            this.logGestureBlock('double-tap zoom');
        }
        
        // Reset gesture state
        this.resetGestureState();
    }
    
    /**
     * Handle touch cancel events
     */
    handleTouchCancel(e) {
        this.resetGestureState();
    }
    
    /**
     * Handle keyboard events
     */
    handleKeyDown(e) {
        const target = e.target;
        
        // Prevent zoom shortcuts
        const isZoomShortcut = (e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0');
        
        // Prevent refresh shortcuts
        const isRefreshShortcut = (e.ctrlKey || e.metaKey) && e.key === 'r';
        
        // Prevent browser navigation shortcuts
        const isNavShortcut = e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
        
        if (!this.shouldAllowGestures(target)) {
            if (isZoomShortcut || isRefreshShortcut || isNavShortcut) {
                e.preventDefault();
                e.stopPropagation();
                this.logGestureBlock('keyboard shortcut');
                return false;
            }
        }
    }
    
    /**
     * Detect double-tap gesture
     */
    detectDoubleTap() {
        const currentTime = Date.now();
        if (!this.lastTapTime) {
            this.lastTapTime = currentTime;
            return false;
        }
        
        const timeDiff = currentTime - this.lastTapTime;
        this.lastTapTime = currentTime;
        
        return timeDiff < 300; // Double tap within 300ms
    }
    
    /**
     * Reset gesture tracking state
     */
    resetGestureState() {
        this.gestureState = {
            isTracking: false,
            startX: 0,
            startY: 0,
            startTime: 0,
            lastX: 0,
            lastY: 0,
            touchCount: 0,
            preventNext: false
        };
    }
    
    /**
     * Check if an element should be allowed to handle gestures
     */
    shouldAllowGestures(element) {
        if (!element) return false;
        
        // Check if element matches allowed selectors
        for (const selector of this.allowedSelectors) {
            try {
                if (element.matches && element.matches(selector)) {
                    return true;
                }
                if (element.closest && element.closest(selector)) {
                    return true;
                }
            } catch (e) {
                // Selector might not be valid, continue
            }
        }
        
        // Check for specific element types that should be allowed
        if (element.tagName) {
            const tagName = element.tagName.toLowerCase();
            if (['input', 'textarea', 'select', 'button'].includes(tagName)) {
                return true;
            }
        }
        
        // Check for contenteditable
        if (element.contentEditable === 'true') {
            return true;
        }
        
        // Check for data attributes that indicate interactive elements
        if (element.dataset && (element.dataset.interactive === 'true' || element.dataset.allowGestures === 'true')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Check if text selection should be allowed for an element
     */
    shouldAllowTextSelection(element) {
        if (!element) return true; // Default to allowing text selection
        
        const tagName = element.tagName?.toLowerCase();
        
        // Always allow text selection for form elements
        if (['input', 'textarea'].includes(tagName)) {
            return true;
        }
        
        if (element.contentEditable === 'true') {
            return true;
        }
        
        if (element.dataset?.allowTextSelection === 'true') {
            return true;
        }
        
        // Always allow text selection in bottom sheet and content areas
        const allowSelectionAreas = [
            '.bottom-sheet-content', '.sidebar-content', '.workflow-content', 
            '.form-content', '.marker-details', '.content-area', 
            '.workflow-data-content', '.marker-detail-content'
        ];
        
        for (const selector of allowSelectionAreas) {
            if (element.closest && element.closest(selector)) {
                return true;
            }
        }
        
        // Prevent text selection only on interactive UI controls
        const preventSelectionClasses = [
            'fab', 'fab-menu', 'fab-options', 'mobile-controls', 
            'map-control-button', 'mobile-control-button', 'btn', 
            'leaflet-control', 'button'
        ];
        
        for (const className of preventSelectionClasses) {
            if (element.classList && element.classList.contains(className)) {
                return false;
            }
            // Only block if element is a direct child of control element, not content inside it
            const controlParent = element.closest(`.${className}`);
            if (controlParent && !element.closest('.bottom-sheet-content, .sidebar-content, .workflow-content, .marker-details')) {
                return false;
            }
        }
        
        // Prevent text selection on button elements (but allow in content areas)
        if (tagName === 'button' && !element.closest('.bottom-sheet-content, .sidebar-content, .workflow-content, .marker-details')) {
            return false;
        }
        
        // Allow text selection by default for content
        return true;
    }
    
    /**
     * Add a gesture blocking event listener
     */
    addGestureBlocker(element, eventType, handler, options = {}) {
        const wrappedHandler = (e) => {
            try {
                handler(e);
            } catch (error) {
                this.logger.error(`Error in ${eventType} handler:`, error);
            }
        };
        
        element.addEventListener(eventType, wrappedHandler, options);
        
        // Store for cleanup
        const handlerId = `${eventType}-${Date.now()}-${Math.random()}`;
        this.gestureEventHandlers.set(handlerId, {
            element,
            eventType,
            handler: wrappedHandler,
            options
        });
    }
    
    /**
     * Add additional allowed selector
     */
    addAllowedSelector(selector) {
        if (!this.allowedSelectors.includes(selector)) {
            this.allowedSelectors.push(selector);
            this.logger.log(`Added allowed selector: ${selector}`);
        }
    }
    
    /**
     * Remove allowed selector
     */
    removeAllowedSelector(selector) {
        const index = this.allowedSelectors.indexOf(selector);
        if (index > -1) {
            this.allowedSelectors.splice(index, 1);
            this.logger.log(`Removed allowed selector: ${selector}`);
        }
    }
    
    /**
     * Temporarily disable gesture blocking
     */
    disable() {
        this.isActive = false;
        this.logger.log('Gesture blocking disabled');
    }
    
    /**
     * Re-enable gesture blocking
     */
    enable() {
        this.isActive = true;
        this.logger.log('Gesture blocking enabled');
    }
    
    /**
     * Check if gesture blocking is active
     */
    isGestureBlockingActive() {
        return this.isActive;
    }
    
    /**
     * Log blocked gestures for debugging
     */
    logGestureBlock(gestureType) {
        this.gestureBlockCount++;
        this.lastBlockTime = Date.now();
        
        if (this.gestureBlockCount % 10 === 0) {
            this.logger.log(`Blocked ${this.gestureBlockCount} gestures (last: ${gestureType})`);
        }
    }
    
    /**
     * Get gesture blocking statistics
     */
    getStats() {
        return {
            isActive: this.isActive,
            gestureBlockCount: this.gestureBlockCount,
            lastBlockTime: this.lastBlockTime,
            allowedSelectors: this.allowedSelectors.length,
            preventSystemGestures: this.preventSystemGestures
        };
    }
    
    /**
     * Enable/disable system gesture prevention
     */
    setSystemGesturePrevention(enabled) {
        this.preventSystemGestures = enabled;
        this.logger.log(`System gesture prevention ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Cleanup all event handlers and styles
     */
    destroy() {
        // Remove all event handlers
        for (const [handlerId, handlerInfo] of this.gestureEventHandlers.entries()) {
            try {
                handlerInfo.element.removeEventListener(
                    handlerInfo.eventType,
                    handlerInfo.handler,
                    handlerInfo.options
                );
            } catch (error) {
                this.logger.error(`Error removing handler ${handlerId}:`, error);
            }
        }
        
        // Remove CSS styles
        const style = document.getElementById('gesture-blocker-styles');
        if (style) {
            style.remove();
        }
        
        // Reset gesture state
        this.resetGestureState();
        
        this.gestureEventHandlers.clear();
        this.isActive = false;
        this.logger.log('Enhanced browser gesture blocker destroyed');
    }
}

// Create and export singleton instance
export const browserGestureBlocker = new BrowserGestureBlocker();
export default browserGestureBlocker;

// Make available globally for coordination with other components
if (typeof window !== 'undefined') {
    window.BrowserGestureBlocker = browserGestureBlocker;
}