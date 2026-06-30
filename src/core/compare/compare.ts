// compare.ts — the drift check (the heart of the tool).
//
// Reduce the marker claims and the parsed map each to a canonical structural
// shape, then diff into the three categories (in-code-not-map, in-map-not-code,
// conflicting) plus non-blocking unclear-boundary warnings. Deterministic: every
// input is sorted, sets are compared by membership, and no clock/random/network
// touches the comparison (generatedAt is stamped after and excluded from pass/fail).

import type { ToposWorld } from '../topos'
import type { MarkerClaim, MarkerKind, DriftEntry, DriftReport } from '../types'
import { deriveConnections, type BoundarySystem } from './connections'

interface Canon {
  name: string
  kind: MarkerKind
  parent: string | null // normalized: world-root parent ⇒ null (top level)
  ins: Set<string>
  outs: Set<string>
  holds: Set<string>
}

function canonFromClaim(c: MarkerClaim): Canon {
  return {
    name: c.system,
    kind: c.kind,
    parent: c.parent,
    ins: new Set(c.ins),
    outs: new Set(c.outs),
    holds: new Set(c.holds),
  }
}

function canonFromWorld(world: ToposWorld): Map<string, Canon> {
  const out = new Map<string, Canon>()
  for (const sys of Object.values(world.systems)) {
    if (sys.kind === 'world') continue
    const parent = sys.parent === world.root ? null : sys.parent
    out.set(sys.name, {
      name: sys.name,
      kind: sys.kind as MarkerKind,
      parent,
      ins: new Set(sys.ins),
      outs: new Set(sys.outs),
      holds: new Set(sys.holds),
    })
  }
  return out
}

const minus = (a: Set<string>, b: Set<string>): string[] => [...a].filter((x) => !b.has(x)).sort()

export interface CompareOpts {
  strict?: boolean
  filesScanned?: number
  generatedAt?: string // injectable for determinism in tests
}

