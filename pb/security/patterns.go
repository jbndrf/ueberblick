package security

import (
	"github.com/pocketbase/pocketbase/core"
)

// AccessPatternChecker implements security checks for different access patterns
type AccessPatternChecker struct {
	helper        *SecurityHelper
	configManager *SecurityConfigManager
}

// NewAccessPatternChecker creates a new access pattern checker
func NewAccessPatternChecker(app core.App, configManager *SecurityConfigManager) *AccessPatternChecker {
	return &AccessPatternChecker{
		helper:        NewSecurityHelper(app),
		configManager: configManager,
	}
}

// CheckAdminOnly implements admin_only access pattern
func (c *AccessPatternChecker) CheckAdminOnly(
	ctx *AuthContext,
	config *TableSecurityConfig,
	recordData map[string]interface{},
	operation string,
	requiresWrite bool,
) bool {
	// Special case: self_read for participants
	if config.GetAdditionalConfigBool("self_read") {
		if ctx.IsParticipant && !requiresWrite {
			// Check if this is the participant's own record
			if participantID, ok := recordData["id"].(string); ok {
				if participantID == ctx.ParticipantID {
					return true
				}
			}
		}
	}

	// Must be admin
	if !ctx.IsAdmin {
		return false
	}

	// If there's a project column, verify project access
	if config.ProjectColumn != "" {
		projectID, err := c.getProjectID(config, recordData)
		if err != nil || projectID == "" {
			return false
		}

		return c.helper.HasProjectAccess(ctx, projectID, "write")
	}

	return true
}

// CheckProjectScoped implements project_scoped access pattern
func (c *AccessPatternChecker) CheckProjectScoped(
	ctx *AuthContext,
	config *TableSecurityConfig,
	recordData map[string]interface{},
	operation string,
	requiresWrite bool,
) bool {
	projectID, err := c.getProjectID(config, recordData)
	if err != nil || projectID == "" {
		return false
	}

	// Participants can read if participant_read is enabled
	if ctx.IsParticipant && !requiresWrite {
		if config.GetAdditionalConfigBool("participant_read") {
			return c.helper.HasProjectAccess(ctx, projectID, "read")
		}
	}

	// Determine required permission
	permission := "read"
	if requiresWrite {
		permission = "write"
	}

	return c.helper.HasProjectAccess(ctx, projectID, permission)
}

// CheckRoleFiltered implements role_filtered access pattern
func (c *AccessPatternChecker) CheckRoleFiltered(
	ctx *AuthContext,
	config *TableSecurityConfig,
	recordData map[string]interface{},
	operation string,
	requiresWrite bool,
) bool {
	projectID, err := c.getProjectID(config, recordData)
	if err != nil || projectID == "" {
		return false
	}

	// Must have project access
	permission := "read"
	if requiresWrite {
		permission = "write"
	}

	if !c.helper.HasProjectAccess(ctx, projectID, permission) {
		return false
	}

	// Admins bypass role checks
	if ctx.IsAdmin {
		return true
	}

	// Participants must have role access
	if ctx.IsParticipant && config.RoleColumn != "" {
		requiredRoles := ExtractRoleArray(recordData, config.RoleColumn)
		return c.helper.HasRoleAccess(ctx.RoleIDs, requiredRoles)
	}

	return false
}

// CheckParticipantOwned implements participant_owned access pattern
func (c *AccessPatternChecker) CheckParticipantOwned(
	ctx *AuthContext,
	config *TableSecurityConfig,
	recordData map[string]interface{},
	operation string,
	requiresWrite bool,
) bool {
	if !ctx.IsParticipant {
		return false
	}

	if config.OwnerColumn == "" {
		return false
	}

	ownerID, ok := recordData[config.OwnerColumn].(string)
	if !ok {
		return false
	}

	return ownerID == ctx.ParticipantID
}

// CheckInstanceBased implements instance_based access pattern
func (c *AccessPatternChecker) CheckInstanceBased(
	ctx *AuthContext,
	config *TableSecurityConfig,
	recordData map[string]interface{},
	operation string,
	requiresWrite bool,
) bool {
	// Check for custom function override
	customFunc := config.GetAdditionalConfigString("custom_function")
	if customFunc == "can_access_instance_data" {
		return c.helper.CanAccessInstanceData(ctx, recordData)
	}

	// Default instance-based check
	instanceID, ok := recordData["instance_id"].(string)
	if !ok || instanceID == "" {
		return false
	}

	return c.helper.CanAccessWorkflowInstance(ctx, instanceID)
}

// CheckReadOnly implements read_only access pattern
func (c *AccessPatternChecker) CheckReadOnly(
	ctx *AuthContext,
	config *TableSecurityConfig,
	recordData map[string]interface{},
	operation string,
	requiresWrite bool,
) bool {
	projectID, err := c.getProjectID(config, recordData)
	if err != nil || projectID == "" {
		return false
	}

	// Write operations require admin access
	if requiresWrite {
		if !ctx.IsAdmin {
			return false
		}
		return c.helper.HasProjectAccess(ctx, projectID, "write")
	}

	// Read operations just need project access
	return c.helper.HasProjectAccess(ctx, projectID, "read")
}

// getProjectID extracts project ID from record data, handling indirect relationships
func (c *AccessPatternChecker) getProjectID(config *TableSecurityConfig, recordData map[string]interface{}) (string, error) {
	if config.ProjectColumn == "" {
		return "", nil
	}

	columnValue, ok := recordData[config.ProjectColumn].(string)
	if !ok {
		return "", nil
	}

	// Check if indirect project resolution is needed
	if config.GetAdditionalConfigBool("indirect_project") {
		return c.helper.ResolveIndirectProjectID(config.ProjectColumn, columnValue)
	}

	return columnValue, nil
}

// CheckAccess is the main entry point for access checking
func (c *AccessPatternChecker) CheckAccess(
	ctx *AuthContext,
	tableName string,
	recordData map[string]interface{},
	operation string,
) bool {
	// Get security configuration for this table
	config := c.configManager.GetConfig(tableName)
	if config == nil {
		// No config = deny access
		return false
	}

	// Determine if write permission is required
	requiresWrite := operation == "INSERT" || operation == "UPDATE" || operation == "DELETE"

	// Check based on access pattern
	switch config.AccessPattern {
	case AdminOnly:
		return c.CheckAdminOnly(ctx, config, recordData, operation, requiresWrite)

	case ProjectScoped:
		return c.CheckProjectScoped(ctx, config, recordData, operation, requiresWrite)

	case RoleFiltered:
		return c.CheckRoleFiltered(ctx, config, recordData, operation, requiresWrite)

	case ParticipantOwned:
		return c.CheckParticipantOwned(ctx, config, recordData, operation, requiresWrite)

	case InstanceBased:
		return c.CheckInstanceBased(ctx, config, recordData, operation, requiresWrite)

	case ReadOnly:
		return c.CheckReadOnly(ctx, config, recordData, operation, requiresWrite)

	default:
		// Unknown pattern = deny
		return false
	}
}
