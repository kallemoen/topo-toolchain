import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseTopos, EXAMPLES, type ToposWorld } from '../src/core/topos'
import { serializeTopos } from '../src/core/serialize'

const here = dirname(fileURLToPath(import.meta.url))

/** Strip formatting/ordering so we compare the MODEL, not the text. */
function canon(w: ToposWorld) {
  return {
    root: w.root,
    systems: Object.values(w.systems)
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        parent: s.parent,
        children: [...s.children].sort(),
        ins: [...s.ins].sort(),
        outs: [...s.outs].sort(),
        holds: [...s.holds].sort(),
        desc: s.desc ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    things: Object.values(w.things)
      .map((t) => ({ name: t.name, fields: t.fields.map((f) => `${f.name}:${f.type}`).sort() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    conns: w.conns.map((c) => `${c.from}|${c.thing}|${c.to}`).sort(),
  }
}

function roundTrips(src: string) {
  const w1 = parseTopos(src).world
  expect(w1).not.toBeNull()
  const text = serializeTopos(w1!)
  const w2 = parseTopos(text).world
  expect(w2, `re-parse failed for:\n${text}`).not.toBeNull()
  expect(canon(w2!)).toEqual(canon(w1!))
}

describe('serializeTopos — round-trips through parseTopos', () => {
  for (const ex of EXAMPLES) {
    it(`round-trips example: ${ex.key}`, () => roundTrips(ex.src))
  }

  const meta = join(here, '..', '..', 'topo-toolchain.topo')
  it.skipIf(!existsSync(meta))('round-trips the meta-model topo-toolchain.topo', () => {
    roundTrips(readFileSync(meta, 'utf8'))
  })

  it('emits empty things and preserves descriptions', () => {
    const src = `thing T { }\nworld W {\n  activity A {  // does a thing\n    out T\n  }\n}\n`
    const text = serializeTopos(parseTopos(src).world!)
    expect(text).toContain('thing T { }')
    expect(text).toContain('// does a thing')
    roundTrips(src)
  })
})
