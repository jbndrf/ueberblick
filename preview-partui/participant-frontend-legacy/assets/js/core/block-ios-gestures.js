/**
 * Enhanced Mobile Controls Gesture Coordination
 * Works in conjunction with BrowserGestureBlocker for specific UI elements
 * Provides additional gesture blocking for mobile control elements
 */
window.MobileControls = {
  init() {
    // Wait for BrowserGestureBlocker to be available
    if (typeof window.BrowserGestureBlocker === 'undefined') {
      setTimeout(() => this.init(), 100);
      return;
    }
    
    const elements = document.querySelectorAll('.mobile-controls, .fab, .fab-options, .map-control-button, .mobile-control-button, .bottom-sheet, .sidebar, .workflow-content, .form-content');
    
    // Track gesture state
    let gestureState = {
      lastTapTime: 0,
      lastTouchX: 0,
      lastTouchY: 0,
      touchStartTime: 0,
      isTracking: false
    };
    const doubleTapThreshold = 250; // milliseconds
    const minimumTouchTime = 20; // milliseconds - reduced to allow quick taps
    
    elements.forEach(element => {
      // Enhanced touchstart handling with comprehensive gesture prevention
      element.addEventListener('touchstart', function(e) {
        const currentTime = Date.now();
        const touch = e.touches[0];
        
        gestureState.isTracking = true;
        gestureState.touchStartTime = currentTime;
        gestureState.lastTouchX = touch.clientX;
        gestureState.lastTouchY = touch.clientY;
        
        // Prevent multi-touch gestures immediately
        if (e.touches.length > 1) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[Mobile Controls] Blocked multi-touch on', element.className);
          return false;
        }
        
        // Check for double-tap and prevent it
        const timeSinceLastTap = currentTime - gestureState.lastTapTime;
        if (timeSinceLastTap < doubleTapThreshold && timeSinceLastTap > 0) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[Mobile Controls] Blocked double-tap on', element.className);
          return false;
        }
        
        gestureState.lastTapTime = currentTime;
      }, { passive: false, capture: true });
      
      // Enhanced touchmove handling that coordinates with main gesture blocker
      element.addEventListener('touchmove', function(e) {
        if (!gestureState.isTracking || !e.touches || e.touches.length === 0) return;
        
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - gestureState.lastTouchX);
        const deltaY = Math.abs(touch.clientY - gestureState.lastTouchY);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Prevent multi-touch gestures
        if (e.touches.length > 1) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[Mobile Controls] Blocked multi-touch move on', element.className);
          return false;
        }
        
        // For UI controls, prevent movement unless it's in a scrollable area
        const isScrollableArea = element.closest('.scrollable-content') || 
                                element.closest('.bottom-sheet-content') || 
                                element.closest('.sidebar-content') ||
                                element.closest('.workflow-content') ||
                                element.closest('.form-content');
        
        if (!isScrollableArea && distance > 10) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        
        // For scrollable areas, only allow vertical scrolling
        if (isScrollableArea && deltaX > deltaY && deltaX > 20) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }, { passive: false, capture: true });
      
      // Enhanced touchend handling with gesture completion validation
      element.addEventListener('touchend', function(e) {
        const currentTime = Date.now();
        const touchDuration = currentTime - gestureState.touchStartTime;
        
        // Allow button clicks and content interactions - only prevent very short taps on non-interactive elements
        const isButton = element.tagName === 'BUTTON' || 
                         element.classList.contains('map-control-button') || 
                         element.classList.contains('mobile-control-button') || 
                         element.classList.contains('fab') ||
                         element.closest('button');
                         
        const isInContentArea = element.closest('.bottom-sheet-content') || 
                               element.closest('.sidebar-content') || 
                               element.closest('.workflow-content') ||
                               element.closest('.marker-details') ||
                               element.closest('.content-area');
        
        if (!isButton && !isInContentArea && touchDuration < minimumTouchTime) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[Mobile Controls] Blocked short tap on non-interactive element', element.className);
          return false;
        }
        
        // Ensure no lingering touches
        if (e.touches && e.touches.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        
        // Reset tracking state
        gestureState.isTracking = false;
      }, { passive: false, capture: true });
      
      // Add touchcancel handling
      element.addEventListener('touchcancel', function(e) {
        gestureState.isTracking = false;
        console.log('[Mobile Controls] Touch cancelled on', element.className);
      }, { passive: false, capture: true });
    });
    
    // Add global gesture coordination
    this.setupGlobalGestureCoordination();
    
    console.log('Enhanced Mobile Controls initialized with comprehensive gesture blocking');
  },
  
  /**
   * Setup global gesture coordination with BrowserGestureBlocker
   */
  setupGlobalGestureCoordination() {
    // Add mobile-specific selectors to the main gesture blocker
    if (window.BrowserGestureBlocker) {
      const mobileSelectors = [
        '.mobile-controls',
        '.mobile-control-button', 
        '.fab-menu',
        '.fab-options',
        '.workflow-content',
        '.form-content',
        '.bottom-sheet-handle'
      ];
      
      mobileSelectors.forEach(selector => {
        window.BrowserGestureBlocker.addAllowedSelector(selector);
      });
      
      console.log('[Mobile Controls] Added mobile-specific allowed selectors to gesture blocker');
    }
  },
  
  /**
   * Add comprehensive gesture blocking to a specific element
   */
  addGestureBlocking(element) {
    if (!element) return;
    
    let elementGestureState = {
      lastTapTime: 0,
      touchStartTime: 0,
      startX: 0,
      startY: 0
    };
    
    // Comprehensive touchstart blocking
    element.addEventListener('touchstart', function(e) {
      const currentTime = Date.now();
      const touch = e.touches[0];
      
      elementGestureState.touchStartTime = currentTime;
      elementGestureState.startX = touch.clientX;
      elementGestureState.startY = touch.clientY;
      
      // Block multi-touch
      if (e.touches.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      // Block double-tap
      const timeSinceLastTap = currentTime - elementGestureState.lastTapTime;
      if (timeSinceLastTap < 250 && timeSinceLastTap > 0) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      elementGestureState.lastTapTime = currentTime;
    }, { passive: false, capture: true });
    
    // Enhanced touchmove blocking
    element.addEventListener('touchmove', function(e) {
      // Block multi-touch
      if (e.touches.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      // Block significant movement unless allowed
      if (!element.closest('.scrollable-content')) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - elementGestureState.startX);
        const deltaY = Math.abs(touch.clientY - elementGestureState.startY);
        
        if (deltaX > 15 || deltaY > 15) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    }, { passive: false, capture: true });
    
    // Enhanced touchend blocking
    element.addEventListener('touchend', function(e) {
      const touchDuration = Date.now() - elementGestureState.touchStartTime;
      
      // Block very short taps
      if (touchDuration < 50) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      
      // Ensure clean touch end
      if (e.touches && e.touches.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, { passive: false, capture: true });
    
    console.log('[Mobile Controls] Added comprehensive gesture blocking to element:', element.className || element.tagName);
  },
  
  /**
   * Get gesture blocking statistics
   */
  getStats() {
    const blockerStats = window.BrowserGestureBlocker ? window.BrowserGestureBlocker.getStats() : {};
    return {
      mobileControlsActive: true,
      browserGestureBlocker: blockerStats,
      coordinatedBlocking: true
    };
  }
};

// Auto-initialize with proper timing and coordination
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Delay initialization to ensure BrowserGestureBlocker is ready
    setTimeout(() => window.MobileControls.init(), 200);
  });
} else {
  // Delay initialization to ensure BrowserGestureBlocker is ready
  setTimeout(() => window.MobileControls.init(), 200);
}

// Make available globally for debugging
if (typeof window !== 'undefined') {
  window.MobileControls = window.MobileControls;
}