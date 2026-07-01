## Topo system map

This repo maintains a Topo system map (`system.topo`) generated from `//@topo`
markers embedded in the code. Markers are the structural source of truth; the map
is regenerated from them.

**Binding rule:** after any change that adds, removes, renames, or rewires a
system / activity / storage / gateway, you MUST:

1. Update the `//@topo` markers in the files you changed.
2. Run `topo sync` — regenerates the live `system.topo` from the markers.
3. Run `topo check` — this is a **hard blocker** (exit 0 = green). If it's red,
   read each entry, fix the markers, and repeat from step 2. Do not finish while
   it is red.
4. Commit the code, markers, and `system.topo` together.

`topo propose` (writes a draft) + `topo approve` (a human promotes it) are an
**optional review gate** for changes you want eyeballed before they land — not the
normal loop, and you must never run `topo approve` yourself.

See `.claude/skills/topo-sync/SKILL.md` for the marker syntax and the full loop,
and `.claude/skills/topo-sync/MARKERS.md` for the complete marker reference.
