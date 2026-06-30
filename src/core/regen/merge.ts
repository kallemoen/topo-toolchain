// merge.ts — regenerate a world from markers, preserving the map's design judgment.
//
// Markers drive STRUCTURE (which systems exist, their kind, parent, boundary).
// The prior map supplies JUDGMENT the markers can't: thing field schemas,
// gateway identity, descriptions, child ordering, and explicit connection
// overrides. Regeneration MERGES — it never blindly discards map-owned content.

import type { ToposWorld, ToposSystem, ToposThing, ToposConn } from '../topos'
import type { MarkerClaim } from '../types'
import { deriveConnections, type BoundarySystem } from '../compare/connections'

export interface RegenOpts {
  worldName?: string
}

function dedupConns(conns: ToposConn[]): ToposConn[] {
  const seen = new Set<string>()
  return conns
    .filter((c) => {
      const k = `${c.from} ${c.thing} ${c.to}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => a.from.localeCompare(b.from) || a.thing.localeCompare(b.thing) || a.to.localeCompare(b.to))
}

function rebuildChildren(systems: Record<string, ToposSystem>, priorWorld: ToposWorld | null): void {
  const kids = new Map<string, string[]>()
  for (const s of Object.values(systems)) {
    if (s.kind === 'world' || !s.parent) continue
    const arr = kids.get(s.parent)
    if (arr) arr.push(s.name)
    else kids.set(s.parent, [s.name])
  }
  for (const sys of Object.values(systems)) {
    const names = kids.get(sys.name) ?? []
    const priorOrder = priorWorld?.systems[sys.name]?.children ?? []
    const kept = priorOrder.filter((n) => names.includes(n))
    const added = names.filter((n) => !priorOrder.includes(n)).sort()
    sys.children = [...kept, ...added]
  }
}

export function regenerate(claims: MarkerClaim[], priorWorld: ToposWorld | null, opts: RegenOpts = {}): ToposWorld {
  const root = priorWorld?.root ?? opts.worldName ?? 'World'
  const systems: Record<string, ToposSystem> = {}

  systems[root] = {
    name: root,
    kind: 'world',
    parent: null,
    children: [],
    ins: [],
    outs: [],
    holds: [],
    desc: priorWorld?.systems[root]?.desc,
  }

  // Claimed systems drive structure.
  for (const c of claims) {
    const prior = priorWorld?.systems[c.system]
    systems[c.system] = {
      name: c.system,
      kind: c.kind,
      parent: c.parent ?? root,
      children: [],
      ins: [...c.ins],
      outs: [...c.outs],
      holds: [...c.holds],
      desc: prior?.desc,
    }
  }

  // Preserve map-owned gateways (externals) that have no marker; drop other orphans.
  if (priorWorld) {
    for (const s of Object.values(priorWorld.systems)) {
      if (s.kind === 'world' || systems[s.name]) continue
      if (s.kind === 'gateway') {
        systems[s.name] = {
          name: s.name,
          kind: 'gateway',
          parent: s.parent ?? root,
          children: [],
          ins: [...s.ins],
          outs: [...s.outs],
          holds: [...s.holds],
          desc: s.desc,
        }
      }
    }
  }

  // Re-point parents that vanished, and pin top-level systems under the root.
  for (const s of Object.values(systems)) {
    if (s.kind === 'world') continue
    if (!s.parent || !systems[s.parent]) s.parent = root
  }

  rebuildChildren(systems, priorWorld)

  // Things: preserve all prior schemas; stub any newly-referenced Thing.
  const things: Record<string, ToposThing> = {}
  if (priorWorld) for (const t of Object.values(priorWorld.things)) things[t.name] = { name: t.name, fields: [...t.fields] }

  // Connections: derive from boundaries, union with still-valid explicit map conns.
  const boundarySystems: BoundarySystem[] = Object.values(systems)
    .filter((s) => s.kind !== 'world')
    .map((s) => ({ name: s.name, parent: s.parent, ins: new Set(s.ins), outs: new Set(s.outs), holds: new Set(s.holds) }))
  const { conns: derived } = deriveConnections(boundarySystems)

  const supported = (c: ToposConn): boolean => {
    const f = systems[c.from]
    const t = systems[c.to]
    if (!f || !t) return false
    const emits = f.outs.includes(c.thing) || f.holds.includes(c.thing)
    const accepts = t.ins.includes(c.thing) || t.holds.includes(c.thing)
    return emits && accepts
  }
  const preserved = priorWorld ? priorWorld.conns.filter(supported) : []
  const conns = dedupConns([...preserved, ...derived])

  const referenced = new Set<string>()
  for (const s of Object.values(systems)) for (const t of [...s.ins, ...s.outs, ...s.holds]) referenced.add(t)
  for (const c of conns) referenced.add(c.thing)
  for (const name of referenced) if (!things[name]) things[name] = { name, fields: [] }

  return { root, systems, things, conns }
}
