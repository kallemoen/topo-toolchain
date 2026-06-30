---
name: topo-sync
description: Keep the Topo system map in sync with code. Use after any change that adds, removes, renames, or rewires a system/activity/storage/gateway, or whenever `topo check` is red. The check is a hard blocker — do not finish until it passes.
---

# Keep the Topo map in sync

This repo's architecture is described by a Topo map (`system.topo`). The **source
of truth for structure is `//@topo` markers embedded in the code**; the map is
regenerated from them. `topo check` is a HARD BLOCKER: you are not done until it
is green.

## Marker syntax (comments — they never affect runtime)

Use the host language's comment opener; the payload always begins with `@topo`.

```
//@topo activity <Name> [parent=<Parent>]    # a leaf that does something
//@topo storage  <Name> [parent=<Parent>]    # a leaf that holds things
//@topo gateway  <Name> [parent=<Parent>]    # a crossing to another world (external)
//@topo system   <Name> [parent=<Parent>]    # an OPEN container (has children)
//@topo in <Thing>     //@topo out <Thing>     //@topo holds <Thing>
```

- The keyword IS the kind. Put the marker in the file that implements the system.
- Boundaries (`in`/`out`/`holds`) declare what crosses the system's edge.
- Connections are **derived** from boundary matching (`out X` → `in X`) — do not
  put connections in markers.

## The loop (do not skip, do not stop early)

1. Make your code change.
2. Add/update the `//@topo` markers in the files you touched.
3. Run `topo check --strict` and read the report. For each entry, apply its fix:
   - **in code, not map** — the map is missing your change → regenerate (step 4).
   - **in map, not code** — you deleted code but left a box → regenerate.
   - **conflicting** — a marker and the map disagree → reconcile them.
   - **unclear-boundary** (warning) — add a `parent=` or pin the connection in the map.
4. Run `topo propose` to regenerate `system.draft.topo` from the markers. This
   PRESERVES thing schemas, gateways, grouping, and descriptions in the map.
5. Run `topo check` again. Repeat 3–5 until it is GREEN.
6. A structural change now waits in `system.draft.topo` for the human. Tell them a
   draft is ready to review in the live viewer (`topo view`).

## Hard rules

- NEVER hand-edit `system.topo` to silence the check — fix the markers instead.
- NEVER finish a task with `topo check` red.
- NEVER run `topo approve` yourself — promoting a draft to the live map is the
  human's decision.
- Markers are comments: they must not change how the code runs.