export function compare(claims: MarkerClaim[], priorWorld: ToposWorld | null, opts: CompareOpts = {}): DriftReport {
  const expected = new Map<string, Canon>(claims.map((c) => [c.system, canonFromClaim(c)]))
  const actual = priorWorld ? canonFromWorld(priorWorld) : new Map<string, Canon>()
  const entries: DriftEntry[] = []

  const names = [...new Set([...expected.keys(), ...actual.keys()])].sort()
  for (const name of names) {
    const e = expected.get(name)
    const a = actual.get(name)
    const claim = claims.find((c) => c.system === name) ?? null
    const loc = claim?.loc ?? null

    if (e && !a) {
      entries.push({
        category: 'in-code-not-map',
        system: name,
        detail: `${e.kind} '${name}' is marked in code but missing from the map`,
        location: loc,
        suggestion: `Run 'topo propose' to add '${e.kind} ${name}'${e.parent ? ` under '${e.parent}'` : ''} to the map.`,
      })
      continue
    }
    if (a && !e) {
      if (a.kind === 'gateway') continue // gateways are map-owned externals — not orphans
      entries.push({
        category: 'in-map-not-code',
        system: name,
        detail: `'${a.kind} ${name}' is in the map but has no //@topo marker in code`,
        location: null,
        suggestion: `Remove '${name}' from the map (run 'topo propose'), or add a //@topo marker if the code still exists.`,
      })
      continue
    }
    if (!e || !a) continue

    // both present — compare structure
    if (e.kind !== a.kind) {
      entries.push({
        category: 'conflicting',
        system: name,
        detail: `kind differs — marker says ${e.kind}, map says ${a.kind}`,
        location: loc,
        suggestion: `Reconcile the kind of '${name}' between the marker and the map, then re-run.`,
      })
    }
    // marker parent null ⇒ defer to the map's placement (design judgment), no conflict
    if (e.parent && e.parent !== a.parent) {
      entries.push({
        category: 'conflicting',
        system: name,
        detail: `parent differs — marker says ${e.parent}, map says ${a.parent ?? '(top level)'}`,
        location: loc,
        suggestion: `Reconcile the parent of '${name}', then re-run.`,
      })
    }
    for (const [dir, eset, aset] of [
      ['in', e.ins, a.ins],
      ['out', e.outs, a.outs],
      ['holds', e.holds, a.holds],
    ] as const) {
      for (const t of minus(eset, aset))
        entries.push({
          category: 'in-code-not-map',
          system: name,
          detail: `boundary '${dir} ${t}' is marked in code but missing from the map`,
          location: loc,
          suggestion: `Run 'topo propose' to add '${dir} ${t}' to '${name}'.`,
        })
      for (const t of minus(aset, eset))
        entries.push({
          category: 'in-map-not-code',
          system: name,
          detail: `boundary '${dir} ${t}' is in the map but not marked in code`,
          location: null,
          suggestion: `Remove '${dir} ${t}' from '${name}' in the map, or add the marker in code.`,
        })
    }
  }

  // unclear-boundary: a leaf with no parent (probably belongs to some system)
  for (const e of expected.values()) {
    if (e.parent === null && e.kind !== 'gateway' && e.kind !== 'system') {
      const claim = claims.find((c) => c.system === e.name)
      entries.push({
        category: 'unclear-boundary',
        system: e.name,
        detail: `'${e.kind} ${e.name}' has no parent= — it will attach at the world root`,
        location: claim?.loc ?? null,
        suggestion: `Add 'parent=<System>' to the marker for '${e.name}', or place it in the map.`,
      })
    }
  }

  // unclear-boundary: ambiguous wiring (a Thing with many producers/consumers)
  const boundarySystems: BoundarySystem[] = [...expected.values()].map((c) => ({
    name: c.name,
    parent: c.parent,
    ins: c.ins,
    outs: c.outs,
    holds: c.holds,
  }))
  const { ambiguous } = deriveConnections(boundarySystems)
  for (const amb of ambiguous) {
    entries.push({
      category: 'unclear-boundary',
      system: amb.producers[0] ?? amb.thing,
      detail: `'${amb.thing}' wiring is ambiguous — producers [${amb.producers.join(', ')}] × consumers [${amb.consumers.join(', ')}]`,
      location: null,
      suggestion: `Pin the intended connection in the map with an explicit 'A --( ${amb.thing} )--> B' line.`,
    })
  }

  // conflicting: a map connection whose boundary basis no longer exists in markers
  if (priorWorld) {
    for (const conn of priorWorld.conns) {
      const from = expected.get(conn.from)
      const to = expected.get(conn.to)
      const fromEmits = from && (from.outs.has(conn.thing) || from.holds.has(conn.thing))
      const toAccepts = to && (to.ins.has(conn.thing) || to.holds.has(conn.thing))
      // only flag when BOTH endpoints are marker-known systems but the wiring lost its basis
      if (from && to && !(fromEmits && toAccepts)) {
        entries.push({
          category: 'conflicting',
          system: conn.from,
          detail: `map connection '${conn.from} --( ${conn.thing} )--> ${conn.to}' is no longer supported by markers`,
          location: null,
          suggestion: `Add the missing 'out ${conn.thing}'/'in ${conn.thing}' markers, or remove the connection (run 'topo propose').`,
        })
      }
    }
  }

  // sort entries deterministically
  const order: Record<DriftEntry['category'], number> = {
    'in-code-not-map': 0,
    'in-map-not-code': 1,
    conflicting: 2,
    'unclear-boundary': 3,
  }
  entries.sort((x, y) => order[x.category] - order[y.category] || x.system.localeCompare(y.system) || x.detail.localeCompare(y.detail))

  const warnings = entries.filter((e) => e.category === 'unclear-boundary').length
  const failures = entries.length - warnings
  const blocking = failures + (opts.strict ? warnings : 0)

  return {
    passed: blocking === 0,
    failures,
    warnings,
    entries,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    scan: { filesScanned: opts.filesScanned ?? 0, systems: expected.size },
  }
}
