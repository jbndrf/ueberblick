package security

import (
	"encoding/json"
	"fmt"
	"os"
)

// AccessPattern defines the type of access control pattern
type AccessPattern string

const (
	AdminOnly        AccessPattern = "admin_only"
	ProjectScoped    AccessPattern = "project_scoped"
	RoleFiltered     AccessPattern = "role_filtered"
	ParticipantOwned AccessPattern = "participant_owned"
	InstanceBased    AccessPattern = "instance_based"
	ReadOnly         AccessPattern = "read_only"
)

// TableSecurityConfig represents security configuration for a single table
type TableSecurityConfig struct {
	TableName        string                 `json:"TableName"`
	AccessPattern    AccessPattern          `json:"AccessPattern"`
	ProjectColumn    string                 `json:"ProjectColumn"`
	RoleColumn       string                 `json:"RoleColumn"`
	OwnerColumn      string                 `json:"OwnerColumn"`
	AdditionalConfig map[string]interface{} `json:"AdditionalConfig"`
}

// SecuritySchema represents the complete security configuration
type SecuritySchema struct {
	SecurityConfigs []TableSecurityConfig `json:"security_configs"`
}

// SecurityConfigManager manages security configurations
type SecurityConfigManager struct {
	configs map[string]*TableSecurityConfig
}

// NewSecurityConfigManager creates a new security configuration manager
func NewSecurityConfigManager() *SecurityConfigManager {
	return &SecurityConfigManager{
		configs: make(map[string]*TableSecurityConfig),
	}
}

// LoadFromFile loads security configurations from a JSON file
func (m *SecurityConfigManager) LoadFromFile(filepath string) error {
	data, err := os.ReadFile(filepath)
	if err != nil {
		return fmt.Errorf("failed to read security config file: %w", err)
	}

	var schema SecuritySchema
	if err := json.Unmarshal(data, &schema); err != nil {
		return fmt.Errorf("failed to parse security config: %w", err)
	}

	// Index configs by table name for fast lookup
	for i := range schema.SecurityConfigs {
		config := &schema.SecurityConfigs[i]
		m.configs[config.TableName] = config
	}

	return nil
}

// GetConfig returns the security configuration for a table
func (m *SecurityConfigManager) GetConfig(tableName string) *TableSecurityConfig {
	return m.configs[tableName]
}

// HasConfig checks if a table has security configuration
func (m *SecurityConfigManager) HasConfig(tableName string) bool {
	_, exists := m.configs[tableName]
	return exists
}

// GetAdditionalConfigBool safely gets a boolean from additional config
func (c *TableSecurityConfig) GetAdditionalConfigBool(key string) bool {
	if c.AdditionalConfig == nil {
		return false
	}
	val, ok := c.AdditionalConfig[key]
	if !ok {
		return false
	}
	boolVal, ok := val.(bool)
	return ok && boolVal
}

// GetAdditionalConfigString safely gets a string from additional config
func (c *TableSecurityConfig) GetAdditionalConfigString(key string) string {
	if c.AdditionalConfig == nil {
		return ""
	}
	val, ok := c.AdditionalConfig[key]
	if !ok {
		return ""
	}
	strVal, ok := val.(string)
	if ok {
		return strVal
	}
	return ""
}
