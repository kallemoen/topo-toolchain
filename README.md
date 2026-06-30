# Topo Repo Toolchain (v1)

Tooling that lets an AI coding agent build and maintain an **always-accurate Topo
map** of a codebase, automatically, while a human watches the system take shape.

Markers embedded in code are the source of truth for structure; the `.topo` map is
regenerated from them; **`topo check` is a hard blocker** that fails until code,
markers, and map agree. The human watches a live browser map and approves
structural changes. Bring-your-own-AI, language-agnostic, local-only, fast.

## Use it on another repo

```bash
# 1. get the toolchain
git clone <this-repo> topo-toolchain     # or download + unzip
cd topo-toolchain
npm install                              # deps only — the viewer bundle is pre-built/committed
npm link                                 # puts `topo` on your PATH (Node >= 20)

# 2. install Topo into the repo you want to map
cd /path/to/your/other/repo
topo init        # scaffold system.topo + the topo-sync skill + CLAUDE.md note + pre-commit hook
topo check       # the drift blocker (exit 0 in sync, 1 on drift)
topo view        # live map in your browser at http://localhost:4517
```

No global tsx needed — the `topo` launcher runs the bundled TypeScript through the
package's own tsx. (Prefer not to `npm link`? Run it directly:
`node /path/to/topo-toolchain/bin/topo.mjs init --dir /path/to/your/repo`.)

`topo init` scaffolds `system.topo`, installs the `topo-sync` agent skill, appends a
binding rule to `CLAUDE.md`, and installs a `.git/hooks/pre-commit` drift guard.

## Markers (comments — never affect runtime)

Use the host language's comment opener; the payload always begins with `@topo`.

```ts
//@topo system   Collection                 // an OPEN container (has children)
//@topo activity Scraper parent=Collection   // a leaf that does something
//@topo storage  Listings parent=Collection  // a leaf that holds things
//@topo gateway  Firecrawl                    // a crossing to another world
//@topo in Listing    //@topo out Listing    //@topo holds Listing
```

The keyword is the kind. Connections are **derived** from boundary matching
(`out X` → `in X`) — don't put them in markers.

## CLI

| Command | What it does |
|---|---|
| `topo init` | install Topo into a repo (map, skill, rule note, pre-commit hook) |
| `topo check` | scan markers, compare to the map, report drift. **Exit 0 = sync, 1 = drift, 2 = error.** The hard blocker. |
| `topo regen` / `topo propose` | regenerate the map from markers → `system.draft.topo` (`--write` edits the live map) |
| `topo approve` | promote the draft to the live map (`--reject` to discard) |
| `topo view` | start the live browser viewer: watch the map, stream drift + draft over SSE |

`topo check --json` and `topo propose --json` are the agent-facing surfaces.

## How it fits together

```
code + //@topo markers ──scan──▶ marker claims ──compare──▶ drift report (3 categories + warnings)
                                       │
                                   regenerate ──▶ system.draft.topo ──approve──▶ system.topo
                                                                                    │
                                                                              topo view (live browser map)
```

- **Markers** carry structure (system, kind, open/closed, parent, boundary).
- **The map** carries design judgment markers can't: thing field schemas, gateway
  identity, grouping, descriptions, and explicit connection overrides. Regeneration
  **merges** — it never discards map-owned content.

## Architecture

| Piece | Where |
|---|---|
| Parser/model/layout (vendored from genflow; re-sync with `npm run sync:core`) | `src/core/topos.ts` |
| Serializer (model → `.topo`, round-trips the parser) | `src/core/serialize.ts` |
| Marker grammar + scanner | `src/core/markers/` |
| Drift comparator (the heart) + connection derivation | `src/core/compare/` |
| Regenerator + draft flow | `src/core/regen/` |
| CLI | `src/cli/` |
| Live server (Node http + SSE + chokidar) | `src/server/` |
| Self-contained viewer (a copy of the genflow app + live mode) | `viewer/` → built into `src/assets/viewer-dist/` |
| Agent skill + rule note + pre-commit hook | `src/assets/` |

## Develop

```bash
npm install
npm run typecheck      # tsc --noEmit
npm test               # vitest (grammar, scan, serialize round-trip, compare, merge)
npm run build:viewer   # build the viewer bundle into src/assets/viewer-dist
npm run topo -- check --dir <repo>   # run the CLI via tsx
```

Stack: Node 20 + TypeScript + tsx + ESM; the viewer is Vite + React 19 + `@xyflow/react`.
No model, no API keys, no cloud.
