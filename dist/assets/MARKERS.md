# Topo markers — the complete reference

`//@topo` markers are comments you embed in code. They are the **structural
source of truth**: `topo sync` reads them and (re)writes the `system.topo` map,
and `topo check` fails if the map and markers disagree. Because they're comments,
they never change how the code runs.

This file is the full reference. The short version — the loop and the rules that
bite — is in `SKILL.md` next to it.

## Anatomy

```
<comment-opener>@topo <keyword> <argument> [key=value ...]
```

- **`<comment-opener>`** is whatever begins a line comment in the host language:
  `//` (TS/JS/Go/Rust/Java/C/C++), `#` (Python/Ruby/Shell/YAML), `--` (SQL/Lua),
  `;` (Lisp/ini). Block comments work too as long as `@topo` starts the payload.
- The payload always starts with **`@topo`**, then a **keyword** (the kind), then
  its argument, then optional `key=value` options.

## Keywords

| Keyword     | Declares                                  | Argument | Options            |
|-------------|-------------------------------------------|----------|--------------------|
| `system`    | an **open container** (has children)      | `<Name>` | `parent=<Parent>`  |
| `activity`  | a **leaf** that *does* something          | `<Name>` | `parent=<Parent>`  |
| `storage`   | a **leaf** that *holds* things            | `<Name>` | `parent=<Parent>`  |
| `gateway`   | an **external** dependency you don't own  | `<Name>` | `parent=<Parent>`  |
| `in`        | a Thing the enclosing system **accepts**  | `<Thing>`| —                  |
| `out`       | a Thing the enclosing system **emits**    | `<Thing>`| —                  |
| `holds`     | a Thing a `storage` **stores**            | `<Thing>`| —                  |

`system` vs `activity`/`storage`: use `system` when it will contain other marked
things; use `activity`/`storage` for the leaves that live inside it. `gateway` is
for things outside your codebase (Stripe, a managed DB, a third-party API) — you
still declare the Things that cross the boundary so Topo can wire them.

## Names and Things are single identifiers

Every `<Name>` and `<Thing>` must match `[A-Za-z_][A-Za-z0-9_]*` — a single token,
**no spaces, no punctuation**. Use `PascalCase` for readability.

```
✓  //@topo system PaymentApi
✓  //@topo out ChargeSucceeded
✗  //@topo system Payment API        # two words → the parser only takes "Payment"
✗  //@topo out charge-succeeded      # hyphen is not allowed
```

A Thing name is an identity: the *same* Thing name used on an `out` in one system
and an `in` in another is what links them. Pick names deliberately and reuse them.

## Boundaries bind to the nearest preceding system marker in the same file

`in` / `out` / `holds` attach to the closest `system`/`activity`/`storage`/`gateway`
marker **above them in the same file**. Keep them adjacent:

```ts
//@topo activity Checkout parent=Storefront
//@topo in Cart          // belongs to Checkout
//@topo out Order        // belongs to Checkout

//@topo storage Orders parent=Storefront
//@topo holds Order      // belongs to Orders — NOT Checkout
```

If a boundary appears before any system marker in the file, it has nothing to bind
to and is ignored (with a warning). One system's boundaries can be spread across
several files — each `in`/`out`/`holds` just needs a system marker above it in
*its own* file. Repeating the system marker in each file it spans is fine.

## Connections are DERIVED — never write them by hand

There is no "connection" marker. Topo builds the wiring from matching Thing names:

```
system A: out Invoice        system B: in Invoice
        └─────────────  A --( Invoice )--> B  ─────────────┘
```

To connect two systems, give the producer `out <Thing>` and the consumer
`in <Thing>` with the **same** Thing name. To *change* the wiring, change the
Thing names — don't touch `system.topo`.

- A Thing that is `out` of one system and never `in` anywhere is an **open output**
  (leaves the world). A Thing that is `in` somewhere but never `out` is an **open
  input** (enters the world). Both are legal — they're the world's edges.
- `storage` uses `holds`. A store that `holds Order` and an activity that
  `out Order`s will be wired producer → store automatically.

## `parent=` — where a node lives

Leaves (`activity`, `storage`) should name the open `system` they belong to:

```
//@topo activity Mailer parent=Notifications
```

Without `parent=`, a leaf attaches at the **world root** and Topo raises a
non-blocking warning (`--strict` turns it into a failure). An open `system` may
also take `parent=` to nest inside another system; a top-level system omits it.

## The world

The outermost container is the **world**. Its name defaults to the repository
folder name; override it once with `topo init --name <World>` (or edit `world` in
`topo.config.json` before the first `topo sync`). You do not mark the world in code.

## Worked example — one module, three files

```ts
// storefront/index.ts
//@topo system Storefront            // open container for the module
```
```ts
// storefront/checkout.ts
//@topo activity Checkout parent=Storefront
//@topo in Cart
//@topo out Order                     // → wired to Orders (holds Order) below
//@topo out Charge                    // → leaves toward Stripe (in Charge) below
```
```ts
// storefront/orders.ts
//@topo storage Orders parent=Storefront
//@topo holds Order

//@topo gateway Stripe                 // external — we don't own it
//@topo in Charge
//@topo out Receipt                    // comes back into the world
```

`topo sync` turns that into: a `Storefront` system containing `Checkout` and
`Orders`, an external `Stripe` gateway, and derived connections
`Checkout --( Order )--> Orders`, `Checkout --( Charge )--> Stripe`, plus `Cart`
as an open input and `Receipt` as an open output.

## Reading `topo check` failures

Each failure names the system, a `file:line` for the offending marker, and the
fix. Common ones:

- **drift** — a marker exists that the map lacks (or vice-versa). Run `topo sync`.
- **unknown parent** — `parent=Foo` where no `system Foo` is marked. Add the parent
  marker or fix the name.
- **duplicate name** — the same `<Name>` marked as two different kinds. Rename one.
- **dangling boundary** — an `in`/`out`/`holds` with no system marker above it in
  the file. Move it under its system.

Fix the markers, run `topo sync`, run `topo check` again — never edit `system.topo`
to silence it.
