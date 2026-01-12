/**
 * Workflow Stage Icon Designer Component
 * Adapts the SVG Icon Designer for workflow stages
 * Stores icon configuration in workflow_stages.visual_config field
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('WorkflowStageIconDesigner');

class WorkflowStageIconDesigner {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = {
            stageId: options.stageId || null,
            workflowId: options.workflowId || null,
            onSave: options.onSave || null,
            onCancel: options.onCancel || null,
            allowedSizes: options.allowedSizes || [16, 24, 32, 48, 64],
            defaultSize: options.defaultSize || 32,
            maxFileSize: options.maxFileSize || 50000, // 50KB max
            ...options
        };
        
        this.currentConfig = {
            type: 'svg',
            svgContent: null,
            style: {
                color: '#2563eb',
                backgroundColor: '#ffffff',
                borderColor: '#e2e8f0',
                borderWidth: 2,
                size: this.options.defaultSize,
                shape: 'circle',
                shadow: false
            },
            metadata: {}
        };
        
        this.svgPreview = null;
    }
    
    /**
     * Render the workflow stage icon designer interface
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            logger.error(`Container ${this.containerId} not found`);
            return;
        }
        
        container.innerHTML = `
            <div class="workflow-stage-icon-designer">
                <div class="designer-header">
                    <div class="header-content">
                        <div class="header-text">
                            <h3>Stage Icon Designer</h3>
                            <p>Upload and customize an SVG icon for this workflow stage</p>
                        </div>
                        <div class="icon-preview-corner" id="stage-icon-preview-corner">
                            <div class="corner-icon" id="stage-corner-icon">
                                <span class="placeholder-icon">⚙️</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="designer-content">
                    <!-- SVG Input Section -->
                    <div class="design-section">
                        <h4>SVG Input</h4>
                        
                        <!-- Input Method Toggle -->
                        <div class="input-method-toggle">
                            <label class="toggle-option">
                                <input type="radio" name="stage-input-method" value="upload" checked>
                                <span>Upload File</span>
                            </label>
                            <label class="toggle-option">
                                <input type="radio" name="stage-input-method" value="paste">
                                <span>Paste Code</span>
                            </label>
                        </div>
                        
                        <!-- File Upload Section -->
                        <div class="input-section" id="stage-upload-section">
                            <div class="svg-upload-area" id="stage-svg-upload-area">
                                <input type="file" id="stage-svg-file-input" accept=".svg,image/svg+xml" style="display: none;">
                                <div class="upload-placeholder">
                                    <div class="upload-icon">📁</div>
                                    <p>Click to upload SVG file or drag & drop</p>
                                    <small>Max size: ${Math.round(this.options.maxFileSize / 1024)}KB</small>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Code Input Section -->
                        <div class="input-section" id="stage-paste-section" style="display: none;">
                            <div class="svg-code-input">
                                <textarea id="stage-svg-code-input" placeholder="Paste your SVG code here...
Example:
<svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
  <path d='M12 2L2 7V10C2 16 6 20.5 12 22C18 20.5 22 16 22 10V7L12 2Z' stroke='currentColor' stroke-width='2' stroke-linejoin='round'/>
</svg>" rows="8"></textarea>
                                <div class="code-actions">
                                    <button type="button" class="btn btn-sm btn-secondary" id="stage-clear-code-btn">Clear</button>
                                    <button type="button" class="btn btn-sm btn-primary" id="stage-apply-code-btn">Apply SVG</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="svg-info" id="stage-svg-info" style="display: none;"></div>
                    </div>
                    
                    <!-- Style Configuration Section -->
                    <div class="design-section">
                        <details class="style-accordion">
                            <summary class="accordion-header">
                                <h4>Style Configuration</h4>
                                <span class="accordion-arrow">▸</span>
                            </summary>
                            <div class="accordion-content">
                                <div class="style-controls">
                                    <div class="control-row">
                                        <label>Icon Color:</label>
                                        <input type="color" id="stage-icon-color" value="${this.currentConfig.style.color}">
                                    </div>
                                    <div class="control-row">
                                        <label>Background Color:</label>
                                        <input type="color" id="stage-bg-color" value="${this.currentConfig.style.backgroundColor}">
                                    </div>
                                    <div class="control-row">
                                        <label>Border Color:</label>
                                        <input type="color" id="stage-border-color" value="${this.currentConfig.style.borderColor}">
                                    </div>
                                    <div class="control-row">
                                        <label>Border Width:</label>
                                        <input type="range" id="stage-border-width" min="0" max="5" value="${this.currentConfig.style.borderWidth}">
                                        <span id="stage-border-width-value">${this.currentConfig.style.borderWidth}px</span>
                                    </div>
                                    <div class="control-row">
                                        <label>Size:</label>
                                        <select id="stage-icon-size">
                                            ${this.options.allowedSizes.map(size => 
                                                `<option value="${size}" ${size === this.currentConfig.style.size ? 'selected' : ''}>${size}px</option>`
                                            ).join('')}
                                        </select>
                                    </div>
                                    <div class="control-row">
                                        <label>Shape:</label>
                                        <select id="stage-icon-shape">
                                            <option value="circle" ${this.currentConfig.style.shape === 'circle' ? 'selected' : ''}>Circle</option>
                                            <option value="square" ${this.currentConfig.style.shape === 'square' ? 'selected' : ''}>Square</option>
                                            <option value="rounded" ${this.currentConfig.style.shape === 'rounded' ? 'selected' : ''}>Rounded</option>
                                            <option value="rounded-lg" ${this.currentConfig.style.shape === 'rounded-lg' ? 'selected' : ''}>Rounded Large</option>
                                            <option value="hexagon" ${this.currentConfig.style.shape === 'hexagon' ? 'selected' : ''}>Hexagon</option>
                                            <option value="diamond" ${this.currentConfig.style.shape === 'diamond' ? 'selected' : ''}>Diamond</option>
                                            <option value="star" ${this.currentConfig.style.shape === 'star' ? 'selected' : ''}>Star</option>
                                            <option value="shield" ${this.currentConfig.style.shape === 'shield' ? 'selected' : ''}>Shield</option>
                                            <option value="none" ${this.currentConfig.style.shape === 'none' ? 'selected' : ''}>No Background</option>
                                        </select>
                                    </div>
                                    <div class="control-row">
                                        <label>
                                            <input type="checkbox" id="stage-icon-shadow" ${this.currentConfig.style.shadow ? 'checked' : ''}>
                                            Drop Shadow
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>
                
                <div class="designer-footer">
                    <button class="btn btn-secondary" id="stage-cancel-btn">Cancel</button>
                    <button class="btn btn-primary" id="stage-save-btn" disabled>Save Stage Icon</button>
                </div>
            </div>
        `;
        
        this.setupEventListeners();
        this.updatePreview();
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const container = document.getElementById(this.containerId);
        
        // Input Method Toggle
        const inputMethodRadios = container.querySelectorAll('input[name="stage-input-method"]');
        inputMethodRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.toggleInputMethod(e.target.value);
            });
        });
        
        // SVG Upload
        const uploadArea = container.querySelector('#stage-svg-upload-area');
        const fileInput = container.querySelector('#stage-svg-file-input');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileUpload(files[0]);
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0]);
            }
        });
        
        // SVG Code Input
        const applyCodeBtn = container.querySelector('#stage-apply-code-btn');
        const clearCodeBtn = container.querySelector('#stage-clear-code-btn');
        const svgCodeInput = container.querySelector('#stage-svg-code-input');
        
        applyCodeBtn.addEventListener('click', () => {
            this.handleCodeInput();
        });
        
        clearCodeBtn.addEventListener('click', () => {
            svgCodeInput.value = '';
            this.clearSVGContent();
        });
        
        // Auto-apply on code change (with debounce)
        let codeInputTimeout;
        svgCodeInput.addEventListener('input', () => {
            clearTimeout(codeInputTimeout);
            codeInputTimeout = setTimeout(() => {
                const code = svgCodeInput.value.trim();
                if (code && code.includes('<svg')) {
                    this.handleCodeInput(false); // Don't show success message for auto-apply
                }
            }, 500);
        });
        
        // Style Controls
        container.querySelector('#stage-icon-color').addEventListener('input', (e) => {
            this.currentConfig.style.color = e.target.value;
            this.updatePreview();
        });
        
        container.querySelector('#stage-bg-color').addEventListener('input', (e) => {
            this.currentConfig.style.backgroundColor = e.target.value;
            this.updatePreview();
        });
        
        container.querySelector('#stage-border-color').addEventListener('input', (e) => {
            this.currentConfig.style.borderColor = e.target.value;
            this.updatePreview();
        });
        
        container.querySelector('#stage-border-width').addEventListener('input', (e) => {
            this.currentConfig.style.borderWidth = parseInt(e.target.value);
            container.querySelector('#stage-border-width-value').textContent = `${e.target.value}px`;
            this.updatePreview();
        });
        
        container.querySelector('#stage-icon-size').addEventListener('change', (e) => {
            this.currentConfig.style.size = parseInt(e.target.value);
            this.updatePreview();
        });
        
        container.querySelector('#stage-icon-shape').addEventListener('change', (e) => {
            this.currentConfig.style.shape = e.target.value;
            this.updatePreview();
        });
        
        container.querySelector('#stage-icon-shadow').addEventListener('change', (e) => {
            this.currentConfig.style.shadow = e.target.checked;
            this.updatePreview();
        });
        
        // Action buttons
        container.querySelector('#stage-cancel-btn').addEventListener('click', () => {
            if (this.options.onCancel) {
                this.options.onCancel();
            }
        });
        
        container.querySelector('#stage-save-btn').addEventListener('click', () => {
            this.saveStageIconConfiguration();
        });
    }
    
    /**
     * Toggle input method between upload and paste
     */
    toggleInputMethod(method) {
        const uploadSection = document.querySelector('#stage-upload-section');
        const pasteSection = document.querySelector('#stage-paste-section');
        
        if (method === 'paste') {
            uploadSection.style.display = 'none';
            pasteSection.style.display = 'block';
        } else {
            uploadSection.style.display = 'block';
            pasteSection.style.display = 'none';
        }
    }
    
    /**
     * Handle SVG code input from textarea
     */
    async handleCodeInput(showMessage = true) {
        const svgCodeInput = document.querySelector('#stage-svg-code-input');
        const svgContent = svgCodeInput.value.trim();
        
        if (!svgContent) {
            if (showMessage) {
                alert('Please enter SVG code.');
            }
            this.clearSVGContent();
            return;
        }
        
        logger.log('Handling stage SVG code input');
        
        try {
            const isValid = await this.validateSVG(svgContent);
            
            if (!isValid) {
                if (showMessage) {
                    alert('Invalid SVG code. Please check the format.');
                }
                return;
            }
            
            this.clearPreviousState();
            
            this.currentConfig.svgContent = svgContent;
            this.currentConfig.metadata = {
                filename: 'pasted-svg.svg',
                uploadDate: new Date().toISOString(),
                fileSize: new Blob([svgContent]).size,
                source: 'code-input'
            };
            
            this.updateSVGInfoFromCode(svgContent);
            this.updatePreview();
            
            document.querySelector('#stage-save-btn').disabled = false;
            
            if (showMessage) {
                this.showSuccessMessage('SVG code applied successfully!');
            }
            
        } catch (error) {
            logger.error('Error processing stage SVG code:', error);
            if (showMessage) {
                alert('Error processing SVG code. Please try again.');
            }
        }
    }
    
    /**
     * Clear previous state before applying new content
     */
    clearPreviousState() {
        const cornerIcon = document.querySelector('#stage-corner-icon');
        
        if (cornerIcon) {
            cornerIcon.innerHTML = '<span class="placeholder-icon">⚙️</span>';
            cornerIcon.style.cssText = '';
        }
        
        setTimeout(() => {
            this.updatePreview();
        }, 10);
    }
    
    /**
     * Clear SVG content and reset UI
     */
    clearSVGContent() {
        this.currentConfig.svgContent = null;
        this.currentConfig.metadata = {};
        
        const infoDiv = document.querySelector('#stage-svg-info');
        if (infoDiv) {
            infoDiv.style.display = 'none';
        }
        
        document.querySelector('#stage-save-btn').disabled = true;
        
        this.updatePreview();
    }
    
    /**
     * Show success message
     */
    showSuccessMessage(message) {
        const infoDiv = document.querySelector('#stage-svg-info');
        if (infoDiv) {
            infoDiv.style.display = 'block';
            infoDiv.innerHTML = `
                <div class="svg-file-info success-message">
                    <span class="status success">✓ ${message}</span>
                </div>
            `;
            
            setTimeout(() => {
                if (infoDiv.querySelector('.success-message')) {
                    infoDiv.style.display = 'none';
                }
            }, 3000);
        }
    }
    
    /**
     * Update SVG info display for code input
     */
    updateSVGInfoFromCode(svgContent) {
        const infoDiv = document.querySelector('#stage-svg-info');
        const fileSize = new Blob([svgContent]).size;
        
        if (infoDiv) {
            infoDiv.style.display = 'block';
            infoDiv.innerHTML = `
                <div class="svg-file-info">
                    <strong>SVG Code (Pasted)</strong>
                    <small>${(fileSize / 1024).toFixed(1)}KB</small>
                    <span class="status success">✓ Valid SVG</span>
                </div>
            `;
        }
    }
    
    /**
     * Handle file upload
     */
    async handleFileUpload(file) {
        logger.log('Handling stage SVG file upload:', file.name);
        
        if (!file.type.includes('svg')) {
            alert('Please upload an SVG file.');
            return;
        }
        
        if (file.size > this.options.maxFileSize) {
            alert(`File too large. Maximum size is ${Math.round(this.options.maxFileSize / 1024)}KB.`);
            return;
        }
        
        try {
            const svgContent = await file.text();
            const isValid = await this.validateSVG(svgContent);
            
            if (!isValid) {
                alert('Invalid SVG file. Please check the file format.');
                return;
            }
            
            this.currentConfig.svgContent = svgContent;
            this.currentConfig.metadata = {
                filename: file.name,
                uploadDate: new Date().toISOString(),
                fileSize: file.size
            };
            
            this.updateSVGInfo(file);
            this.updatePreview();
            
            document.querySelector('#stage-save-btn').disabled = false;
            
        } catch (error) {
            logger.error('Error processing stage SVG file:', error);
            alert('Error processing SVG file. Please try again.');
        }
    }
    
    /**
     * Validate SVG content
     */
    async validateSVG(svgContent) {
        try {
            if (!svgContent.includes('<svg')) {
                return false;
            }
            
            const dangerousPatterns = [
                /<script/i,
                /javascript:/i,
                /onload=/i,
                /onerror=/i,
                /<iframe/i,
                /<object/i,
                /<embed/i
            ];
            
            const hasDangerousContent = dangerousPatterns.some(pattern => 
                pattern.test(svgContent)
            );
            
            if (hasDangerousContent) {
                alert('SVG contains potentially unsafe content. Please use a clean SVG file.');
                return false;
            }
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgContent, 'image/svg+xml');
            const parseError = doc.querySelector('parsererror');
            
            if (parseError) {
                logger.error('SVG parsing error:', parseError.textContent);
                return false;
            }
            
            return true;
        } catch (error) {
            logger.error('SVG validation error:', error);
            return false;
        }
    }
    
    /**
     * Update SVG info display
     */
    updateSVGInfo(file) {
        const infoDiv = document.querySelector('#stage-svg-info');
        if (infoDiv) {
            infoDiv.style.display = 'block';
            infoDiv.innerHTML = `
                <div class="svg-file-info">
                    <strong>${file.name}</strong>
                    <small>${(file.size / 1024).toFixed(1)}KB</small>
                    <span class="status success">✓ Valid SVG</span>
                </div>
            `;
        }
    }
    
    /**
     * Update preview with current configuration
     */
    updatePreview() {
        this.updateCornerPreview();
    }
    
    /**
     * Update corner icon preview
     */
    updateCornerPreview() {
        const cornerIcon = document.querySelector('#stage-corner-icon');
        if (!cornerIcon) return;
        
        const style = this.currentConfig.style;
        let iconHTML = '';
        
        if (this.currentConfig.svgContent) {
            iconHTML = this.currentConfig.svgContent.trim();
        } else {
            iconHTML = '<span class="placeholder-icon">⚙️</span>';
        }
        
        cornerIcon.innerHTML = '';
        cornerIcon.offsetHeight;
        cornerIcon.innerHTML = iconHTML;
        
        cornerIcon.setAttribute('data-shape', style.shape);
        
        const previewStyle = { ...style, size: 48 }; // Fixed 48px size for corner
        const css = this.generateIconCSS(previewStyle, 'corner');
        cornerIcon.style.cssText = css;
    }
    
    /**
     * Generate CSS for icon styling
     */
    generateIconCSS(style, context = 'stage') {
        let css = `
            width: ${style.size}px;
            height: ${style.size}px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        `;
        
        // Background and shape
        if (style.shape !== 'none') {
            switch (style.shape) {
                case 'circle':
                    css += `background-color: ${style.backgroundColor};`;
                    css += `border: ${style.borderWidth}px solid ${style.borderColor};`;
                    css += 'border-radius: 50%;';
                    break;
                case 'square':
                    css += `background-color: ${style.backgroundColor};`;
                    css += `border: ${style.borderWidth}px solid ${style.borderColor};`;
                    css += 'border-radius: 0;';
                    break;
                case 'rounded':
                    css += `background-color: ${style.backgroundColor};`;
                    css += `border: ${style.borderWidth}px solid ${style.borderColor};`;
                    css += 'border-radius: 8px;';
                    break;
                case 'rounded-lg':
                    css += `background-color: ${style.backgroundColor};`;
                    css += `border: ${style.borderWidth}px solid ${style.borderColor};`;
                    css += 'border-radius: 16px;';
                    break;
                case 'hexagon':
                    css += `background-color: ${style.backgroundColor};`;
                    css += `border: ${style.borderWidth}px solid ${style.borderColor};`;
                    css += `clip-path: polygon(30% 0%, 70% 0%, 100% 50%, 70% 100%, 30% 100%, 0% 50%);`;
                    break;
                case 'diamond':
                    css += `background-color: ${style.backgroundColor};`;
                    css += `border: ${style.borderWidth}px solid ${style.borderColor};`;
                    css += `transform: rotate(45deg);`;
                    css += `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);`;
                    break;
                case 'star':
                    css += `background-color: ${style.backgroundColor};`;
                    css += `border: ${style.borderWidth}px solid ${style.borderColor};`;
                    css += `clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);`;
                    break;
                case 'shield':
                    css += `background-color: ${style.backgroundColor};`;
                    css += `border: ${style.borderWidth}px solid ${style.borderColor};`;
                    css += `border-radius: 8px 8px 0 0;`;
                    css += `clip-path: polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%);`;
                    break;
                default:
                    css += `background-color: ${style.backgroundColor};`;
                    css += `border: ${style.borderWidth}px solid ${style.borderColor};`;
                    css += 'border-radius: 0;';
                    break;
            }
        }
        
        // Shadow
        if (style.shadow) {
            css += 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);';
        }
        
        // SVG specific styling
        if (this.currentConfig.svgContent) {
            css += `
                svg {
                    width: ${Math.round(style.size * 0.6)}px;
                    height: ${Math.round(style.size * 0.6)}px;
                    fill: ${style.color};
                }
            `;
        }
        
        return css;
    }
    
    /**
     * Save stage icon configuration to database
     */
    async saveStageIconConfiguration() {
        if (!this.options.stageId || !this.currentConfig.svgContent) {
            alert('Missing stage ID or SVG content.');
            return;
        }
        
        try {
            // Get current visual_config and merge with icon config
            const { data: currentStage } = await supabaseClient.client
                .from('workflow_stages')
                .select('visual_config')
                .eq('id', this.options.stageId)
                .single();
            
            const currentVisualConfig = currentStage?.visual_config || {};
            const updatedVisualConfig = {
                ...currentVisualConfig,
                icon: this.currentConfig
            };
            
            const { error } = await supabaseClient.client
                .from('workflow_stages')
                .update({ 
                    visual_config: updatedVisualConfig 
                })
                .eq('id', this.options.stageId);
            
            if (error) throw error;
            
            if (this.options.onSave) {
                this.options.onSave(this.currentConfig);
            }
            
            alert('Stage icon configuration saved successfully!');
            
        } catch (error) {
            logger.error('Error saving stage icon configuration:', error);
            alert('Failed to save stage icon configuration. Please try again.');
        }
    }
    
    /**
     * Load existing stage icon configuration
     */
    async loadConfiguration(stageId) {
        try {
            const { data } = await supabaseClient.client
                .from('workflow_stages')
                .select('visual_config')
                .eq('id', stageId)
                .single();
            
            if (data && data.visual_config && data.visual_config.icon) {
                this.currentConfig = { ...this.currentConfig, ...data.visual_config.icon };
                this.updateUIFromConfig();
                this.updatePreview();
            }
            
        } catch (error) {
            logger.error('Error loading stage icon configuration:', error);
        }
    }
    
    /**
     * Update UI controls from loaded configuration
     */
    updateUIFromConfig() {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        
        const style = this.currentConfig.style;
        
        container.querySelector('#stage-icon-color').value = style.color;
        container.querySelector('#stage-bg-color').value = style.backgroundColor;
        container.querySelector('#stage-border-color').value = style.borderColor;
        container.querySelector('#stage-border-width').value = style.borderWidth;
        container.querySelector('#stage-border-width-value').textContent = `${style.borderWidth}px`;
        container.querySelector('#stage-icon-size').value = style.size;
        container.querySelector('#stage-icon-shape').value = style.shape;
        container.querySelector('#stage-icon-shadow').checked = style.shadow;
        
        if (this.currentConfig.svgContent) {
            const svgCodeInput = container.querySelector('#stage-svg-code-input');
            if (svgCodeInput) {
                svgCodeInput.value = this.currentConfig.svgContent;
            }
            
            container.querySelector('#stage-save-btn').disabled = false;
            
            if (this.currentConfig.metadata) {
                this.updateSVGInfo({
                    name: this.currentConfig.metadata.filename || 'loaded-svg.svg',
                    size: this.currentConfig.metadata.fileSize || new Blob([this.currentConfig.svgContent]).size
                });
            }
        }
    }
    
    /**
     * Get rendered icon HTML for use in workflow display
     */
    getRenderedIcon(customStyle = null) {
        const style = customStyle || this.currentConfig.style;
        
        if (!this.currentConfig.svgContent) {
            return '<span class="default-stage-icon">⚙️</span>';
        }
        
        const css = this.generateIconCSS(style);
        
        return `
            <div class="workflow-stage-icon" style="${css}" data-shape="${style.shape}">
                ${this.currentConfig.svgContent}
            </div>
        `;
    }
}

export default WorkflowStageIconDesigner;