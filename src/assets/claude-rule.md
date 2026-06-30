## Topo system map

This repo maintains a Topo system map (`system.topo`) generated from `//@topo`
markers embedded in the code. Markers are the structural source of truth; the map
is design-level source of truth.

**Binding rule:** after any change that adds, removes, renames, or rewires a
system / activity / storage / gateway, you MUST:

1. Update the `//@topo` markers in the files you changed.
2. Run `topo check` — this is a **hard blocker**. The task is not complete while
   it is red.
3. Run `topo propose` to regenerate `system.draft.topo`, then loop until
   `topo check` is green.
4. Leave the draft for the human to approve in the live viewer (`topo view`). Do
   **not** run `topo approve` yourself.

See `.claude/skills/topo-sync/SKILL.md` for the marker syntax and the full loop.
