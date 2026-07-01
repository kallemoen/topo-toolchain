// resolve.ts — attribute every source file to exactly one system.
//
// A system claims code with `code "glob"` lines. When globs overlap (a parent
// claims a broad area, a child refines it) the MOST-SPECIFIC glob wins: deeper
// static base first, then longer glob text. A true tie between different systems
// is an ambiguous-ownership error.

import type { ToposConfig } from '../config'
import type { ToposWorld } from '../topos'
import { listSourceFiles, matchGlobs } from '../files'

export interface Ownership {
  universe: string[] // every source file in scope, sorted
  owner: Map<string, string> // file → owning system
  bySystem: Map<string, string[]> // system → its owned files, sorted
  uncovered: string[] // universe files claimed by nobody
  dangling: { system: string; glob: string }[] // globs matching no source file
  ambiguous: { file: string; systems: string[] }[] // equally-specific rival claims
}

/** [baseDepth, globLength] — higher is more specific. */
function specificity(glob: string): [number, number] {
  const wild = glob.search(/[*?{}[\]]/)
  const base = wild === -1 ? glob : glob.slice(0, wild)
  const depth = (base.match(/\//g) ?? []).length
  return [depth, glob.length]
}

function moreSpecific(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1]
}

/** Depth of a system in the manifest tree (world root = 0). */
function treeDepth(name: string, world: ToposWorld): number {
  let d = 0
  let p = world.systems[name]?.parent
  while (p) {
    d++
    p = world.systems[p]?.parent
  }
  return d
}

/** Is `anc` an ancestor of `node` in the manifest tree? */
function isAncestor(anc: string, node: string, world: ToposWorld): boolean {
  let p = world.systems[node]?.parent
  while (p) {
    if (p === anc) return true
    p = world.systems[p]?.parent
  }
  return false
}

interface Claim {
  system: string
  spec: [number, number]
}

export function resolveOwnership(root: string, config: ToposConfig, world: ToposWorld): Ownership {
  const universe = listSourceFiles(root, config)
  const inUniverse = new Set(universe)

  const claimsByFile = new Map<string, Claim[]>()
  const dangling: { system: string; glob: string }[] = []

  for (const sys of Object.values(world.systems)) {
    for (const glob of sys.codePaths) {
      const matched = matchGlobs(root, [glob], config).filter((f) => inUniverse.has(f))
      if (matched.length === 0) {
        dangling.push({ system: sys.name, glob })
        continue
      }
      const spec = specificity(glob)
      for (const f of matched) {
        const list = claimsByFile.get(f) ?? []
        list.push({ system: sys.name, spec })
        claimsByFile.set(f, list)
      }
    }
  }

  const owner = new Map<string, string>()
  const bySystem = new Map<string, string[]>()
  const uncovered: string[] = []
  const ambiguous: { file: string; systems: string[] }[] = []

  for (const file of universe) {
    const claims = claimsByFile.get(file)
    if (!claims || claims.length === 0) {
      uncovered.push(file)
      continue
    }
    claims.sort((a, b) => moreSpecific(b.spec, a.spec))
    const top = claims[0].spec
    const tied = [...new Set(claims.filter((c) => moreSpecific(c.spec, top) === 0).map((c) => c.system))]

    let winner: string
    if (tied.length === 1) {
      winner = tied[0]
    } else {
      // Nesting breaks the tie: the deepest system in the manifest tree wins, as
      // long as the other tied systems are its ancestors (a leaf naturally owns the
      // code of the container it sits in). Genuinely unrelated rivals are ambiguous.
      const deepest = [...tied].sort((a, b) => treeDepth(b, world) - treeDepth(a, world) || a.localeCompare(b))[0]
      const unrelated = tied.filter((s) => s !== deepest && !isAncestor(s, deepest, world))
      if (unrelated.length) ambiguous.push({ file, systems: [...tied].sort() })
      winner = deepest
    }

    owner.set(file, winner)
    const owned = bySystem.get(winner) ?? []
    owned.push(file)
    bySystem.set(winner, owned)
  }

  for (const files of bySystem.values()) files.sort()

  return { universe, owner, bySystem, uncovered, dangling, ambiguous }
}
