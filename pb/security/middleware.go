package security

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
)

// RegisterSecurityHooks registers all security middleware hooks with PocketBase
func RegisterSecurityHooks(app core.App, ac *AccessController) {
	log.Println("Registering security hooks...")

	// Hook: Before viewing a single record
	app.OnRecordViewRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		// Skip if no security config
		if !ac.ShouldEnforceSecurity(e.Collection.Name) {
			return e.Next()
		}

		// Check access
		if err := ac.CanViewRecord(*e.RequestEvent, e.Record); err != nil {
			log.Printf("View access denied for %s: %v", e.Collection.Name, err)
			return err
		}

		return e.Next()
	})

	// Hook: Before creating a record
	app.OnRecordCreateRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		// Skip if no security config
		if !ac.ShouldEnforceSecurity(e.Collection.Name) {
			return e.Next()
		}

		// Debug logging for participant creation
		if e.Collection.Name == "participants" {
			ctx := NewAuthContext(*e.RequestEvent)
			recordData := RecordToMap(e.Record)
			log.Printf("Creating participant - IsAdmin: %v, UserID: %s, RecordData: %+v",
				ctx.IsAdmin, ctx.UserID, recordData)
		}

		// Check access
		if err := ac.CanCreateRecord(*e.RequestEvent, e.Record); err != nil{
			log.Printf("Create access denied for %s: %v", e.Collection.Name, err)
			return err
		}

		return e.Next()
	})

	// Hook: Before updating a record
	app.OnRecordUpdateRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		// Skip if no security config
		if !ac.ShouldEnforceSecurity(e.Collection.Name) {
			return e.Next()
		}

		// Check access
		if err := ac.CanUpdateRecord(*e.RequestEvent, e.Record); err != nil {
			log.Printf("Update access denied for %s: %v", e.Collection.Name, err)
			return err
		}

		return e.Next()
	})

	// Hook: Before deleting a record
	app.OnRecordDeleteRequest().BindFunc(func(e *core.RecordRequestEvent) error {
		// Skip if no security config
		if !ac.ShouldEnforceSecurity(e.Collection.Name) {
			return e.Next()
		}

		// Check access
		if err := ac.CanDeleteRecord(*e.RequestEvent, e.Record); err != nil {
			log.Printf("Delete access denied for %s: %v", e.Collection.Name, err)
			return err
		}

		return e.Next()
	})

	// Hook: Before listing records - basic authentication check
	// Note: Individual record filtering will be handled by collection-level rules
	// and the view hook will validate each record when accessed
	app.OnRecordsListRequest().BindFunc(func(e *core.RecordsListRequestEvent) error {
		// Skip if no security config
		if !ac.ShouldEnforceSecurity(e.Collection.Name) {
			return e.Next()
		}

		ctx := NewAuthContext(*e.RequestEvent)

		if !ctx.IsAuthenticated {
			// Let PocketBase's collection rules handle unauthenticated access
			return e.Next()
		}

		// For now, allow authenticated users to list
		// Individual record access will be checked by view hook
		// TODO: Implement query-level filtering for better performance
		return e.Next()
	})

	log.Println("Security hooks registered successfully")
}
