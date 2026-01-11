package security

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// AccessController is the main access control system
type AccessController struct {
	app            core.App
	configManager  *SecurityConfigManager
	patternChecker *AccessPatternChecker
}

// NewAccessController creates a new access controller
func NewAccessController(app core.App, configPath string) (*AccessController, error) {
	configManager := NewSecurityConfigManager()
	if err := configManager.LoadFromFile(configPath); err != nil {
		return nil, fmt.Errorf("failed to load security config: %w", err)
	}

	patternChecker := NewAccessPatternChecker(app, configManager)

	return &AccessController{
		app:            app,
		configManager:  configManager,
		patternChecker: patternChecker,
	}, nil
}

// CanAccessTable checks if the given auth context can access a table record
func (ac *AccessController) CanAccessTable(
	ctx *AuthContext,
	tableName string,
	recordData map[string]interface{},
	operation string,
) bool {
	return ac.patternChecker.CheckAccess(ctx, tableName, recordData, operation)
}

// RecordToMap converts a PocketBase record to a map for security checking
func RecordToMap(record *core.Record) map[string]interface{} {
	if record == nil {
		return make(map[string]interface{})
	}

	result := make(map[string]interface{})

	// Add ID
	result["id"] = record.Id

	// Add all fields from the record
	fieldsData := record.FieldsData()
	for key, value := range fieldsData {
		result[key] = value
	}

	return result
}

// CanViewRecord checks if user can view a specific record
func (ac *AccessController) CanViewRecord(event core.RequestEvent, record *core.Record) error {
	ctx := NewAuthContext(event)

	if !ctx.IsAuthenticated {
		return fmt.Errorf("authentication required")
	}

	recordData := RecordToMap(record)
	tableName := record.Collection().Name

	if !ac.CanAccessTable(ctx, tableName, recordData, "SELECT") {
		return fmt.Errorf("access denied to view record in %s", tableName)
	}

	return nil
}

// CanCreateRecord checks if user can create a record
func (ac *AccessController) CanCreateRecord(event core.RequestEvent, record *core.Record) error {
	ctx := NewAuthContext(event)

	if !ctx.IsAuthenticated {
		return fmt.Errorf("authentication required")
	}

	recordData := RecordToMap(record)
	tableName := record.Collection().Name

	if !ac.CanAccessTable(ctx, tableName, recordData, "INSERT") {
		return fmt.Errorf("access denied to create record in %s", tableName)
	}

	return nil
}

// CanUpdateRecord checks if user can update a record
func (ac *AccessController) CanUpdateRecord(event core.RequestEvent, record *core.Record) error {
	ctx := NewAuthContext(event)

	if !ctx.IsAuthenticated {
		return fmt.Errorf("authentication required")
	}

	recordData := RecordToMap(record)
	tableName := record.Collection().Name

	if !ac.CanAccessTable(ctx, tableName, recordData, "UPDATE") {
		return fmt.Errorf("access denied to update record in %s", tableName)
	}

	return nil
}

// CanDeleteRecord checks if user can delete a record
func (ac *AccessController) CanDeleteRecord(event core.RequestEvent, record *core.Record) error {
	ctx := NewAuthContext(event)

	if !ctx.IsAuthenticated {
		return fmt.Errorf("authentication required")
	}

	recordData := RecordToMap(record)
	tableName := record.Collection().Name

	if !ac.CanAccessTable(ctx, tableName, recordData, "DELETE") {
		return fmt.Errorf("access denied to delete record in %s", tableName)
	}

	return nil
}

// ShouldEnforceSecurity checks if security should be enforced for a collection
func (ac *AccessController) ShouldEnforceSecurity(collectionName string) bool {
	// Don't enforce security on system collections
	if collectionName == "_collections" ||
		collectionName == "_migrations" ||
		collectionName == "_params" ||
		collectionName == "_mfas" ||
		collectionName == "_otps" ||
		collectionName == "_externalAuths" ||
		collectionName == "_authOrigins" ||
		collectionName == "_superusers" {
		return false
	}

	// Check if we have a security config for this collection
	return ac.configManager.HasConfig(collectionName)
}
