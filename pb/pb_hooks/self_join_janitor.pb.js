/// <reference path="../pb_data/types.d.ts" />

// Deactivation job for self-joined ("guest") participants.
//
// Sets is_active=false on participants where self_joined=true and
// created < now - RETENTION_DAYS. Rows are kept; the login flow already
// rejects participants with is_active=false.

cronAdd("self_join_janitor", "17 3 * * *", () => {
  var RETENTION_DAYS = 90;
  var cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  var cutoffStr = cutoff.toISOString().replace("T", " ").replace("Z", "");

  try {
    var rows = $app.findRecordsByFilter(
      "participants",
      'self_joined = true && is_active = true && created < {:cutoff}',
      "-created",
      500,
      0,
      { cutoff: cutoffStr }
    );

    var deactivated = 0;
    var failed = 0;
    for (var i = 0; i < rows.length; i++) {
      try {
        rows[i].set("is_active", false);
        $app.save(rows[i]);
        deactivated++;
      } catch (err) {
        failed++;
        console.error("self_join_janitor: failed to deactivate participant " + rows[i].id, err);
      }
    }

    if (deactivated > 0 || failed > 0) {
      console.log("self_join_janitor: deactivated=" + deactivated + " failed=" + failed);
    }
  } catch (err) {
    console.error("self_join_janitor: query failed", err);
  }
});
