// pb_migrations/1777100000_participant_file_mime_allowlist.js
// Lock participant file fields to an image-only MIME allowlist.
// SVG is explicitly excluded: it can carry <script> and enable stored XSS when
// served inline. HTML, PDFs, and Office docs are also not in the allowlist —
// add them back if a future form needs them.
migrate((app) => {
  const allowedMimeTypes = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif"
  ]

  const instances = app.findCollectionByNameOrId("workflow_instances")
  if (instances) {
    const field = instances.fields.find((f) => f.name === "files")
    if (field) {
      field.mimeTypes = allowedMimeTypes
      app.save(instances)
    }
  }

  const fieldValues = app.findCollectionByNameOrId("workflow_instance_field_values")
  if (fieldValues) {
    const field = fieldValues.fields.find((f) => f.name === "file_value")
    if (field) {
      field.mimeTypes = allowedMimeTypes
      app.save(fieldValues)
    }
  }
}, (app) => {
  const instances = app.findCollectionByNameOrId("workflow_instances")
  if (instances) {
    const field = instances.fields.find((f) => f.name === "files")
    if (field) {
      field.mimeTypes = []
      app.save(instances)
    }
  }

  const fieldValues = app.findCollectionByNameOrId("workflow_instance_field_values")
  if (fieldValues) {
    const field = fieldValues.fields.find((f) => f.name === "file_value")
    if (field) {
      field.mimeTypes = []
      app.save(fieldValues)
    }
  }
})
