/// <reference path="../pb_data/types.d.ts" />

// Idempotent create: if an incoming POST specifies an `id` that already
// exists (client-generated id from the offline-first sync path), and the
// caller would be allowed to create that record in the first place, return
// the existing record as a successful create instead of failing with
// "id: Value must be unique".
//
// This matches the Stripe Idempotency-Key model: retries of a committed
// create return the original result as if the retry were the first call.
// Makes the sync engine's retry path trivially safe and lets the client
// delete its per-collection "must be unique" dedup code.
//
// Authorization: we evaluate the collection's createRule against the
// existing record (not its viewRule). Semantically that answers "could this
// caller have created this record" -- which is exactly the question a retry
// is asking. viewRule would also work but is often stricter and can
// introduce rule-evaluation failures for complex JOIN chains in the hook
// context. Falls through to normal create on any access failure so we
// never leak records the caller cannot legitimately see.
//
// Global hook (no tag filter) -- applies to every create request.

onRecordCreateRequest((e) => {
  var collectionName = "(unknown)";
  var incomingId = "(none)";
  try {
    if (!e.record) {
      return e.next();
    }

    incomingId = e.record.id || "";
    if (!incomingId) {
      // No client-supplied id -- PB will generate one, no collision possible.
      return e.next();
    }

    var collection = e.record.collection();
    collectionName = collection.name;

    var existing;
    try {
      existing = $app.findRecordById(collectionName, incomingId);
    } catch (err) {
      // Not found -- normal create path.
      return e.next();
    }

    if (!existing) {
      return e.next();
    }

    // Rule check. PB rules:
    //   null / undefined  -> superusers only
    //   ""                -> always allowed
    //   "<filter>"        -> evaluate filter against the request
    var createRule = collection.createRule;

    if (createRule === null || createRule === undefined) {
      // Superusers only.
      if (!e.hasSuperuserAuth()) {
        console.log(
          "[idempotent-create] " + collectionName + "/" + incomingId +
          ": fall through (superuser-only rule, not superuser)"
        );
        return e.next();
      }
    } else if (createRule !== "") {
      try {
        var info = e.requestInfo();
        var allowed = $app.canAccessRecord(existing, info, createRule);
        if (!allowed) {
          console.log(
            "[idempotent-create] " + collectionName + "/" + incomingId +
            ": fall through (createRule denied)"
          );
          return e.next();
        }
      } catch (err) {
        console.error(
          "[idempotent-create] " + collectionName + "/" + incomingId +
          ": canAccessRecord threw, falling through:",
          err
        );
        return e.next();
      }
    }
    // else: createRule === "" -> always allowed, no check needed.

    console.log(
      "[idempotent-create] " + collectionName + "/" + incomingId +
      ": short-circuiting (record already exists, auth allowed)"
    );

    // Short-circuit: respond with the existing record and do NOT call
    // e.next(). The PB SDK on the client parses this as a successful
    // create and reconciles its local state.
    e.json(200, existing);
    return;
  } catch (err) {
    // Any unexpected error: fall through so we never block a legitimate
    // create because of a bug in this hook.
    console.error(
      "[idempotent-create] " + collectionName + "/" + incomingId +
      ": unexpected error, falling through:",
      err
    );
    return e.next();
  }
});
