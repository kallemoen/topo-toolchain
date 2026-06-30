<p align="center">
  <img src="docs/banner.png" alt="topo /toolchain — See how your codebase really works" width="100%" />
</p>

<p align="center"><b>Drop it into any repo and your coding agent draws a live map of every system — kept in sync with the code as it changes.</b></p>

<p align="center">
  <code>drop-in</code> &nbsp;·&nbsp; <code>any language</code> &nbsp;·&nbsp; <code>local-only</code> &nbsp;·&nbsp; <code>bring your own AI</code> &nbsp;·&nbsp; <code>always in sync</code>
</p>

---

## ▸ Hand it to your agent

Topo is built to be run **by your coding agent** (Claude Code, Cursor, or any agent), not by hand. Paste the prompt below into your agent, in the repo you want to understand, and watch the map appear:

```text
Set up Topo in this repo so I can see how it works as a live map.

1. Install the CLI once:  npm i -g github:kallemoen/topo-toolchain
2. Run:  topo init   — scaffolds the map, an agent rule, and a pre-commit hook.
3. Add //@topo comment markers to each significant system (service, module,
   job, datastore), right where it lives in the code. The keyword is the kind:
     //@topo system   <Name> [parent=<Parent>]   # an open container (has children)
     //@topo activity <Name> [parent=<Parent>]   # does something
     //@topo storage  <Name> [parent=<Parent>]   # holds things
     //@topo gateway  <Name>                      # an external dependency
     //@topo in <Thing>     # data the system accepts
     //@topo out <Thing>    # data the system emits
4. Run:  topo check   and fix drift until it passes (exit 0).
5. Run:  topo propose  and leave the draft map for me to review.
6. Run:  topo view   so I can watch the map live in my browser.

Keep the //@topo markers in sync whenever you change structure, and never
finish with `topo check` red. Connections are derived from out↔in — don't
write them by hand.
```

No setup, no account, no keys. Nothing leaves your repo.

> Prefer not to install globally? Every command also works as `npx github:kallemoen/topo-toolchain <cmd>`.

---

## What you get

- **The whole system, one screen.** Boxes for every part, arrows for every connection — nested as deep as your code goes.
- **Click in to understand it.** Open a box to see what's inside. Follow a piece of data from where it's born to where it rests.
- **Never out of date.** The map is built from your code, so it can't quietly rot the way a diagram in a doc does.

Run `topo view` and a local map opens in your browser. Open boxes to drill in, follow the arrows to trace data, and watch it redraw the instant you save. The moment something in code doesn't match, it's flagged right on the map.

## A map that can't lie to you

Most diagrams are wrong within a week. Topo keeps tiny markers next to the code they describe, and a check that fails the moment the map and the code disagree — so your agent fixes it before you ever see a stale picture.

1. **Markers live in the code.** A one-line `//@topo` comment marks each system, right where it's written. Move the code, the marker moves with it.
2. **The check is the gate.** `topo check` compares code to map and fails on any drift — pointing at the exact `file:line`. Wire it into a pre-commit hook and "done" requires a green map.
3. **Your agent keeps it green.** An installed skill + rule make updating the map non-optional. The agent loops fix → propose until in sync, then leaves a draft for you to approve.

## How your agent marks it up

You don't write these by hand — the agent does. It tags each system where it lives, names the data crossing its edges, and **Topo derives the connections for you**: one part's `out` meeting another's `in` becomes an arrow.

```ts
// payments/charge.ts — a one-line tag, next to the code
//@topo activity Charges parent=Payments
//@topo out Charge
```

`Charges` becomes a box on the map, wired by its boundary. Anything that emits `Charge` now points into whatever accepts `Charge` — automatically. Connections are **derived, never hand-drawn**.

## Five commands. That's the whole tool.

| Command | What it does | Exit |
|---|---|---|
| `topo init` | Drop the tool in: scaffold the map, the agent skill + rule, and a pre-commit hook. Idempotent, never clobbers. | `0` / `2` |
| `topo view` | Open the live map in your browser — the part you actually look at. Redraws on every save. | `0` / `2` |
| `topo check` | Compare code to map and report drift. The gate that keeps the picture honest. | `0` sync · `1` drift · `2` error |
| `topo propose` | Regenerate the map from the code markers and write it to a draft for review. | `0` / `2` |
| `topo approve` | Accept the draft as the live map (or `--reject` to discard). | `0` / `1` / `2` |

## The map vs. the markers

- **Markers** carry structure: which systems exist, their kind, open/closed, parent, and boundary (`in`/`out`/`holds`).
- **The `.topo` map** keeps the design judgment markers can't: thing field schemas, gateway identity, grouping, descriptions, and explicit connection overrides.

Regeneration **merges** — markers drive structure while the map's design choices are preserved. That collapses "three things that can disagree" (code, markers, map) into one mechanical check.

## Notes

- **Bring your own AI.** Topo ships no model and manages no keys — it's the mechanical referee your agent acts on.
- **Local-only.** The viewer and check run on your machine; nothing leaves the repo.
- **Language-agnostic.** Markers are found by simple comment-pattern matching, so they work in any language and never affect runtime.
- **Requires Node ≥ 20.** The viewer is prebuilt and committed, so `topo view` runs with no build step.

## Develop

```bash
git clone https://github.com/kallemoen/topo-toolchain && cd topo-toolchain
npm install
npm run typecheck      # tsc --noEmit
npm test               # vitest (grammar, scan, serialize round-trip, compare, merge)
npm run topo -- check --dir <repo>
npm run build:viewer   # rebuild the viewer bundle into src/assets/viewer-dist
```

Stack: Node 20 + TypeScript + tsx + ESM; the viewer is Vite + React 19 + [`@xyflow/react`](https://github.com/xyflow/xyflow). No model, no API keys, no cloud.

## License

MIT
