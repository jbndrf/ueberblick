package security

import (
	"encoding/json"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// AuthContext represents the authentication context for a request
type AuthContext struct {
	IsAuthenticated bool
	IsAdmin         bool
	IsParticipant   bool
	UserID          string
	ParticipantID   string
	ProjectID       string
	RoleIDs         []string
	Email           string
	Record          *core.Record
}

// NewAuthContext creates an AuthContext from a PocketBase request event
func NewAuthContext(e core.RequestEvent) *AuthContext {
	ctx := &AuthContext{
		IsAuthenticated: false,
		IsAdmin:         false,
		IsParticipant:   false,
	}

	auth := e.Auth
	if auth == nil {
		// No authentication present
		return ctx
	}

	collection := auth.Collection()
	if collection == nil {
		// Auth record exists but no collection - shouldn't happen
		return ctx
	}

	collectionName := collection.Name

	ctx.IsAuthenticated = true
	ctx.UserID = auth.Id
	ctx.Record = auth

	// Check if this is an admin user (from users collection)
	if collectionName == "users" {
		ctx.IsAdmin = true
		ctx.Email = auth.GetString("email")
		return ctx
	}

	// Check if this is a participant (from participants collection)
	if collectionName == "participants" {
		ctx.IsParticipant = true
		ctx.ParticipantID = auth.Id
		ctx.ProjectID = auth.GetString("project_id")
		ctx.Email = auth.GetString("email")

		// Extract role_id array
		roleIDs := auth.GetStringSlice("role_id")
		if len(roleIDs) > 0 {
			ctx.RoleIDs = roleIDs
		} else {
			// Fallback: try to parse as raw value
			roleIDsRaw := auth.Get("role_id")
			if roleIDsRaw != nil {
				// Try to unmarshal as JSON array
				if roleIDsJSON, ok := roleIDsRaw.(string); ok {
					var roles []string
					if err := json.Unmarshal([]byte(roleIDsJSON), &roles); err == nil {
						ctx.RoleIDs = roles
					}
				} else if roleIDsArray, ok := roleIDsRaw.([]interface{}); ok {
					// Handle as array
					for _, roleID := range roleIDsArray {
						if roleStr, ok := roleID.(string); ok {
							ctx.RoleIDs = append(ctx.RoleIDs, roleStr)
						}
					}
				}
			}
		}

		return ctx
	}

	// If it's some other collection, still mark as authenticated but not admin/participant
	return ctx
}

// SecurityHelper provides security-related helper functions
type SecurityHelper struct {
	app core.App
	db  dbx.Builder
}

// NewSecurityHelper creates a new security helper
func NewSecurityHelper(app core.App) *SecurityHelper {
	return &SecurityHelper{
		app: app,
		db:  app.DB(),
	}
}

// HasProjectAccess checks if a user has access to a project
func (h *SecurityHelper) HasProjectAccess(ctx *AuthContext, projectID string, permission string) bool {
	if projectID == "" {
		return false
	}

	// Admins need to own the project
	if ctx.IsAdmin {
		var count int
		err := h.db.Select("COUNT(*)").
			From("projects").
			Where(dbx.HashExp{"id": projectID, "owner_id": ctx.UserID}).
			Row(&count)

		if err != nil {
			return false
		}
		return count > 0
	}

	// Participants need to belong to the project
	if ctx.IsParticipant {
		return ctx.ProjectID == projectID
	}

	return false
}

// HasRoleAccess checks if participant has any of the required roles
func (h *SecurityHelper) HasRoleAccess(participantRoles []string, requiredRoles []string) bool {
	if len(requiredRoles) == 0 {
		return true // No role restriction
	}

	if len(participantRoles) == 0 {
		return false // No roles assigned
	}

	// Check if any participant role matches required roles
	for _, pRole := range participantRoles {
		for _, rRole := range requiredRoles {
			if pRole == rRole {
				return true
			}
		}
	}

	return false
}

// ResolveIndirectProjectID resolves project_id from indirect relationships
func (h *SecurityHelper) ResolveIndirectProjectID(columnName string, columnValue string) (string, error) {
	if columnValue == "" {
		return "", nil
	}

	var projectID string
	var err error

	switch columnName {
	case "workflow_id":
		err = h.db.Select("project_id").
			From("workflows").
			Where(dbx.HashExp{"id": columnValue}).
			Row(&projectID)

	case "form_id":
		err = h.db.Select("project_id").
			From("forms").
			Where(dbx.HashExp{"id": columnValue}).
			Row(&projectID)

	case "action_id":
		err = h.db.Select("w.project_id").
			From("workflow_actions wa").
			InnerJoin("workflows w", dbx.NewExp("w.id = wa.workflow_id")).
			Where(dbx.HashExp{"wa.id": columnValue}).
			Row(&projectID)

	case "table_id":
		err = h.db.Select("project_id").
			From("custom_tables").
			Where(dbx.HashExp{"id": columnValue}).
			Row(&projectID)

	case "rule_id":
		err = h.db.Select("project_id").
			From("rules").
			Where(dbx.HashExp{"id": columnValue}).
			Row(&projectID)

	case "instance_id":
		err = h.db.Select("w.project_id").
			From("workflow_instances wi").
			InnerJoin("workflows w", dbx.NewExp("w.id = wi.workflow_id")).
			Where(dbx.HashExp{"wi.id": columnValue}).
			Row(&projectID)

	default:
		return "", fmt.Errorf("unknown indirect project column: %s", columnName)
	}

	if err != nil {
		return "", err
	}

	return projectID, nil
}

// CanAccessWorkflowInstance checks if user can access a workflow instance
func (h *SecurityHelper) CanAccessWorkflowInstance(ctx *AuthContext, instanceID string) bool {
	if instanceID == "" {
		return false
	}

	// Check if instance exists and belongs to user's project
	type InstanceInfo struct {
		ProjectID  string `db:"project_id"`
		WorkflowID string `db:"workflow_id"`
		CreatedBy  string `db:"created_by"`
		IsActive   bool   `db:"is_active"`
	}

	var info InstanceInfo
	err := h.db.Select("w.project_id", "wi.workflow_id", "wi.created_by", "w.is_active").
		From("workflow_instances wi").
		InnerJoin("workflows w", dbx.NewExp("w.id = wi.workflow_id")).
		Where(dbx.HashExp{"wi.id": instanceID}).
		One(&info)

	if err != nil {
		return false
	}

	if !info.IsActive {
		return false
	}

	// Admin access - must own the project
	if ctx.IsAdmin {
		return h.HasProjectAccess(ctx, info.ProjectID, "read")
	}

	// Participant access
	if ctx.IsParticipant {
		// Must be in the right project
		if ctx.ProjectID != info.ProjectID {
			return false
		}

		// Can see instances they created
		if info.CreatedBy == ctx.ParticipantID {
			return true
		}

		// Can see instances where they have stage access
		var stageCount int
		err = h.db.Select("COUNT(*)").
			From("workflow_stages ws").
			Where(dbx.HashExp{"ws.workflow_id": info.WorkflowID}).
			AndWhere(dbx.Or(
				dbx.HashExp{"ws.visible_to_roles": nil},
				dbx.NewExp("ws.visible_to_roles = ''"),
			)).
			// TODO: Add proper role array matching for visible_to_roles
			Row(&stageCount)

		if err == nil && stageCount > 0 {
			return true
		}

		// Check if user has any matching roles for stages
		if len(ctx.RoleIDs) > 0 {
			var accessCount int
			err = h.db.Select("COUNT(*)").
				From("workflow_stages").
				Where(dbx.HashExp{"workflow_id": info.WorkflowID}).
				// TODO: Implement proper array intersection check
				Row(&accessCount)

			if err == nil && accessCount > 0 {
				return true
			}
		}
	}

	return false
}

// CanAccessInstanceData checks if user can access instance data
func (h *SecurityHelper) CanAccessInstanceData(ctx *AuthContext, recordData map[string]interface{}) bool {
	instanceID, ok := recordData["instance_id"].(string)
	if !ok || instanceID == "" {
		return false
	}

	// First check if they can access the instance itself
	if !h.CanAccessWorkflowInstance(ctx, instanceID) {
		return false
	}

	// For participants, additional checks
	if ctx.IsParticipant {
		// Can see data they created/modified
		lastModifiedBy, ok := recordData["last_modified_by"].(string)
		if ok && lastModifiedBy == ctx.ParticipantID {
			return true
		}

		// Can see data from stages they have access to
		actionExecutionID, ok := recordData["action_execution_id"].(string)
		if ok && actionExecutionID != "" {
			// Check if the action execution is from a stage they can access
			type ActionStageInfo struct {
				FromStageID string `db:"from_stage_id"`
				ToStageID   string `db:"to_stage_id"`
				WorkflowID  string `db:"workflow_id"`
			}

			var info ActionStageInfo
			err := h.db.Select("ae.from_stage_id", "ae.to_stage_id", "wa.workflow_id").
				From("action_executions ae").
				InnerJoin("workflow_actions wa", dbx.NewExp("wa.id = ae.action_id")).
				Where(dbx.HashExp{"ae.id": actionExecutionID}).
				One(&info)

			if err == nil {
				// TODO: Check if user has access to from_stage or to_stage
				// This requires checking workflow_stages.visible_to_roles array
				return true
			}
		}

		// If no action_execution_id, it's initial data
		// Check if they have access to any stage
		return true
	}

	return true // Admins with instance access can see all data
}

// ExtractRoleArray safely extracts a role array from record data
func ExtractRoleArray(recordData map[string]interface{}, fieldName string) []string {
	if recordData == nil {
		return nil
	}

	rolesRaw, ok := recordData[fieldName]
	if !ok {
		return nil
	}

	// Handle string JSON array
	if rolesJSON, ok := rolesRaw.(string); ok {
		var roles []string
		if err := json.Unmarshal([]byte(rolesJSON), &roles); err == nil {
			return roles
		}
	}

	// Handle []interface{}
	if rolesArray, ok := rolesRaw.([]interface{}); ok {
		var roles []string
		for _, role := range rolesArray {
			if roleStr, ok := role.(string); ok {
				roles = append(roles, roleStr)
			}
		}
		return roles
	}

	// Handle []string directly
	if rolesArray, ok := rolesRaw.([]string); ok {
		return rolesArray
	}

	return nil
}
