package main

import (
	"log"

	_ "github.com/shaxbee/go-spatialite"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
)

func main() {
	app := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: "pb_data",
		DBConnect: func(dbPath string) (*dbx.DB, error) {
			// Use spatialite driver which automatically loads SpatiaLite
			db, err := dbx.Open("spatialite", dbPath)
			if err != nil {
				return nil, err
			}

			// Set PocketBase-recommended PRAGMAs
			_, err = db.NewQuery(`
				PRAGMA busy_timeout = 10000;
				PRAGMA journal_mode = WAL;
				PRAGMA journal_size_limit = 200000000;
				PRAGMA synchronous = NORMAL;
				PRAGMA foreign_keys = ON;
				PRAGMA temp_store = MEMORY;
				PRAGMA cache_size = -16000;
			`).Execute()
			if err != nil {
				log.Printf("Warning: Failed to set PRAGMAs: %v", err)
			}

			return db, nil
		},
	})

	// Enable JavaScript migrations from pb_migrations directory
	jsvm.MustRegister(app, jsvm.Config{
		MigrationsDir: "pb_migrations",
		HooksDir:      "pb_hooks",
	})
	log.Println("JavaScript hooks enabled from pb_hooks/")
	log.Println("JavaScript migrations enabled from pb_migrations/")

	// Add startup hook
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		log.Println("PocketBase server starting with SpatiaLite support...")
		log.Println("Admin UI: http://0.0.0.0:8090/_/")
		log.Println("API: http://0.0.0.0:8090/api/")

		// Set the server to listen on 0.0.0.0
		e.Server.Addr = "0.0.0.0:8090"

		return e.Next()
	})

	// Add a test endpoint to verify SpatiaLite
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/api/spatial-test", func(c *core.RequestEvent) error {
			result := struct {
				Version string `db:"version" json:"version"`
			}{}

			err := app.DB().NewQuery("SELECT spatialite_version() as version").One(&result)
			if err != nil {
				return c.JSON(500, map[string]string{
					"error": "SpatiaLite not available: " + err.Error(),
				})
			}

			return c.JSON(200, map[string]interface{}{
				"status":            "ok",
				"spatialite_version": result.Version,
				"message":           "SpatiaLite is working!",
			})
		})

		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
