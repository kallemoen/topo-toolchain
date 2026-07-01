// structure.ts — design lints: mechanical feedback on map QUALITY, not file accounting.
//
// The failure mode these catch: a map that satisfies coverage but doesn't read as a
// complete picture at every level — bare leaves with no boundary, junk-drawer systems
// wired to nothing, and arrows that cross a box's edge the box never declares.
// Calibrated against the house-style exemplars (Weave/Coffee): a well-authored map
// produces (near) zero of these. All are WARNINGS — `--strict` promotes them.

import type { ToposWorld, ToposSystem } from '../topos'
import type { DriftEntry } from '../types'

function ancestors(name: string, world: ToposWorld): string[] {
  const out: string[] = []
  let p = world.systems[name]?.parent
  while (p) {
    out.push(p)
    p = world.systems[p]?.parent
  }
  return out
}

/** Ancestors of `name` strictly below `stop` (exclusive), bottom-up. */
function ancestorsBelow(name: string, stop: string, world: ToposWorld): string[] {
  const chain = ancestors(name, world)
  const idx = chain.indexOf(stop)
  return idx === -1 ? chain : chain.slice(0, idx)
}

function lca(world: ToposWorld, a: string, b: string): string {
  const aUp = new Set([a, ...ancestors(a, world)])
  let cur: string | null = b
  while (cur) {
    if (aUp.has(cur)) return cur
    cur = world.systems[cur]?.parent ?? null
  }
  return world.root
}

const hasBoundary = (s: ToposSystem) => s.ins.length + s.outs.length + s.holds.length > 0

export function designLints(world: ToposWorld): DriftEntry[] {
  const entries: DriftEntry[] = []
  const systems = world.systems

  // -- unknown-endpoint: an arrow to/from a name that isn't a declared system -----
  for (const c of world.conns) {
    for (const end of [c.from, c.to]) {
      if (!systems[end]) {
        entries.push({
          category: 'unknown-endpoint',
          system: end,
          detail: `${c.from} --( ${c.thing} )--> ${c.to}: '${end}' is not a declared system.`,
          location: null,
          suggestion: `Declare '${end}' (or fix the name) — arrows must connect declared boxes.`,
        })
      }
    }
  }

  // -- bare-leaf: an activity/storage/gateway with no boundary at all -------------
  for (const s of Object.values(systems)) {
    if (s.kind === 'activity' || s.kind === 'storage' || s.kind === 'gateway') {
      if (!hasBoundary(s)) {
        entries.push({
          category: 'bare-leaf',
          system: s.name,
          detail: `${s.kind} ${s.name} declares no boundary (no in/out/holds).`,
          location: null,
          suggestion:
            s.kind === 'storage'
              ? `Add 'holds <Thing>' — what accumulates in ${s.name}?`
              : `Add 'in <Thing>' / 'out <Thing>' — what does ${s.name} take in and produce?`,
        })
      }
    }
  }

  // -- disconnected-system: a box whose whole subtree has no boundary and no arrow --
  const touched = new Set<string>()
  for (const s of Object.values(systems)) if (hasBoundary(s)) touched.add(s.name)
  for (const c of world.conns) {
    if (systems[c.from]) touched.add(c.from)
    if (systems[c.to]) touched.add(c.to)
  }
  const subtreeTouched = new Map<string, boolean>()
  const isTouched = (name: string): boolean => {
    const memo = subtreeTouched.get(name)
    if (memo !== undefined) return memo
    const s = systems[name]
    const v = !!s && (touched.has(name) || s.children.some(isTouched))
    subtreeTouched.set(name, v)
    return v
  }
  for (const s of Object.values(systems)) {
    if (s.kind === 'world' || !s.parent) continue
    // flag only the topmost untouched box, not every node under it
    if (!isTouched(s.name) && isTouched(s.parent)) {
      entries.push({
        category: 'disconnected-system',
        system: s.name,
        detail: `${s.name} is wired to nothing — no boundary, no arrows, in its whole subtree.`,
        location: null,
        suggestion: `Every box should participate in the story. Wire ${s.name} in (boundaries + arrows), or fold its code into the system it serves — don't keep a box just to own files.`,
      })
    }
  }

  // -- boundary-gap: an arrow carries a Thing through a box whose subtree never
  // mentions it. Deliberately loose (calibrated on the house-style exemplars):
  // `holds` implies reads, pass-through direction sloppiness is tolerated, and a
  // transparent container is covered by its children's declarations. What this
  // catches is the bolted-on side channel — data flowing through a box that, by
  // its own account, has never heard of that Thing.
  const mentions = new Map<string, Set<string>>()
  const mentioned = (name: string): Set<string> => {
    const memo = mentions.get(name)
    if (memo) return memo
    const s = systems[name]
    const set = new Set<string>(s ? [...s.ins, ...s.outs, ...s.holds] : [])
    for (const child of s?.children ?? []) for (const t of mentioned(child)) set.add(t)
    mentions.set(name, set)
    return set
  }

  for (const c of world.conns) {
    const src = systems[c.from]
    const dst = systems[c.to]
    if (!src || !dst) continue
    const meet = lca(world, c.from, c.to)
    const missing: string[] = []
    const crossings: Array<{ name: string; dir: 'in' | 'out' }> = [
      { name: c.from, dir: 'out' },
      ...ancestorsBelow(c.from, meet, world).map((name) => ({ name, dir: 'out' as const })),
      { name: c.to, dir: 'in' },
      ...ancestorsBelow(c.to, meet, world).map((name) => ({ name, dir: 'in' as const })),
    ]
    for (const { name, dir } of crossings) {
      const s = systems[name]
      if (!s || s.kind === 'world') continue
      if (!mentioned(name).has(c.thing)) {
        const kw = dir === 'in' && s.kind === 'storage' ? 'holds' : dir
        missing.push(`${name} (add '${kw} ${c.thing}')`)
      }
    }
    if (missing.length) {
      entries.push({
        category: 'boundary-gap',
        system: c.from,
        detail: `${c.from} --( ${c.thing} )--> ${c.to} passes through boxes that never declare ${c.thing}: ${missing.join(', ')}.`,
        location: null,
        suggestion: `Declare ${c.thing} on those boundaries so the flow reads at every level.`,
      })
    }
  }

  return entries
}
