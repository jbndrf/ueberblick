/**
 * Bottom Sheet UI System
 * 
 * Responsive container that works as:
 * - Desktop: Right sidebar 
 * - Mobile: Bottom sheet with peek/expanded states
 * 
 * Supports dynamic module loading with proper lifecycle management
 * Integrates with workflow engine and form renderer
 * 
 * Adapted from legacy sidebar system patterns
 */

import eventManager from '../core/event-manager.js';
import DebugLogger from '../core/debug-logger.js';
import browserGestureBlocker from '../core/browser-gesture-blocker.js';
import workflowInstanceService from '../services/workflow-instance-service.js';

export class BottomSheetContainer {
    constructor() {
        this.logger = new DebugLogger('BottomSheet');
        this.state = {
            isOpen: false,
            isMobile: window.innerWidth <= 768,
            isExpanded: false,
            isDragging: false,
            initialTouchY: 0,
            currentHeight: 0.3,
            animationFrame: null,
            isAnimating: false
        };
        
        // Flag to prevent closing during certain operations (e.g., location updates)
        this.preventClose = false;
        
        this.moduleRegistry = new Map();
        this.activeModule = null;
        this.activeModuleId = null;
        this.container = null;
        this.contentElement = null;
        this.handleElement = null;
        
        // Register for cleanup
        eventManager.registerComponent('bottom-sheet', { 
            destroy: () => this.destroy() 
        });
        
        this.logger.log('Initialized');
    }

    /**
     * Initialize the bottom sheet container
     */
    initialize(parentContainer = document.body) {
        try {
            this.logger.log('Starting bottom sheet initialization...');
            
            // Step 1: Create container
            this.logger.log('Creating container...');
            this.createContainer(parentContainer);
            
            // Step 2: Setup event listeners
            this.logger.log('Setting up event listeners...');
            this.setupEventListeners();
            
            // Step 3: Update responsive state
            this.logger.log('Updating responsive state...');
            this.updateResponsiveState();
            
            // Step 4: Coordinate with gesture blocker asynchronously (don't fail init if not ready)
            this.logger.log('Scheduling gesture blocker coordination...');
            setTimeout(() => {
                this.coordinateWithGestureBlocker();
            }, 0);
            
            this.logger.log('Bottom sheet container initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize bottom sheet:', error);
            console.error('Bottom sheet initialization error:', error);
            return false;
        }
    }

