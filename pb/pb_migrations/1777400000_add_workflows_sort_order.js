/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("workflows")

  if (collection.fields.findIndex(f => f.name === "sort_order") === -1) {
    collection.fields.add(new Field({
      name: "sort_order",
      type: "number",
      onlyInt: true,
    }))
    app.save(collection)
  }

  // Backfill: per project, assign incrementing sort_order ordered by name,
  // so today's alphabetical display is preserved as the initial order.
  const rows = app.findAllRecords("workflows")
  const byProject = new Map()
  for (const r of rows) {
    const pid = r.get("project_id")
    if (!byProject.has(pid)) byProject.set(pid, [])
    byProject.get(pid).push(r)
  }

  for (const [, list] of byProject) {
    list.sort((a, b) => {
      const an = (a.get("name") || "").toLowerCase()
      const bn = (b.get("name") || "").toLowerCase()
      if (an !== bn) return an < bn ? -1 : 1
      return 0
    })
    list.forEach((r, i) => {
      r.set("sort_order", i)
      app.unsafeWithoutHooks().save(r)
    })
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("workflows")
  const idx = collection.fields.findIndex(f => f.name === "sort_order")
  if (idx !== -1) {
    collection.fields.splice(idx, 1)
    app.save(collection)
  }
})
