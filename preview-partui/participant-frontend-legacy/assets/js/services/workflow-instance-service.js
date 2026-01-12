/**
 * Workflow Instance Service
 * 
 * Service for fetching workflow instance data needed for dynamic headers
 * and other UI components that need workflow context
 */

import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js@2';
import { config } from '../core/config.js';
import DebugLogger from '../core/debug-logger.js';

export class WorkflowInstanceService {
    constructor() {
        this.logger = new DebugLogger('WorkflowInstanceService');
        this.supabase = createClient(config.participant.supabase.url, config.participant.supabase.key);
    }

    /**
     * Get workflow instance header data for display
     * @param {string} workflowInstanceId - UUID of the workflow instance
     * @returns {Promise<Object>} Header data with stage info, date, and creator
     */
    async getInstanceHeaderData(workflowInstanceId) {
        try {
            this.logger.log(`Fetching header data for instance: ${workflowInstanceId}`);

            const { data, error } = await this.supabase
                .from('workflow_instances')
                .select(`
                    id,
                    title,
                    created_at,
                    created_by,
                    current_stage_id,
                    workflow_id,
                    status,
                    current_stage:workflow_stages!workflow_instances_current_stage_id_fkey (
                        stage_order,
                        stage_name
                    ),
                    creator:participants!workflow_instances_created_by_fkey (
                        name
                    ),
                `)
                .eq('id', workflowInstanceId)
                .single();

            if (error) {
                this.logger.error('Error fetching workflow instance:', error);
                throw error;
            }

            if (!data) {
                throw new Error(`Workflow instance ${workflowInstanceId} not found`);
            }

            // Get total stage count for this workflow
            const { data: stageCount, error: stageError } = await this.supabase
                .from('workflow_stages')
                .select('id', { count: 'exact' })
                .eq('workflow_id', data.workflow_id);

            if (stageError) {
                this.logger.error('Error fetching stage count:', stageError);
                throw stageError;
            }

            const totalStages = stageCount?.length || 0;
            const currentStage = data.current_stage?.stage_order || 1;

            // Format the response
            const headerData = {
                id: data.id,
                title: data.title,
                workflowName: 'Workflow',
                stageProgress: {
                    current: currentStage,
                    total: totalStages,
                    stageName: data.current_stage?.stage_name || 'Unknown Stage'
                },
                createdDate: new Date(data.created_at),
                creatorName: data.creator?.name || 'Unknown User',
                status: data.status
            };

            this.logger.log('Header data fetched successfully:', headerData);
            return headerData;

        } catch (error) {
            this.logger.error('Failed to fetch workflow instance header data:', error);
            throw error;
        }
    }

    /**
     * Format date for display in header
     * @param {Date} date - Date to format
     * @returns {string} Formatted date string
     */
    formatHeaderDate(date) {
        if (!date || !(date instanceof Date)) {
            return 'Unknown Date';
        }

        const now = new Date();
        const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        // If today or yesterday, show relative time
        if (diffInDays === 0) {
            return 'Today';
        } else if (diffInDays === 1) {
            return 'Yesterday';
        } else if (diffInDays < 7) {
            return `${diffInDays} days ago`;
        } else {
            // Show actual date for older items
            return date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        }
    }

    /**
     * Get stage progress text (e.g., "Stage 3/4")
     * @param {Object} stageProgress - Stage progress object
     * @returns {string} Formatted stage progress
     */
    formatStageProgress(stageProgress) {
        if (!stageProgress || !stageProgress.current || !stageProgress.total) {
            return 'Stage ?/?';
        }
        
        return `Stage ${stageProgress.current}/${stageProgress.total}`;
    }

    /**
     * Get full header display text
     * @param {Object} headerData - Complete header data object
     * @returns {Object} Formatted display texts
     */
    getHeaderDisplayTexts(headerData) {
        if (!headerData) {
            return {
                title: 'Loading...',
                subtitle: '',
                stageText: ''
            };
        }

        return {
            title: headerData.title || 'Untitled',
            subtitle: `${this.formatHeaderDate(headerData.createdDate)} • ${headerData.creatorName}`,
            stageText: this.formatStageProgress(headerData.stageProgress)
        };
    }
}

// Export singleton instance
export const workflowInstanceService = new WorkflowInstanceService();
export default workflowInstanceService;