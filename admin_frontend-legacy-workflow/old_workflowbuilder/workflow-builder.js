/**
 * Workflow Builder Page Entry Point
 * Uses enhanced session-based architecture with backward compatibility
 */

// Import the enhanced workflow builder (default)
import WorkflowBuilderPage from './workflow-builder-enhanced.js';

// Export the enhanced version
// Note: Legacy imports removed to avoid circular dependencies
// To use legacy version, change the import above to './workflow-builder-ui.js'
// and add: import './workflow-builder-logic.js';
export default WorkflowBuilderPage;