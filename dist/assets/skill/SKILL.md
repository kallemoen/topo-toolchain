---
name: topo-sync
description: Keep the Topo system map in sync with code. Use after any change that adds, removes, renames, or rewires a system/activity/storage/gateway, or whenever `topo check` is red. The check is a hard blocker — do not finish until it passes.
---

# Keep the Topo map in sync

This repo's architecture is a Topo map (`system.topo`). The **source of truth for
structure is `//@topo` markers embedded in the code**; the map is regenerated from
them with `topo sync`. `topo check` is a HARD BLOCKER: do not finish a task while
it is red.

You have everything you need below — you should NOT need to read the tool's source.
For the full marker reference see `MARKERS.md` next to this file.

## The loop (do this — it always converges)

1. Make your code change.
2. Add/update the `//@topo` markers in the files you touched (grammar below).
3. Run **`topo sync`** — regenerates the live `system.topo` from the markers.
4. Run **`topo check`** — must be green (exit 0). If red, read each entry (it names
   the system + `file:line` + a fix), correct the markers, and go back to step 3.
5. Commit code + markers + `system.topo` together.

`topo sync` is the normal loop. (`topo propose` writes a *draft* for a human to
`topo approve` — use that only when you specifically want a human to review a
structural change before it lands. Do NOT run `topo approve` yourself.)

## Marker grammar (comments — they never affect runtime)

Use the host language's comment opener; the payload always begins with `@topo`.
**The keyword is the kind.** Put the marker in the file that implements the system.

```
//@topo system   <Name> [parent=<Parent>]   # an OPEN container (has children)
//@topo activity <Name> [parent=<Parent>]   # a leaf that does something
//@topo storage  <Name> [parent=<Parent>]   # a leaf that holds things
//@topo gateway  <Name>                       # an external dependency (Stripe, DB, …)
//@topo in <Thing>      # a kind of data the system accepts
//@topo out <Thing>     # a kind of data the system emits
//@topo holds <Thing>   # (storage only) the kind of data it stores
```

### Rules that will bite you if you miss them

- **Names and Things are single identifiers** — letters/digits/underscore, **no
  spaces** (`PaymentApi`, `ChargeEvent` — not `Payment API`). One word per name.
- **Boundaries bind to the nearest preceding `@topo` system marker in the same
  file.** Put each `in`/`out`/`holds` line directly under the system it belongs to.
- **Connections are DERIVED, never written by hand.** If system A declares
  `out Charge` and system B declares `in Charge`, Topo draws `A --( Charge )--> B`
  automatically. To wire two systems, give them a shared Thing name on `out`/`in`.
- **Leaf `activity`/`storage` should have `parent=`** (the open `system` they live
  in). Without it they attach at the world root and raise a non-blocking warning.
- **`gateway`** marks something external you don't own — markers on it are optional;
  it's fine to declare just `gateway Stripe` with the Things that cross it.
- **World name** defaults to the repo folder name. Run `topo init --name <World>` to
  set it (or edit `world` in `topo.config.json` before the first `topo sync`).

### Example (a payments module across two files)

```ts
// payments/charges.ts
//@topo activity Charges parent=Payments
//@topo in Order
//@topo out Charge
```
```ts
// payments/ledger.ts
//@topo storage Ledger parent=Payments
//@topo holds Charge          // emits Charge → Topo wires Charges → Ledger
```
```ts
// payments/index.ts
//@topo system Payments        // the open container Charges + Ledger live in
```

## Hard rules

- NEVER hand-edit `system.topo` to silence the check — fix the markers, run `topo sync`.
- NEVER finish a task with `topo check` red.
- NEVER run `topo approve` yourself — promoting a draft is the human's decision.
- Markers are comments: they must not change how the code runs.