    /**
     * Create the bottom sheet container elements
     */
    createContainer(parentContainer) {
        // Create main container
        this.container = document.createElement('div');
        this.container.id = 'bottomSheetContainer';
        this.container.className = 'bottom-sheet-container';
        
        // Remove old handle element - header now serves as drag handle
        this.handleElement = null;
        
        // Create header area with dynamic content structure
        const headerElement = document.createElement('div');
        headerElement.className = 'bottom-sheet-header';
        headerElement.innerHTML = `
            <div class="bottom-sheet-header-content">
                <div class="bottom-sheet-title-section">
                    <h3 class="bottom-sheet-title" id="bottomSheetTitle">Content</h3>
                    <div class="bottom-sheet-subtitle" id="bottomSheetSubtitle"></div>
                </div>
                <div class="bottom-sheet-stage-info">
                    <span class="bottom-sheet-stage" id="bottomSheetStage"></span>
                </div>
            </div>
            <button class="bottom-sheet-close" id="bottomSheetClose" type="button">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Create content container
        this.contentElement = document.createElement('div');
        this.contentElement.id = 'bottomSheetContent';
        this.contentElement.className = 'bottom-sheet-content';
        
        // Assemble container - header serves as both header and handle
        this.container.appendChild(headerElement);
        this.container.appendChild(this.contentElement);
        
        // Set headerElement as the handle for drag operations
        this.handleElement = headerElement;
        
        // Add to parent
        parentContainer.appendChild(this.container);
        
        // Set initial state
        this.updateContainerState();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        try {
            // Check if eventManager is available
            if (!eventManager) {
                throw new Error('Event manager not available');
            }
            
            // Window resize handler
            const resizeHandler = () => {
                this.updateResponsiveState();
            };
            
            this.logger.log('Adding resize handler...');
            eventManager.add(window, 'resize', resizeHandler, {
                component: 'bottom-sheet',
                description: 'Window resize handler'
            });
        
        // Close button handler
        const closeButton = document.getElementById('bottomSheetClose');
        if (closeButton) {
            eventManager.add(closeButton, 'click', () => {
                this.close();
            }, {
                component: 'bottom-sheet',
                description: 'Close button handler'
            });
        }
        
        // Handle touch events for mobile drag
        this.setupTouchHandlers();
        
        // Setup content scroll handling for overscroll gestures (requires contentElement)
        if (this.contentElement) {
            this.setupContentScrollHandling();
        }
        
        // Setup swipe navigation
        this.setupSwipeNavigation();
        
        // Handle click events for toggle behavior
        eventManager.add(this.handleElement, 'click', () => {
            if (this.state.isMobile && this.state.isOpen) {
                this.toggleExpanded();
            }
        }, {
            component: 'bottom-sheet',
            description: 'Handle click toggle'
        });
        
        // Click outside to close (desktop only)
        eventManager.add(document, 'click', (event) => {
            if (!this.state.isMobile && this.state.isOpen && !this.preventClose) {
                if (!this.container.contains(event.target)) {
                    this.close();
                }
            }
        }, {
            component: 'bottom-sheet',
            description: 'Click outside to close'
        });
        
        // Escape key to close
        eventManager.add(document, 'keydown', (event) => {
            if (event.key === 'Escape' && this.state.isOpen && !this.preventClose) {
                this.close();
            }
        }, {
            component: 'bottom-sheet',
            description: 'Escape key handler'
        });

            // Mouse wheel support for PC
            this.logger.log('Setting up mouse wheel handlers...');
            this.setupMouseWheelHandlers();
            
            this.logger.log('All event listeners set up successfully');
        } catch (error) {
            this.logger.error('Error setting up event listeners:', error);
            throw error;
        }
    }

    /**
     * Setup enhanced touch handlers with sophisticated gesture management
     */
    setupTouchHandlers() {
        // Enhanced gesture state
        this.gestureState = {
            isDragging: false,
            isHeaderDragging: false,
            isEnhancedDragging: false,
            isOverscrollDragging: false,
            isSwipeDragging: false,
            initialTouchY: 0,
            initialTouchX: 0,
            currentTouchY: 0,
            currentTouchX: 0,
            dragStartTime: 0,
            lastTouchY: 0,
            velocity: 0,
            maxDragOffset: 0,
            swipeDirection: null,
            dragType: null
        };
        
        // Setup header drag handling
        this.setupHeaderDragHandling();
        
        // Setup enhanced content drag handling  
        this.setupEnhancedDragHandling();
        
        // Setup overscroll gesture detection
        this.setupOverscrollGestureHandling();
        
        // Setup swipe navigation
        this.setupSwipeNavigation();
    }
    
    /**
     * Setup header drag handling - header serves as drag bar
     */
    setupHeaderDragHandling() {
        const header = this.container.querySelector('.bottom-sheet-header');
        if (!header) return;
        
        this.addHeaderDragListeners(header);
    }
    
    /**
     * Add header drag event listeners
     */
    addHeaderDragListeners(header) {
        // Header touch start
        eventManager.add(header, 'touchstart', (e) => {
            if (!this.state.isMobile || !this.state.isOpen) return;
            
            this.gestureState.isHeaderDragging = true;
            this.gestureState.isDragging = true;
            this.gestureState.dragType = 'header';
            this.gestureState.initialTouchY = e.touches[0].clientY;
            this.gestureState.initialTouchX = e.touches[0].clientX;
            this.gestureState.currentTouchY = e.touches[0].clientY;
            this.gestureState.currentTouchX = e.touches[0].clientX;
            this.gestureState.lastTouchY = e.touches[0].clientY;
            this.gestureState.dragStartTime = Date.now();
            this.gestureState.velocity = 0;
            
            // Add dragging class for visual feedback
            this.container.classList.add('dragging');
            
            // Prevent default but allow event to bubble for other handlers
        }, {
            component: 'bottom-sheet',
            description: 'Header touch start'
        });
        
        // Header mouse down for desktop testing
        eventManager.add(header, 'mousedown', (e) => {
            if (this.state.isMobile || !this.state.isOpen) return;
            
            this.gestureState.isHeaderDragging = true;
            this.gestureState.isDragging = true;
            this.gestureState.dragType = 'header';
            this.gestureState.initialTouchY = e.clientY;
            this.gestureState.currentTouchY = e.clientY;
            this.gestureState.lastTouchY = e.clientY;
            this.gestureState.dragStartTime = Date.now();
            
            this.container.classList.add('dragging');
            
            e.preventDefault();
        }, {
            component: 'bottom-sheet',
            description: 'Header mouse down'
        });
        
        // Global touch/mouse move handlers
        this.setupGlobalMoveHandlers();
        
        // Global touch/mouse end handlers
        this.setupGlobalEndHandlers();
    }
    
    /**
     * Setup global move handlers for all gesture types
     */
    setupGlobalMoveHandlers() {
        // Touch move handler
        eventManager.add(document, 'touchmove', (e) => {
            if (!this.gestureState.isDragging || !this.state.isMobile) return;
            
            const touch = e.touches[0];
            this.gestureState.currentTouchY = touch.clientY;
            this.gestureState.currentTouchX = touch.clientX;
            
            const deltaY = this.gestureState.currentTouchY - this.gestureState.initialTouchY;
            const deltaX = this.gestureState.currentTouchX - this.gestureState.initialTouchX;
            
            // Calculate velocity for inertial scrolling
            const now = Date.now();
            const timeDelta = now - this.gestureState.dragStartTime;
            if (timeDelta > 0) {
                const velocityY = (this.gestureState.currentTouchY - this.gestureState.lastTouchY) / timeDelta;
                this.gestureState.velocity = velocityY;
            }
            this.gestureState.lastTouchY = this.gestureState.currentTouchY;
            
            // Handle different drag types
            if (this.gestureState.isHeaderDragging) {
                this.handleHeaderDrag(deltaY, deltaX);
                e.preventDefault();
            } else if (this.gestureState.isEnhancedDragging) {
                this.handleEnhancedDrag(deltaY);
                e.preventDefault();
            } else if (this.gestureState.isOverscrollDragging) {
                this.handleOverscrollDrag(deltaY);
                e.preventDefault();
            } else if (this.gestureState.isSwipeDragging) {
                this.handleSwipeDrag(deltaX);
                e.preventDefault();
            }
        }, {
            component: 'bottom-sheet',
            description: 'Global touch move handler'
        });
        
        // Mouse move handler for desktop
        eventManager.add(document, 'mousemove', (e) => {
            if (!this.gestureState.isDragging || this.state.isMobile) return;
            
            this.gestureState.currentTouchY = e.clientY;
            const deltaY = this.gestureState.currentTouchY - this.gestureState.initialTouchY;
            
            if (this.gestureState.isHeaderDragging) {
                this.handleHeaderDrag(deltaY, 0);
            }
        }, {
            component: 'bottom-sheet',
            description: 'Global mouse move handler'
        });
    }
    
    /**
     * Setup global end handlers
     */
    setupGlobalEndHandlers() {
        // Touch end handler
        eventManager.add(document, 'touchend', () => {
            if (!this.gestureState.isDragging) return;
            
            this.finalizeDragGesture();
        }, {
            component: 'bottom-sheet',
            description: 'Global touch end handler'
        });
        
        // Mouse up handler
        eventManager.add(document, 'mouseup', () => {
            if (!this.gestureState.isDragging) return;
            
            this.finalizeDragGesture();
        }, {
            component: 'bottom-sheet',
            description: 'Global mouse up handler'
        });
    }

    /**
     * Setup mouse wheel handlers for PC interaction
     */
    setupMouseWheelHandlers() {
        // Mouse wheel on bottom sheet content for scrolling
        eventManager.add(this.contentElement, 'wheel', (e) => {
            // Allow normal scrolling within the content area
            // This is the default browser behavior, so we don't need to do anything special
            // Just let the event propagate normally for content scrolling
        }, {
            component: 'bottom-sheet',
            description: 'Content scroll handler'
        });

        // Mouse wheel on handle area for expand/collapse 
        eventManager.add(this.handleElement, 'wheel', (e) => {
            // Handle wheel events when bottom sheet is open (works in both mobile and desktop layout)
            if (!this.state.isOpen) return;

            e.preventDefault(); // Prevent page scrolling when over handle

            const deltaY = e.deltaY;
            const threshold = 50; // Minimum wheel delta to trigger action

            if (Math.abs(deltaY) > threshold) {
                if (deltaY < 0 && !this.state.isExpanded) {
                    // Scrolling up - expand
                    this.expand();
                } else if (deltaY > 0 && this.state.isExpanded) {
                    // Scrolling down - collapse
                    this.collapse();
                }
            }
        }, {
            component: 'bottom-sheet',
            description: 'Handle wheel expand/collapse'
        });

        // Simplified mouse wheel handling - only on header like bdhi approach
        eventManager.add(this.handleElement, 'wheel', (e) => {
            // Handle wheel events when bottom sheet is open (works in both mobile and desktop layout)
            if (!this.state.isOpen) return;

            e.preventDefault(); // Prevent page scrolling when over handle

            const deltaY = e.deltaY;
            const threshold = 50; // Minimum wheel delta to trigger action

            if (Math.abs(deltaY) > threshold) {
                if (deltaY < 0 && !this.state.isExpanded) {
                    // Scrolling up - expand
                    this.expand();
                } else if (deltaY > 0 && this.state.isExpanded) {
                    // Scrolling down - collapse
                    this.collapse();
                }
            }
        }, {
            component: 'bottom-sheet',
            description: 'Header wheel expand/collapse'
        });
    }

    /**
     * Handle drag movement
     */
    handleDrag(deltaY) {
        const threshold = 50; // Minimum drag distance to trigger action
        
        if (Math.abs(deltaY) > threshold) {
            if (deltaY < 0 && !this.state.isExpanded) {
                // Dragging up - expand
                this.expand();
            } else if (deltaY > 0 && this.state.isExpanded) {
                // Dragging down - collapse
                this.collapse();
            } else if (deltaY > 0 && !this.state.isExpanded) {
                // Dragging down when collapsed - close
                this.close();
            }
        }
    }

    /**
     * Finalize drag interaction
     */
    finalizeDrag() {
        // Reset drag state
        this.state.isDragging = false;
        this.state.initialTouchY = 0;
    }

    /**
     * Handle header drag movements with visual feedback
     */
    handleHeaderDrag(deltaY, deltaX) {
        const threshold = 50;
        const maxOffset = 100;
        
        // Constrain drag movement to valid bounds
        const constrainedDeltaY = this.constrainDragMovement(deltaY);
        
        // Apply visual feedback during drag with constraints
        this.applyDragFeedback(constrainedDeltaY);
        
        // Check for swipe gestures (horizontal movement)
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
            if (!this.gestureState.isSwipeDragging) {
                this.gestureState.isSwipeDragging = true;
                this.gestureState.swipeDirection = deltaX > 0 ? 'right' : 'left';
            }
            this.handleSwipeFeedback(deltaX);
        }
    }
    
    /**
     * Constrain drag movement to prevent gaps and invalid positioning
     */
    constrainDragMovement(deltaY) {
        if (!this.state.isMobile) return deltaY;
        
        // Get viewport height for calculations
        const viewportHeight = window.innerHeight;
        const maxExpandOffset = viewportHeight * 0.7; // 70vh max height
        const minPeekOffset = viewportHeight * 0.3;   // 30vh peek height
        
        // Current position bounds
        const currentlyExpanded = this.state.isExpanded;
        
        // Prevent dragging beyond valid bounds
        if (currentlyExpanded) {
            // When expanded, only allow downward drag, constrain upward drag to prevent gaps
            if (deltaY < 0) {
                // Upward drag when expanded - allow slight overscroll but prevent gaps
                return Math.max(deltaY, -50); // Max 50px overscroll up
            } else {
                // Downward drag when expanded - allow for collapse
                return Math.min(deltaY, maxExpandOffset); // Don't drag beyond collapse point
            }
        } else {
            // When in peek mode, allow upward drag for expand, limit downward drag for close
            if (deltaY < 0) {
                // Upward drag for expansion - allow but constrain
                return Math.max(deltaY, -maxExpandOffset);
            } else {
                // Downward drag for closing - allow but constrain to prevent huge gaps
                return Math.min(deltaY, minPeekOffset);
            }
        }
    }

    /**
     * Apply visual feedback during drag operations with RAF optimization
     */
    applyDragFeedback(deltaY) {
        if (!this.container) return;
        
        // Cancel any pending drag feedback animation
        if (this.state.dragFeedbackFrame) {
            cancelAnimationFrame(this.state.dragFeedbackFrame);
        }
        
        // Use requestAnimationFrame for smooth drag feedback
        this.state.dragFeedbackFrame = requestAnimationFrame(() => {
            // More conservative drag feedback to prevent visual gaps
            const maxOffset = 60; // Reduced from 100 to prevent excessive dragging
            const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaY * 0.4)); // Reduced multiplier for more control
            
            // Additional constraint: prevent drag feedback from creating visual gaps
            const constrainedOffset = this.constrainVisualFeedback(clampedOffset);
            
            // Apply drag offset using CSS custom property
            this.container.style.setProperty('--drag-offset', `${constrainedOffset}px`);
            this.container.classList.add('drag-feedback');
            
            this.state.dragFeedbackFrame = null;
        });
    }
    
    /**
     * Constrain visual feedback to prevent gaps at bottom of screen
     */
    constrainVisualFeedback(offset) {
        if (!this.state.isMobile) return offset;
        
        // Get current bottom sheet position
        const containerRect = this.container.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        
        // Calculate current bottom position
        const currentBottom = containerRect.bottom;
        
        // If applying offset would create gap at bottom, constrain it
        if (offset > 0) {
            // Positive offset moves down - ensure we don't create gap at bottom
            const maxAllowedOffset = Math.max(0, viewportHeight - currentBottom);
            return Math.min(offset, maxAllowedOffset);
        } else {
            // Negative offset moves up - prevent moving too far up when expanded
            if (this.state.isExpanded) {
                // When expanded, don't allow moving up beyond the top edge
                const currentTop = containerRect.top;
                const maxUpwardOffset = Math.min(0, -currentTop);
                return Math.max(offset, maxUpwardOffset);
            }
        }
        
        return offset;
    }
    
    /**
     * Apply swipe visual feedback
     */
    handleSwipeFeedback(deltaX) {
        if (!this.container) return;
        
        const maxOffset = 80;
        const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaX * 0.3));
        
        this.container.style.setProperty('--swipe-offset', `${clampedOffset}px`);
        this.container.classList.add('swipe-feedback');
        
        if (deltaX > 0) {
            this.container.classList.add('swipe-right');
            this.container.classList.remove('swipe-left');
        } else {
            this.container.classList.add('swipe-left');
            this.container.classList.remove('swipe-right');
        }
    }
    
    /**
     * Finalize all drag gestures with proper cleanup
     */
    finalizeDragGesture() {
        const deltaY = this.gestureState.currentTouchY - this.gestureState.initialTouchY;
        const threshold = 80;
        const velocity = this.gestureState.velocity;
        
        // Handle different gesture types
        if (this.gestureState.isHeaderDragging) {
            this.finalizeHeaderDrag(deltaY, velocity);
        } else if (this.gestureState.isEnhancedDragging) {
            this.finalizeEnhancedDrag(deltaY, velocity);
        } else if (this.gestureState.isOverscrollDragging) {
            this.finalizeOverscrollDrag(deltaY);
        } else if (this.gestureState.isSwipeDragging) {
            this.finalizeSwipeDrag();
        }
        
        this.resetGestureState();
    }
    
    /**
     * Finalize header drag operations
     */
    finalizeHeaderDrag(deltaY, velocity) {
        const threshold = 80;
        const velocityThreshold = 0.5;
        
        // Check if we should change state based on drag distance or velocity
        if (deltaY > threshold || velocity > velocityThreshold) {
            // Dragged down - collapse or close
            if (this.state.isExpanded) {
                this.collapse();
            } else if (!this.preventClose) {
                this.close();
            }
        } else if (deltaY < -threshold || velocity < -velocityThreshold) {
            // Dragged up - expand
            if (!this.state.isExpanded) {
                this.expand();
            }
        }
        
        // Reset visual feedback
        this.container.classList.remove('dragging', 'drag-feedback');
        this.container.style.removeProperty('--drag-offset');
    }
    
    /**
     * Finalize swipe gestures
     */
    finalizeSwipeDrag() {
        // Handle swipe navigation (could navigate between markers)
        if (this.gestureState.swipeDirection && this.activeModule) {
            if (typeof this.activeModule.handleSwipeNavigation === 'function') {
                this.activeModule.handleSwipeNavigation(this.gestureState.swipeDirection);
            }
        }
        
        // Reset swipe feedback
        this.container.classList.remove('swipe-feedback', 'swipe-left', 'swipe-right');
        this.container.style.removeProperty('--swipe-offset');
    }
    
    /**
     * Setup enhanced drag handling for content area overscroll
     */
    setupEnhancedDragHandling() {
        // Monitor content scroll position for enhanced drag zones
        eventManager.add(this.contentElement, 'scroll', () => {
            this.updateScrollPosition();
        }, {
            component: 'bottom-sheet',
            description: 'Content scroll monitor'
        });
        
        // Add scroll-based expand/collapse gestures
        this.setupScrollBasedGestures();
    }
    
    /**
     * Setup scroll-based gestures for expand/collapse
     */
    setupScrollBasedGestures() {
        if (!this.state.isMobile || !this.contentElement) return;
        
        // This method sets up scroll-based gestures to allow overscroll to close/expand bottom sheet
        // Implementation based on content scroll handling
        this.logger.log('Setting up scroll-based gestures for bottom sheet');
        
        // For now, just ensure the content scroll handling is set up
        // The actual overscroll logic is handled in setupContentScrollHandling
        if (typeof this.setupContentScrollHandling === 'function') {
            this.setupContentScrollHandling();
        }
    }
    
    /**
     * Update scroll position classes for enhanced drag feedback
     */
    updateScrollPosition() {
        if (!this.contentElement || !this.container) return;
        
        const { scrollTop, scrollHeight, clientHeight } = this.contentElement;
        const isAtTop = scrollTop === 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
        
        this.container.classList.toggle('scroll-at-top', isAtTop);
        this.container.classList.toggle('scroll-at-bottom', isAtBottom);
    }
    
    /**
     * Setup content scroll handling for overscroll gestures - EXACT recreation from bdhi_app
     */
    setupContentScrollHandling() {
        if (!this.state.isMobile || !this.contentElement) return;
        
        // Remove any existing content scroll handlers first
        eventManager.removeByPrefix('content-scroll-');
        eventManager.removeByPrefix('overscroll-');
        
        this.addContentScrollListeners(this.contentElement);
        this.setupSimplifiedOverscrollHandling(this.contentElement);
    }

    /**
     * Add content scroll listeners - EXACT recreation from bdhi_app
     */
    addContentScrollListeners(sidebarContent) {
        // Initialize boundary state tracking exactly like bdhi
        this.state.scrollPosition = { isAtTop: false, isAtBottom: false, scrollTop: 0 };
        this.state.currentBoundaryState = null;
        this.state.boundaryStateStartTime = 0;
        
        // Simplified scroll tracking - only track position, don't interfere with scrolling
        const scrollHandler = (e) => {
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            const isAtTop = scrollTop <= 2; // Exactly like bdhi - 2px tolerance
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 2; // Exactly like bdhi
            
            this.state.scrollPosition = { isAtTop, isAtBottom, scrollTop };
            
            // Update boundary state tracking - exactly like bdhi
            const currentBoundaryState = isAtTop ? 'top' : (isAtBottom ? 'bottom' : 'middle');
            if (this.state.currentBoundaryState !== currentBoundaryState) {
                this.state.currentBoundaryState = currentBoundaryState;
                this.state.boundaryStateStartTime = Date.now();
            }
        };
        
        // Add passive scroll listener only - no touch interference, exactly like bdhi
        eventManager.add(sidebarContent, 'scroll', scrollHandler, {
            component: 'bottom-sheet',
            description: 'Content scroll tracking',
            passive: true
        });
    }

    /**
     * Simplified overscroll handling that respects native scroll behavior - EXACT recreation from bdhi_app
     */
    setupSimplifiedOverscrollHandling(sidebarContent) {
        // Store overscroll state in the instance for proper scope access
        this.overscrollState = {
            startY: 0,
            startTime: 0,
            isOverscrolling: false,
            hasScrolledDuringTouch: false,
            initialScrollTop: 0
        };
        
        const overscrollTouchStart = (e) => {
            // Only handle if target is the content area itself, not specific UI elements - exactly like bdhi
            if (e.target.closest('.bottom-sheet-header') || e.target.closest('.bottom-sheet-close')) return;
            
            // Store initial touch position and scroll state - exactly like bdhi
            this.overscrollState.startY = e.touches[0].clientY;
            this.overscrollState.startTime = Date.now();
            this.overscrollState.isOverscrolling = false;
            this.overscrollState.hasScrolledDuringTouch = false;
            this.overscrollState.initialScrollTop = sidebarContent.scrollTop;
            
            // Get current scroll position - exactly like bdhi
            const { scrollTop, scrollHeight, clientHeight } = sidebarContent;
            const isAtTop = scrollTop <= 2;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 2;
            
            // Only proceed if at boundary AND boundary has been stable - exactly like bdhi
            if (!isAtTop && !isAtBottom) return;
            
            const currentTime = Date.now();
            const boundaryStateDuration = currentTime - this.state.boundaryStateStartTime;
            if (boundaryStateDuration < 200) return; // Require 200ms stable boundary state - exactly like bdhi
        };
        
        const overscrollTouchMove = (e) => {
            if (this.overscrollState.startY === 0) return;
            
            // Check if scroll position has changed since touch start - exactly like bdhi
            if (sidebarContent.scrollTop !== this.overscrollState.initialScrollTop) {
                this.overscrollState.hasScrolledDuringTouch = true;
                return; // Normal scrolling is happening, don't interfere - exactly like bdhi
            }
            
            const currentTouchY = e.touches[0].clientY;
            const deltaY = currentTouchY - this.overscrollState.startY;
            const touchDuration = Date.now() - this.overscrollState.startTime;
            
            // Only consider as overscroll after significant movement - exactly like bdhi
            if (Math.abs(deltaY) < 20) return;
            
            // Check if we're still at scroll boundary - exactly like bdhi
            const { scrollTop, scrollHeight, clientHeight } = sidebarContent;
            const isAtTop = scrollTop <= 2;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 2;
            
            // Validate overscroll direction matches boundary - exactly like bdhi
            const isValidOverscroll = (isAtTop && deltaY > 0) || (isAtBottom && deltaY < 0);
            
            if (isValidOverscroll && !this.overscrollState.hasScrolledDuringTouch) {
                this.overscrollState.isOverscrolling = true;
                
                // Only prevent default after we're sure this is overscroll - exactly like bdhi
                if (Math.abs(deltaY) > 40) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                
                // Apply visual feedback only after significant movement to avoid hair-trigger response
                if (Math.abs(deltaY) > 60) { // Higher threshold for visual feedback
                    this.applyOverscrollFeedback(deltaY);
                }
            }
        };
        
        const overscrollTouchEnd = (e) => {
            if (this.overscrollState.startY === 0 || this.overscrollState.hasScrolledDuringTouch) {
                this.clearOverscrollFeedback();
                this.resetOverscrollState();
                return;
            }
            
            const currentTouchY = e.changedTouches[0].clientY;
            const deltaY = currentTouchY - this.overscrollState.startY;
            const touchDuration = Date.now() - this.overscrollState.startTime;
            
            // Clear visual feedback
            this.clearOverscrollFeedback();
            
            // Only handle overscroll actions if - exactly like bdhi:
            // 1. Was overscrolling
            // 2. Sufficient movement 
            // 3. No normal scrolling occurred
            if (this.overscrollState.isOverscrolling && 
                Math.abs(deltaY) > 180 && // Use dragThreshold from bdhi_app - exactly like bdhi
                !this.overscrollState.hasScrolledDuringTouch) {
                
                // Final boundary check - exactly like bdhi
                const { scrollTop, scrollHeight, clientHeight } = sidebarContent;
                const isAtTop = scrollTop <= 2;
                const isAtBottom = scrollTop + clientHeight >= scrollHeight - 2;
                
                // CORRECT LOGIC FROM BDHI: Only trigger if we're still at the exact boundary
                if (isAtTop && deltaY > 0) {
                    // Overscroll down at top - COLLAPSE (not expand!) - exactly like bdhi
                    this.handleOverscrollCollapse();
                } else if (isAtBottom && deltaY < 0) {
                    // Overscroll up at bottom - EXPAND (not collapse!) - exactly like bdhi
                    this.handleOverscrollExpand();
                }
            }
            
            this.resetOverscrollState();
        };
        
        // Add event listeners with proper passive settings
        eventManager.add(sidebarContent, 'touchstart', overscrollTouchStart, {
            component: 'bottom-sheet',
            description: 'Overscroll detection start',
            passive: true
        });
        
        eventManager.add(sidebarContent, 'touchmove', overscrollTouchMove, {
            component: 'bottom-sheet',
            description: 'Overscroll detection move',
            passive: false
        });
        
        eventManager.add(sidebarContent, 'touchend', overscrollTouchEnd, {
            component: 'bottom-sheet',
            description: 'Overscroll detection end',
            passive: false
        });
    }

    /**
     * Reset overscroll state - from bdhi_app
     */
    resetOverscrollState() {
        if (this.overscrollState) {
            this.overscrollState.startY = 0;
            this.overscrollState.startTime = 0;
            this.overscrollState.isOverscrolling = false;
            this.overscrollState.hasScrolledDuringTouch = false;
            this.overscrollState.initialScrollTop = 0;
        }
    }

    /**
     * Apply overscroll visual feedback with enhanced RAF optimization
     */
    applyOverscrollFeedback(deltaY) {
        if (this.state.overscrollAnimationFrame) {
            cancelAnimationFrame(this.state.overscrollAnimationFrame);
        }
        
        this.state.overscrollAnimationFrame = requestAnimationFrame(() => {
            if (!this.container) return;
            
            // More gentle overscroll feedback - reduce sensitivity
            const maxOffset = 80; // Reduced from 100
            const multiplier = 0.2; // Reduced from 0.3 for more gentle movement
            const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaY * multiplier));
            
            // Force hardware acceleration for smooth overscroll
            this.container.style.setProperty('--overscroll-offset', `${clampedOffset}px`);
            this.container.classList.add('overscroll-feedback');
            
            // Ensure will-change is set for optimal performance
            this.container.style.willChange = 'transform';
            
            this.state.overscrollAnimationFrame = null;
        });
    }

    /**
     * Clear overscroll visual feedback with performance cleanup
     */
    clearOverscrollFeedback() {
        if (this.state.overscrollAnimationFrame) {
            cancelAnimationFrame(this.state.overscrollAnimationFrame);
            this.state.overscrollAnimationFrame = null;
        }
        
        if (!this.container) return;
        
        // Use RAF for smooth cleanup
        requestAnimationFrame(() => {
            this.container.classList.remove('overscroll-feedback');
            this.container.style.removeProperty('--overscroll-offset');
            this.container.style.willChange = 'auto'; // Reset will-change to save resources
        });
    }

    /**
     * Handle overscroll collapse action - CORRECT from bdhi_app
     */
    handleOverscrollCollapse() {
        if (this.preventClose) {
            this.logger.log('Overscroll collapse prevented by preventClose flag');
            return;
        }
        
        if (this.state.isExpanded) {
            this.collapse(); // From expanded to collapsed
        } else if (this.state.isOpen && !this.state.isExpanded) {
            this.close(); // From peek/collapsed to closed
        }
        this.logger.log('Overscroll collapse triggered');
    }

    /**
     * Handle overscroll expand action - CORRECT from bdhi_app
     */
    handleOverscrollExpand() {
        if (!this.state.isExpanded && this.state.isOpen) {
            this.expand(); // From peek/collapsed to expanded
        }
        this.logger.log('Overscroll expand triggered');
    }

    /**
     * Setup overscroll gesture handling
     */
    setupOverscrollGestureHandling() {
        // Now implemented in setupScrollBasedGestures
    }
    
    /**
     * Setup swipe navigation
     */
    setupSwipeNavigation() {
        // Swipe navigation is handled as part of header drag gestures
        // Additional setup could go here if needed
    }
    
    /**
     * Handle enhanced drag (content area)
     */
    handleEnhancedDrag(deltaY) {
        // Implementation for enhanced content area dragging
        this.applyEnhancedDragFeedback(deltaY);
    }
    
    /**
     * Apply enhanced drag feedback
     */
    applyEnhancedDragFeedback(deltaY) {
        if (!this.container) return;
        
        const maxOffset = 60;
        const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaY * 0.4));
        
        this.container.style.setProperty('--enhanced-drag-offset', `${clampedOffset}px`);
        this.container.classList.add('enhanced-drag-feedback');
    }
    
    /**
     * Handle overscroll drag
     */
    handleOverscrollDrag(deltaY) {
        // Implementation for overscroll drag handling
        this.applyOverscrollFeedback(deltaY);
    }
    
    /**
     * Apply overscroll visual feedback
     */
    applyOverscrollFeedback(deltaY) {
        if (!this.container) return;
        
        const maxOffset = 40;
        const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, deltaY * 0.3));
        
        this.container.style.setProperty('--overscroll-offset', `${clampedOffset}px`);
        this.container.classList.add('overscroll-feedback');
    }
    
    /**
     * Handle swipe drag movements
     */
    handleSwipeDrag(deltaX) {
        this.handleSwipeFeedback(deltaX);
    }
    
    /**
     * Finalize enhanced drag operations
     */
    finalizeEnhancedDrag(deltaY, velocity) {
        // Similar logic to header drag but for content area
        this.container.classList.remove('enhanced-drag-feedback');
        this.container.style.removeProperty('--enhanced-drag-offset');
    }
    
    /**
     * Finalize overscroll drag operations
     */
    finalizeOverscrollDrag(deltaY) {
        this.container.classList.remove('overscroll-feedback');
        this.container.style.removeProperty('--overscroll-offset');
    }
    
    /**
     * Reset all gesture state
     */
    resetGestureState() {
        // Reset all gesture flags and state
        this.gestureState = {
            isDragging: false,
            isHeaderDragging: false,
            isEnhancedDragging: false,
            isOverscrollDragging: false,
            isSwipeDragging: false,
            initialTouchY: 0,
            initialTouchX: 0,
            currentTouchY: 0,
            currentTouchX: 0,
            dragStartTime: 0,
            lastTouchY: 0,
            velocity: 0,
            maxDragOffset: 0,
            swipeDirection: null,
            dragType: null
        };
        
        // Reset old drag state
        this.state.isDragging = false;
        this.state.initialTouchY = 0;
        
        // Remove all gesture classes
        if (this.container) {
            this.container.classList.remove(
                'dragging', 'drag-feedback', 'enhanced-drag-feedback',
                'overscroll-feedback', 'swipe-feedback', 'swipe-left', 'swipe-right',
                'enhanced-drag-ready', 'enhanced-dragging'
            );
        }
    }

    /**
     * Update responsive state based on window size
     */
    updateResponsiveState() {
        const wasMobile = this.state.isMobile;
        this.state.isMobile = window.innerWidth <= 768;
        
        if (wasMobile !== this.state.isMobile) {
            this.logger.log('Device type changed to:', this.state.isMobile ? 'mobile' : 'desktop');
            this.updateContainerState();
            
            // Notify active module of device change
            if (this.activeModule && typeof this.activeModule.onDeviceChange === 'function') {
                this.activeModule.onDeviceChange(this.state.isMobile);
            }
        }
    }

    /**
     * Update container visual state with enhanced animation support
     */
    updateContainerState() {
        if (!this.container) {
            this.logger.warn('Cannot update container state - container does not exist');
            return;
        }
        
        // Cancel any pending animation
        if (this.state.animationFrame) {
            cancelAnimationFrame(this.state.animationFrame);
            this.state.animationFrame = null;
        }
        
        // Use requestAnimationFrame for smooth state updates
        this.state.animationFrame = requestAnimationFrame(() => {
            // Update container classes
            this.container.classList.toggle('mobile', this.state.isMobile);
            this.container.classList.toggle('desktop', !this.state.isMobile);
            this.container.classList.toggle('open', this.state.isOpen);
            this.container.classList.toggle('expanded', this.state.isExpanded);
            
            // Debug logging for mobile visibility
            if (this.state.isMobile) {
                this.logger.log('Mobile container state updated:', {
                    classes: this.container.className,
                    isOpen: this.state.isOpen,
                    isExpanded: this.state.isExpanded,
                    computedTransform: window.getComputedStyle(this.container).transform
                });
            }
            
            this.state.animationFrame = null;
        });
        
        // Header visibility is always maintained as it serves as both header and handle
    }

    /**
     * Enhanced animation method for smooth state transitions
     */
    animateStateTransition(targetState, callback) {
        if (this.state.isAnimating) {
            return Promise.resolve(); // Skip if already animating
        }

        return new Promise((resolve) => {
            this.state.isAnimating = true;
            
            // Add preparation class for optimized rendering
            this.container.classList.add('state-change-preparing');
            
            // Use double RAF for better timing
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Remove preparation class and apply target state
                    this.container.classList.remove('state-change-preparing');
                    
                    // Apply animation state classes for enhanced performance
                    if (targetState.isExpanded && !this.state.isExpanded) {
                        this.container.classList.add('expanding');
                    } else if (!targetState.isExpanded && this.state.isExpanded) {
                        this.container.classList.add('collapsing');
                    }
                    
                    // Update state
                    Object.assign(this.state, targetState);
                    this.updateContainerState();
                    
                    // Execute callback if provided
                    if (callback) callback();
                    
                    // Clean up animation classes after transition
                    const transitionDuration = this.state.isMobile ? 400 : 300; // Match CSS transition duration
                    setTimeout(() => {
                        this.container.classList.remove('expanding', 'collapsing');
                        this.state.isAnimating = false;
                        resolve();
                    }, transitionDuration);
                });
            });
        });
    }

    /**
     * Register a module class for dynamic loading
     */
    registerModule(moduleId, moduleClass) {
        this.moduleRegistry.set(moduleId, moduleClass);
        this.logger.log(`Module '${moduleId}' registered`);
    }

    /**
     * Load and display a module
     */
    async loadModule(moduleId, params = {}) {
        try {
            const ModuleClass = this.moduleRegistry.get(moduleId);
            if (!ModuleClass) {
                throw new Error(`Module '${moduleId}' not found in registry`);
            }
            
            this.logger.log(`Loading module: ${moduleId}`, params);
            
            // Unload current module
            if (this.activeModule) {
                this.unloadActiveModule();
            }
            
            // Create new module instance
            this.activeModule = new ModuleClass(params);
            this.activeModuleId = moduleId;
            
            // Update title
            const title = params.title || moduleId;
            this.setTitle(title);
            
            // Render module content
            await this.activeModule.render(this.contentElement, params);
            
            // Configure bottom sheet based on module preferences
            if (this.activeModule.peekHeight) {
                this.state.currentHeight = this.activeModule.peekHeight;
            }
            
            // Open bottom sheet
            this.open();
            
            this.logger.log(`Module '${moduleId}' loaded successfully`);
            return true;
            
        } catch (error) {
            this.logger.error(`Failed to load module '${moduleId}':`, error);
            throw error;
        }
    }

    /**
     * Unload active module
     */
    unloadActiveModule() {
        if (this.activeModule) {
            this.logger.log(`Unloading module: ${this.activeModuleId}`);
            
            // Call module destroy method
            if (typeof this.activeModule.destroy === 'function') {
                this.activeModule.destroy();
            }
            
            // Reset form renderer storage when switching modules
            this.resetFormRenderer();
            
            // Clear content
            this.contentElement.innerHTML = '';
            
            // Reset state
            this.activeModule = null;
            this.activeModuleId = null;
        }
    }

    /**
     * Set bottom sheet title (legacy method for backward compatibility)
     */
    setTitle(title) {
        const titleElement = document.getElementById('bottomSheetTitle');
        if (titleElement) {
            titleElement.textContent = title;
        }
        
        // Clear dynamic content when using legacy title
        this.clearDynamicHeader();
    }

    /**
     * Update header with dynamic workflow data
     */
    updateHeaderData(headerData = {}) {
        // Update title
        if (headerData.title) {
            this.setTitle(headerData.title);
        }
        
        // Update subtitle with creation date and creator
        const subtitleElement = document.getElementById('bottomSheetSubtitle');
        if (subtitleElement && headerData.createdAt) {
            const formattedDate = new Date(headerData.createdAt).toLocaleDateString('de-DE');
            const creatorText = headerData.createdBy ? ` • ${headerData.createdBy}` : '';
            subtitleElement.textContent = `${formattedDate}${creatorText}`;
            subtitleElement.style.display = 'block';
        }
        
        // Update stage info
        const stageElement = document.getElementById('bottomSheetStage');
        if (stageElement && headerData.currentStage && headerData.totalStages) {
            stageElement.textContent = `Stage ${headerData.currentStage}/${headerData.totalStages}`;
            stageElement.style.display = 'inline-block';
        } else if (stageElement) {
            stageElement.style.display = 'none';
        }
    }

    /**
     * Clear dynamic header content
     */
    clearDynamicHeader() {
        const subtitleElement = document.getElementById('bottomSheetSubtitle');
        const stageElement = document.getElementById('bottomSheetStage');
        
        if (subtitleElement) {
            subtitleElement.textContent = '';
            subtitleElement.style.display = 'none';
        }
        
        if (stageElement) {
            stageElement.textContent = '';
            stageElement.style.display = 'none';
        }
    }

    /**
     * Update header with workflow instance data
     * @param {string} workflowInstanceId - UUID of the workflow instance
     */
    async updateHeaderWithWorkflowData(workflowInstanceId) {
        if (!workflowInstanceId) {
            this.logger.warn('No workflow instance ID provided for header update');
            return;
        }

        try {
            this.logger.log(`Updating header with workflow instance: ${workflowInstanceId}`);
            
            // Fetch workflow instance data
            const headerData = await workflowInstanceService.getInstanceHeaderData(workflowInstanceId);
            const displayTexts = workflowInstanceService.getHeaderDisplayTexts(headerData);
            
            // Update header elements
            this.setDynamicHeader(displayTexts);
            
            this.logger.log('Header updated successfully with workflow data');
            
        } catch (error) {
            this.logger.error('Failed to update header with workflow data:', error);
            // Fallback to generic header
            this.setTitle('Workflow Instance');
        }
    }

    /**
     * Set dynamic header content
     * @param {Object} displayTexts - Formatted display texts
     */
    setDynamicHeader(displayTexts) {
        const titleElement = document.getElementById('bottomSheetTitle');
        const subtitleElement = document.getElementById('bottomSheetSubtitle');
        const stageElement = document.getElementById('bottomSheetStage');
        
        if (titleElement && displayTexts.title) {
            titleElement.textContent = displayTexts.title;
        }
        
        if (subtitleElement && displayTexts.subtitle) {
            subtitleElement.textContent = displayTexts.subtitle;
            subtitleElement.style.display = 'block';
        }
        
        if (stageElement && displayTexts.stageText) {
            stageElement.textContent = displayTexts.stageText;
            stageElement.style.display = 'block';
        }
        
        // Add class to indicate dynamic header is active
        if (this.container) {
            this.container.classList.add('has-dynamic-header');
        }
    }

    /**
     * Clear dynamic header content and return to simple title
     */
    clearDynamicHeader() {
        const subtitleElement = document.getElementById('bottomSheetSubtitle');
        const stageElement = document.getElementById('bottomSheetStage');
        
        if (subtitleElement) {
            subtitleElement.textContent = '';
            subtitleElement.style.display = 'none';
        }
        
        if (stageElement) {
            stageElement.textContent = '';
            stageElement.style.display = 'none';
        }
        
        // Remove dynamic header class
        if (this.container) {
            this.container.classList.remove('has-dynamic-header');
        }
    }

    /**
     * Open bottom sheet
     */
    open() {
        this.state.isOpen = true;
        this.updateContainerState();
        
        // Auto-expand on desktop, peek on mobile
        if (!this.state.isMobile) {
            this.state.isExpanded = true;
        } else {
            this.state.isExpanded = false;
        }
        
        this.updateContainerState();
        
        // Debug logging for mobile visibility issue
        this.logger.log('Opening bottom sheet:', {
            isOpen: this.state.isOpen,
            isMobile: this.state.isMobile,
            isExpanded: this.state.isExpanded,
            containerClasses: this.container?.className,
            containerExists: !!this.container
        });
        
        // Notify module
        if (this.activeModule && typeof this.activeModule.onOpen === 'function') {
            this.activeModule.onOpen();
        }
        
        // Emit event
        window.dispatchEvent(new CustomEvent('bottom-sheet:opened', {
            detail: { moduleId: this.activeModuleId }
        }));
        
        this.logger.log('Opened');
    }

    /**
     * Close bottom sheet
     */
    close() {
        // Check if closing is prevented (e.g., during location updates)
        if (this.preventClose) {
            this.logger.log('Close prevented by preventClose flag');
            return;
        }
        
        this.state.isOpen = false;
        this.state.isExpanded = false;
        this.updateContainerState();
        
        // Notify module
        if (this.activeModule && typeof this.activeModule.onClose === 'function') {
            this.activeModule.onClose();
        }
        
        // Reset form renderer storage to ensure fresh forms for new workflows
        this.resetFormRenderer();
        
        // Emit event
        window.dispatchEvent(new CustomEvent('bottom-sheet:closed', {
            detail: { moduleId: this.activeModuleId }
        }));
        
        this.logger.log('Closed');
    }

    /**
     * Reset form renderer storage for fresh workflows
     */
    async resetFormRenderer() {
        try {
            // Dynamically import form renderer to avoid circular imports
            const { formRenderer } = await import('../forms/form-renderer.js');
            formRenderer.resetForNewInstance();
            this.logger.log('Form renderer storage reset for fresh workflow');
        } catch (error) {
            this.logger.error('Failed to reset form renderer:', error);
        }
    }

    /**
     * Toggle expanded state (mobile only)
     */
    toggleExpanded() {
        if (!this.state.isMobile || !this.state.isOpen) return;
        
        if (this.state.isExpanded) {
            this.collapse();
        } else {
            this.expand();
        }
    }

    /**
     * Expand bottom sheet (mobile) with enhanced CSS-only animation
     */
    expand() {
        if (!this.state.isMobile || this.state.isExpanded) return;
        
        // Simple state change - CSS handles the animation
        this.state.isExpanded = true;
        this.updateContainerState();
        
        // Notify module
        if (this.activeModule && typeof this.activeModule.onExpand === 'function') {
            this.activeModule.onExpand();
        }
        
        this.logger.log('Expanded with CSS animation');
    }

    /**
     * Collapse bottom sheet to peek state (mobile) with enhanced CSS-only animation
     */
    collapse() {
        if (!this.state.isMobile || !this.state.isExpanded) return;
        
        // Simple state change - CSS handles the animation  
        this.state.isExpanded = false;
        this.updateContainerState();
        
        // Notify module
        if (this.activeModule && typeof this.activeModule.onCollapse === 'function') {
            this.activeModule.onCollapse();
        }
        
        this.logger.log('Collapsed to peek with CSS animation');
    }

    /**
     * Check if bottom sheet is open
     */
    isOpen() {
        return this.state.isOpen;
    }

    /**
     * Check if bottom sheet is expanded (mobile)
     */
    isExpanded() {
        return this.state.isExpanded;
    }

    /**
     * Get active module information
     */
    getActiveModule() {
        return {
            id: this.activeModuleId,
            instance: this.activeModule
        };
    }

    /**
     * Coordinate with browser gesture blocker for enhanced touch handling
     */
    coordinateWithGestureBlocker() {
        try {
            // Wait for BrowserGestureBlocker to be available
            if (!browserGestureBlocker) {
                this.logger.warn('Browser gesture blocker not available, retrying...');
                setTimeout(() => this.coordinateWithGestureBlocker(), 100);
                return;
            }
            
            // Initialize gesture blocker if not already active
            if (!browserGestureBlocker.isGestureBlockingActive()) {
                const initialized = browserGestureBlocker.initialize();
                if (!initialized) {
                    this.logger.warn('Browser gesture blocker failed to initialize, continuing without it');
                    return;
                }
            }
            
            this.logger.log('Coordinating bottom sheet gestures with BrowserGestureBlocker');
            
            // Add bottom sheet-specific gesture allowance to the gesture blocker
            if (browserGestureBlocker.shouldAllowGestures) {
                const originalShouldAllowGestures = browserGestureBlocker.shouldAllowGestures;
                
                browserGestureBlocker.shouldAllowGestures = (element) => {
                    // Check original allowed selectors first
                    if (originalShouldAllowGestures.call(browserGestureBlocker, element)) {
                        return true;
                    }
                    
                    // Add bottom sheet-specific allowances
                    const bottomSheetAllowedSelectors = [
                        '.bottom-sheet-header',
                        '.bottom-sheet-content',
                        '.bottom-sheet-close',
                        '#bottomSheetContainer',
                        '#bottomSheetContent'
                    ];
                    
                    return bottomSheetAllowedSelectors.some(selector => {
                        return element.matches && element.matches(selector) || 
                               element.closest && element.closest(selector);
                    });
                };
            }
            
            // Ensure bottom sheet content is properly configured for touch
            if (this.contentElement) {
                // Apply CSS properties programmatically to ensure they take effect
                this.contentElement.style.touchAction = 'pan-y';
                this.contentElement.style.overscrollBehaviorX = 'none';
                this.contentElement.style.overscrollBehaviorY = 'contain';
                this.contentElement.style.webkitOverflowScrolling = 'touch';
            }
            
            // Ensure bottom sheet header allows touch for dragging
            if (this.handleElement) {
                this.handleElement.style.touchAction = 'none';
                this.handleElement.style.overscrollBehavior = 'none';
            }
            
            this.logger.log('Successfully coordinated with browser gesture blocker');
        } catch (error) {
            this.logger.error('Failed to coordinate with gesture blocker:', error);
        }
    }

    /**
     * Setup swipe navigation for horizontal marker cycling
     */
    setupSwipeNavigation() {
        if (!this.state.isMobile) return;
        
        const sidebarContent = this.contentElement;
        if (!sidebarContent) return;
        
        this.addSwipeNavigationListeners(sidebarContent);
    }
    
    addSwipeNavigationListeners(sidebarContent) {
        const swipeStart = (e) => {
            // Only handle swipes in peek mode and when a module is active
            if (this.state.isExpanded) return;
            if (!this.activeModule) return;
            
            // Get first touch point
            const touch = e.touches[0];
            this.swipeState = {
                startX: touch.clientX,
                startY: touch.clientY,
                startTime: Date.now(),
                isHorizontalSwipe: false,
                direction: null
            };
        };
        
        const swipeMove = (e) => {
            if (!this.swipeState || this.state.isExpanded) return;
            
            const touch = e.touches[0];
            const deltaX = touch.clientX - this.swipeState.startX;
            const deltaY = touch.clientY - this.swipeState.startY;
            
            // Determine if this is a horizontal swipe
            if (!this.swipeState.isHorizontalSwipe && Math.abs(deltaX) > 10) {
                if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
                    this.swipeState.isHorizontalSwipe = true;
                    this.swipeState.direction = deltaX > 0 ? 'right' : 'left';
                    // Prevent vertical scrolling when horizontal swipe is detected
                    e.preventDefault();
                }
            }
            
            // Apply visual feedback for horizontal swipes
            if (this.swipeState.isHorizontalSwipe && Math.abs(deltaX) > 50) {
                this.applySwipeVisualFeedback(deltaX);
            }
        };
        
        const swipeEnd = (e) => {
            if (!this.swipeState) return;
            
            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - this.swipeState.startX;
            const swipeDuration = Date.now() - this.swipeState.startTime;
            
            // Clear visual feedback
            this.clearSwipeVisualFeedback();
            
            // Check if this was a valid horizontal swipe
            if (this.swipeState.isHorizontalSwipe && 
                Math.abs(deltaX) > 80 && 
                swipeDuration < 500) {
                
                if (deltaX > 0) {
                    // Right swipe - previous marker
                    this.handleSwipeNavigation('right');
                } else {
                    // Left swipe - next marker  
                    this.handleSwipeNavigation('left');
                }
            }
            
            // Reset swipe state
            this.swipeState = null;
        };
        
        // Add event listeners
        eventManager.add(sidebarContent, 'touchstart', swipeStart, {
            component: 'bottom-sheet',
            description: 'Swipe navigation start',
            passive: false
        });
        
        eventManager.add(sidebarContent, 'touchmove', swipeMove, {
            component: 'bottom-sheet',
            description: 'Swipe navigation move',
            passive: false
        });
        
        eventManager.add(sidebarContent, 'touchend', swipeEnd, {
            component: 'bottom-sheet',
            description: 'Swipe navigation end',
            passive: false
        });
    }
    
    /**
     * Apply swipe visual feedback
     */
    applySwipeVisualFeedback(deltaX) {
        if (!this.container) return;
        
        const direction = deltaX > 0 ? 'right' : 'left';
        this.container.classList.add('swipe-feedback', `swipe-${direction}`);
        
        // Apply a subtle transform
        const clampedOffset = Math.max(-50, Math.min(50, deltaX * 0.1));
        this.container.style.setProperty('--swipe-offset', `${clampedOffset}px`);
    }
    
    /**
     * Clear swipe visual feedback
     */
    clearSwipeVisualFeedback() {
        if (!this.container) return;
        
        this.container.classList.remove('swipe-feedback', 'swipe-left', 'swipe-right');
        this.container.style.removeProperty('--swipe-offset');
    }
    
    /**
     * Handle swipe navigation
     */
    handleSwipeNavigation(direction) {
        if (this.activeModule && typeof this.activeModule.handleSwipeNavigation === 'function') {
            this.activeModule.handleSwipeNavigation(direction);
        }
        
        // Also emit event for other components to handle
        window.dispatchEvent(new CustomEvent('bottom-sheet:swipe-navigation', {
            detail: { direction, moduleId: this.activeModuleId }
        }));
        
        this.logger.log(`Swipe navigation: ${direction}`);
    }

    /**
     * Enhanced cleanup method with animation frame cleanup
     */
    destroy() {
        // Cancel any pending animation frames
        if (this.state.animationFrame) {
            cancelAnimationFrame(this.state.animationFrame);
            this.state.animationFrame = null;
        }
        
        if (this.state.dragFeedbackFrame) {
            cancelAnimationFrame(this.state.dragFeedbackFrame);
            this.state.dragFeedbackFrame = null;
        }
        
        if (this.state.overscrollAnimationFrame) {
            cancelAnimationFrame(this.state.overscrollAnimationFrame);
            this.state.overscrollAnimationFrame = null;
        }
        
        // Reset will-change properties to free up GPU resources
        if (this.container) {
            this.container.style.willChange = 'auto';
        }
        
        // Unload active module
        this.unloadActiveModule();
        
        // Remove container from DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // Clear references
        this.container = null;
        this.contentElement = null;
        this.handleElement = null;
        this.moduleRegistry.clear();
        this.swipeState = null;
        
        // Reset animation state
        this.state.isAnimating = false;
        
        this.logger.log('Destroyed with enhanced cleanup');
    }
}

/**
 * Base class for bottom sheet modules
 */
export class BottomSheetModule {
    constructor(options = {}) {
        this.id = options.id || 'unknown-module';
        this.title = options.title || 'Module';
        this.container = null;
        
        // Mobile configuration
        this.peekHeight = options.peekHeight || 0.3;
        this.expandedHeight = options.expandedHeight || 0.7;
        
        this.logger = new DebugLogger(`BottomSheetModule-${this.id}`);
        this.logger.log(`${this.id} created`);
    }

    /**
     * Render module content - override in subclasses
     */
    async render(container, params = {}) {
        this.container = container;
        container.innerHTML = `
            <div class="module-content">
                <p>Module: ${this.id}</p>
                <p>Override render() method in subclass</p>
            </div>
        `;
    }

    /**
     * Lifecycle hooks - override in subclasses
     */
    onOpen() {}
    onClose() {}
    onExpand() {}
    onCollapse() {}
    onDeviceChange(isMobile) {}

    /**
     * Cleanup method - override and extend in subclasses
     */
    destroy() {
        this.container = null;
        this.logger.log(`${this.id} destroyed`);
    }
}

// Create and export singleton instance
export const bottomSheet = new BottomSheetContainer();