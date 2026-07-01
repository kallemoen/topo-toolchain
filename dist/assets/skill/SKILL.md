---
name: topo
description: Keep the Topo system map (system.topo) accurate. Use after any change that adds, removes, renames, or rewires a system — or moves the code a system owns — and whenever `topo check` is red. The check is a hard blocker; do not finish until it passes. Never add comments to source code.
---

# Keep the Topo map accurate

This repo's architecture is a **hand-authored manifest**, `system.topo`. You write
the whole design in it — the systems, the arrows between them, and **which code each
system owns** (via `code "glob"` lines). Topo hashes the owned code into
`system.topo.lock` and `topo check` fails on drift. `topo check` is a HARD BLOCKER:
do not finish a task while it is red.

**Never write `//@topo` comments or any Topo markers in source code.** All structure
lives in `system.topo`. The full grammar is in `MANIFEST.md` next to this file.

## The loop (do this — it always converges)

1. Make your code change.
2. Open `system.topo` and make it match reality: add/rename/rewire systems, update
   the `--( )-->` arrows, and adjust each system's `code "glob"` so every file stays
   owned by the right system.
3. Run **`topo check`**. Read each entry (it names the file/system + a fix) and
   resolve them all:
   - `uncovered-code` → a file no system owns. Extend the owning system's `code`
     glob, or add the file to `ignore` in `topo.config.json` if it isn't a system.
   - `region-changed` → the code under a system changed. Confirm the diagram still
     reflects it; update `system.topo` if the structure moved.
   - `dangling-code` → a glob matches nothing. Fix or remove it.
   - `ambiguous-ownership` → two globs claim a file equally. Make one more specific.
   - `manifest-unapproved` → you edited the map (or there's no lock yet). Approve it.
4. Run **`topo approve`** — records the current map + code as the approved snapshot
   (writes `system.topo.lock`). `topo check` is now green.
5. Commit `system.topo`, `system.topo.lock`, and your code together.

`topo approve <System…>` re-locks only those systems (keep the rest) when you only
touched one area.

> If `topo.config.json` sets `policy.approval` to `"human"`, do NOT run `topo approve`
> yourself — leave the review to a person (they run `topo approve --confirm` or use
> the viewer). Otherwise (the default `"agent"`), run it as step 4.

## First run — authoring the map from scratch

If `system.topo` is just the empty `world { }` scaffold:

1. **Design top-down.** Identify the significant systems — the parts a new engineer
   would draw on a whiteboard: services, apps, modules, jobs, datastores, and the
   external dependencies you call (`gateway`). Write them as nested `system` /
   `activity` / `storage` / `gateway` blocks. Don't annotate code — compose the
   whole picture here.
2. **Draw the arrows.** Add `A --( Thing )--> B` connections for the real data flows.
3. **Assign the code.** Give each system a `code "glob"` so that **every** source
   file is owned (coverage is whole-repo strict by default). Start with broad
   directory globs, then refine.
4. Run `topo check` until only `manifest-unapproved` remains, then `topo approve`.

## Hard rules

- NEVER write `//@topo` markers or any Topo comment in source files.
- NEVER finish a task with `topo check` red.
- NEVER hand-edit `system.topo.lock` — it's produced by `topo approve`.
- Keep the diagram honest: if you can't draw it cleanly, the design is telling you
  something — fix the map to match reality, don't paper over it.
