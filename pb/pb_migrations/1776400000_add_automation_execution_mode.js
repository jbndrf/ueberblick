/// <reference path="../pb_data/types.d.ts" />

/**
 * Add execution_mode field to tools_automation collection.
 * - 'run_all' (default): All matching steps execute (current behavior)
 * - 'first_match': Stop after first step whose conditions match
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("tools_automation");

    collection.fields.add(
      new Field({
        name: "execution_mode",
        type: "select",
        values: ["run_all", "first_match"],
        maxSelect: 1,
        required: false,
      })
    );

    app.save(collection);

    // Set default for existing records
    app.db().newQuery(
      'UPDATE tools_automation SET execution_mode = "run_all" WHERE execution_mode = "" OR execution_mode IS NULL'
    ).execute();
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("tools_automation");
    collection.fields.removeByName("execution_mode");
    app.save(collection);
  }
);
