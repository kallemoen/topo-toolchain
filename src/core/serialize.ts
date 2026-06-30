// serialize.ts — the model → .topo writer (the inverse of parseTopos).
//
// genflow's topos.ts is read-only; this is the one new piece of model code the
// toolchain owns. It must ROUND-TRIP: parseTopos(serializeTopos(w)) yields a
// world structurally equal to `w`. Output mirrors the bundled examples so the
// .topo stays human-readable and diffs cleanly.
//
// Connection placement is cosmetic — parseTopos resolves system names globally
// regardless of where a connection line sits — so we place each connection in
// the body of the lowest common ancestor of its endpoints purely for readability.

import type { ToposWorld, ToposSystem, ToposThing, ToposConn } from './topos'

const IND = '  '

function serializeThing(t: ToposThing): string {
  if (t.fields.length === 0) return `thing ${t.name} { }`
  const lines = t.fields.map((f) => `${IND}${f.name}: ${f.type}`)
  return `thing ${t.name} {\n${lines.join('\n')}\n}`
}

/** Names from `name` up to (and including) the root. */
function ancestorsInclusive(world: ToposWorld, name: string): string[] {
  const out: string[] = []
  let cur: string | null = name
  const seen = new Set<string>()
  while (cur != null && !seen.has(cur)) {
    seen.add(cur)
    out.push(cur)
    cur = world.systems[cur]?.parent ?? null
  }
  return out
}

/** Lowest common ancestor of two systems, falling back to the world root. */
function lca(world: ToposWorld, a: string, b: string): string {
  const up = ancestorsInclusive(world, a)
  const ofB = new Set(ancestorsInclusive(world, b))
  for (const x of up) if (ofB.has(x)) return x
  return world.root
}

function groupConnsByLca(world: ToposWorld): Map<string, ToposConn[]> {
  const byLca = new Map<string, ToposConn[]>()
  const sorted = [...world.conns].sort(
    (x, y) => x.from.localeCompare(y.from) || x.thing.localeCompare(y.thing) || x.to.localeCompare(y.to),
  )
  for (const c of sorted) {
    const owner = lca(world, c.from, c.to)
    const arr = byLca.get(owner)
    if (arr) arr.push(c)
    else byLca.set(owner, [c])
  }
  return byLca
}

function emitSystem(
  name: string,
  world: ToposWorld,
  connsByLca: Map<string, ToposConn[]>,
  depth: number,
  out: string[],
): void {
  const sys: ToposSystem | undefined = world.systems[name]
  if (!sys) return
  const ind = IND.repeat(depth)
  const i2 = IND.repeat(depth + 1)
  const desc = sys.desc ? `  // ${sys.desc}` : ''

  out.push(`${ind}${sys.kind} ${sys.name} {${desc}`)

  for (const t of sys.ins) out.push(`${i2}in ${t}`)
  for (const t of sys.outs) out.push(`${i2}out ${t}`)
  for (const t of sys.holds) out.push(`${i2}holds ${t}`)

  const hadBoundary = sys.ins.length + sys.outs.length + sys.holds.length > 0
  if (hadBoundary && sys.children.length) out.push('')

  sys.children.forEach((child, idx) => {
    if (idx > 0) out.push('')
    emitSystem(child, world, connsByLca, depth + 1, out)
  })

  const conns = connsByLca.get(name) ?? []
  if (conns.length) {
    if (hadBoundary || sys.children.length) out.push('')
    for (const c of conns) out.push(`${i2}${c.from} --( ${c.thing} )--> ${c.to}`)
  }

  out.push(`${ind}}`)
}

export interface SerializeOpts {
  /** A header comment block to place above the things (each line should start with //). */
  header?: string
}

/** Render a parsed world back to deterministic, diff-friendly `.topo` text. */
export function serializeTopos(world: ToposWorld, opts: SerializeOpts = {}): string {
  const blocks: string[] = []

  if (opts.header) blocks.push(opts.header.trimEnd())

  const things = Object.values(world.things).sort((a, b) => a.name.localeCompare(b.name))
  for (const t of things) blocks.push(serializeThing(t))

  const connsByLca = groupConnsByLca(world)
  const worldLines: string[] = []
  emitSystem(world.root, world, connsByLca, 0, worldLines)
  blocks.push(worldLines.join('\n'))

  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
