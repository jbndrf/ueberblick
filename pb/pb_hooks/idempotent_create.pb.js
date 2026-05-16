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
//
// IMPORTANT: only the *lookup / rule-check* phase runs inside the try/catch.
// The downstream e.next() must NOT be wrapped: any error a later hook
// throws (e.g. quota validation rejecting a BadRequestError) needs to
// propagate to the client. Wrapping e.next() would silently turn rejects
// into successes.

onRecordCreateRequest((e) => {
  var collectionName = "(unknown)";
  var incomingId = "(none)";
  var shortCircuited = false;

  try {
    if (!e.record) {
      // fall through
    } else {
      incomingId = e.record.id || "";
      if (incomingId) {
        var collection = e.record.collection();
        collectionName = collection.name;

        var existing = null;
        try {
          existing = $app.findRecordById(collectionName, incomingId);
        } catch (err) {
          existing = null; // not found -- normal create path
        }

        if (existing) {
          // Rule check. PB rules:
          //   null / undefined  -> superusers only
          //   ""                -> always allowed
          //   "<filter>"        -> evaluate filter against the request
          var createRule = collection.createRule;
          var allowed = false;

          if (createRule === null || createRule === undefined) {
            allowed = !!e.hasSuperuserAuth();
            if (!allowed) {
              console.log(
                "[idempotent-create] " + collectionName + "/" + incomingId +
                ": fall through (superuser-only rule, not superuser)"
              );
            }
          } else if (createRule === "") {
            allowed = true;
          } else {
            try {
              var info = e.requestInfo();
              allowed = !!$app.canAccessRecord(existing, info, createRule);
              if (!allowed) {
                console.log(
                  "[idempotent-create] " + collectionName + "/" + incomingId +
                  ": fall through (createRule denied)"
                );
              }
            } catch (err) {
              console.error(
                "[idempotent-create] " + collectionName + "/" + incomingId +
                ": canAccessRecord threw, falling through:",
                err
              );
              allowed = false;
            }
          }

          if (allowed) {
            console.log(
              "[idempotent-create] " + collectionName + "/" + incomingId +
              ": short-circuiting (record already exists, auth allowed)"
            );
            e.json(200, existing);
            shortCircuited = true;
          }
        }
      }
    }
  } catch (err) {
    // Any unexpected error from the lookup/rule-check path: fall through
    // so we never block a legitimate create because of a bug in this hook.
    console.error(
      "[idempotent-create] " + collectionName + "/" + incomingId +
      ": unexpected error in lookup phase, falling through:",
      err
    );
  }

  if (!shortCircuited) {
    // NOTE: outside try/catch by design -- downstream hook rejections
    // (e.g. quota_exceeded BadRequestError) must propagate.
    e.next();
  }
});
