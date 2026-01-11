// Extending PocketBase with JS - @see https://pocketbase.io/docs/js-overview/

/// <reference path="../pb_data/types.d.ts" />

/**
 * Configure PocketBase on startup:
 * - Create first admin user from env vars if no users exist
 * - Configure batch API settings from env vars
 *
 * Environment variables:
 *   POCKETBASE_ADMIN_EMAIL        - Admin email for first user
 *   POCKETBASE_ADMIN_PASSWORD     - Admin password for first user
 *   PB_BATCH_ENABLED=true|false   - Enable/disable batch API
 *   PB_BATCH_MAX_REQUESTS=100     - Max operations per batch request
 *   PB_BATCH_TIMEOUT=30           - Timeout in seconds
 *   PB_BATCH_MAX_BODY_SIZE=134217728 - Max body size in bytes (128MB)
 */
onBootstrap((e) => {
  // Must call e.next() first before accessing database/settings
  e.next();

  // === Create first admin user if none exist ===
  const adminEmail = $os.getenv("POCKETBASE_ADMIN_EMAIL");
  const adminPassword = $os.getenv("POCKETBASE_ADMIN_PASSWORD");

  if (adminEmail && adminPassword) {
    try {
      const users = $app.findRecordsByFilter("users", "1=1", "", 1);

      if (users.length === 0) {
        const usersCollection = $app.findCollectionByNameOrId("users");
        const record = new Record(usersCollection);
        record.set("email", adminEmail);
        record.set("password", adminPassword);
        record.set("verified", true);
        record.set("name", "Admin");
        $app.save(record);
        console.log("[Config] First admin user created:", adminEmail);
      }
    } catch (err) {
      console.error("[Config] Failed to create first user:", err);
    }
  }

  // === Configure Batch API settings ===
  const settings = $app.settings();
  let hasChanges = false;

  const batchEnabled = $os.getenv("PB_BATCH_ENABLED");
  const batchMaxRequests = $os.getenv("PB_BATCH_MAX_REQUESTS");
  const batchTimeout = $os.getenv("PB_BATCH_TIMEOUT");
  const batchMaxBodySize = $os.getenv("PB_BATCH_MAX_BODY_SIZE");

  if (batchEnabled !== "") {
    const enabled = batchEnabled === "true" || batchEnabled === "1";
    if (settings.batch.enabled !== enabled) {
      settings.batch.enabled = enabled;
      hasChanges = true;
      console.log(`[Config] Batch API enabled: ${enabled}`);
    }
  }

  if (batchMaxRequests !== "") {
    const maxRequests = parseInt(batchMaxRequests, 10);
    if (!isNaN(maxRequests) && maxRequests > 0 && settings.batch.maxRequests !== maxRequests) {
      settings.batch.maxRequests = maxRequests;
      hasChanges = true;
      console.log(`[Config] Batch max requests: ${maxRequests}`);
    }
  }

  if (batchTimeout !== "") {
    const timeout = parseInt(batchTimeout, 10);
    if (!isNaN(timeout) && timeout > 0 && settings.batch.timeout !== timeout) {
      settings.batch.timeout = timeout;
      hasChanges = true;
      console.log(`[Config] Batch timeout: ${timeout}s`);
    }
  }

  if (batchMaxBodySize !== "") {
    const maxBodySize = parseInt(batchMaxBodySize, 10);
    if (!isNaN(maxBodySize) && maxBodySize > 0 && settings.batch.maxBodySize !== maxBodySize) {
      settings.batch.maxBodySize = maxBodySize;
      hasChanges = true;
      console.log(`[Config] Batch max body size: ${maxBodySize} bytes`);
    }
  }

  if (hasChanges) {
    try {
      $app.save(settings);
      console.log("[Config] Batch API settings saved successfully");
    } catch (err) {
      console.error("[Config] Failed to save batch settings:", err);
    }
  }
});
