# Authoring the Topo manifest — complete reference

`system.topo` is a **hand-authored manifest**. You write the whole system design in
it — the systems, the arrows between them, and **which code each system owns** — and
Topo verifies it against the actual code. Topo never generates or edits this file.

Two things live in the manifest:

1. **The design** — worlds, systems, and the connections between them (the diagram).
2. **The code binding** — each system declares the files it owns with `code "glob"`.

Topo hashes each owned region into `system.topo.lock` (committed). `topo check` then
fails if any code is unowned, if an owned region changed since it was approved, or if
a glob points at nothing. There are **no comments in your source code** — everything
is in this one file.

## Grammar

```
world <Name> { … }                     // the root — exactly one
system   <Name> { … }                  // an open container (has children)
activity <Name> { … }                  // a leaf that does something
storage  <Name> { … }                  // a leaf that holds things
gateway  <Name> { … }                  // an external dependency you don't own
thing <Name> { field: Type … }         // a data shape (optional; file scope)

  code "<glob>"                        // source files this system owns (see below)
  <A> --( <Thing> )--> <B>             // an authored connection (the arrows)
  in <Thing> | out <Thing> | holds <Thing>   // optional boundary annotations
```

- Names and Thing names are single identifiers (`[A-Za-z_]\w*`, no spaces).
- **You draw the arrows.** Write `A --( Thing )--> B` connections by hand at the
  level where they belong. Topo does **not** derive connections — the picture is
  exactly what you author, so design it deliberately.
- `in`/`out`/`holds` are optional labels for what data crosses a system's edge. They
  document flow and drive the viewer's "follow a Thing" feature; they do **not**
  create arrows.

## `code` — binding systems to files

Each system claims the source files it owns with one or more `code` lines:

```
system Payments {
  code "src/payments/**"
  code "src/api/charges.ts"
  activity Charges { }
  storage Ledger { }
  Charges --( Charge )--> Ledger
}
```

- Globs are standard (`**`, `*`, `?`, `{a,b}`), matched from the repo root, honoring
  `.gitignore` and the config `ignore` list.
- **Most-specific wins.** When globs overlap, the file goes to the system whose glob
  has the deeper static base (then the longer glob). So a parent can claim
  `code "src/**"` and a child refine it with `code "src/payments/**"` — files under
  `src/payments/` belong to the child. Two equally-specific rival globs are an
  `ambiguous-ownership` error; make one more specific.
- A `gateway` (external) or a pure grouping `system` may own no code — that's fine, as
  long as every *file* ends up owned by some system.

## Coverage — every source file must be owned

By default (`policy.coverage: "strict"`) **every file in the coverage universe must be
owned by a system**, or `topo check` fails with `uncovered-code`. The universe is the
files matching `include` minus `ignore` in `topo.config.json` — scoped to source code,
and meant to be tuned:

- Own a file by extending some system's `code` glob to cover it.
- Or exclude non-system files (generated code, vendored deps, fixtures) by adding to
  `ignore` or narrowing `include`.

Coverage policy (`topo.config.json` → `policy.coverage`): `strict` (default, whole
repo) · `mapped` (only files under an already-owned directory must be owned) · `off`.

## The digest lock and approval

`topo approve` writes `system.topo.lock`: for each system, the globs, every owned
file's `sha256`, and a rolled-up region digest, plus a hash of the manifest itself.
This is the **last approved (map, code) snapshot** — commit it.

`topo check` recomputes and compares:

| Failure | Meaning | Fix |
|---|---|---|
| `uncovered-code` | a file no system owns | add it to a system's `code`, or `ignore` it |
| `region-changed` | an owned region's code changed since approval | review it, update the diagram if the structure changed, then `topo approve` |
| `dangling-code` | a glob matches no source file | fix or remove the glob |
| `ambiguous-ownership` | two equally-specific globs claim a file | make one more specific |
| `manifest-unapproved` | `system.topo` changed (or was never approved) | `topo approve` |

`topo approve` (no args) re-locks the whole repo. `topo approve <System…>` re-locks
just those regions (keeping the rest of the lock) — useful to acknowledge a code
change in one area without re-blessing everything.

Under `policy.approval: "human"`, `topo approve` requires `--confirm` (or a TTY) and
is a person's job; under the default `"agent"`, the AI runs it in its loop.
