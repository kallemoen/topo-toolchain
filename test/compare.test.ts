import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { parseTopos } from '../src/core/topos'
import { compare } from '../src/core/compare/compare'
import type { MarkerClaim } from '../src/core/types'

const here = dirname(fileURLToPath(import.meta.url))
const map = parseTopos(readFileSync(join(here, 'fixtures', 'sample-repo', 'system.topo'), 'utf8')).world!

const loc = (file: string) => ({ file, line: 1 })
const claim = (p: Partial<MarkerClaim> & { system: string }): MarkerClaim => ({
  kind: 'activity',
  open: false,
  parent: null,
  ins: [],
  outs: [],
  holds: [],
  loc: loc('x.ts'),
  extraLocs: [],
  ...p,
})

const inSync: MarkerClaim[] = [
  claim({ system: 'Api', kind: 'system', open: true }),
  claim({ system: 'Router', parent: 'Api', ins: ['Request'], outs: ['Query'] }),
  claim({ system: 'Handler', parent: 'Api', ins: ['Query'], outs: ['Result'] }),
]

describe('compare — the drift check', () => {
  it('passes when markers and map agree', () => {
    const r = compare(inSync, map, { generatedAt: 'T' })
    expect(r.entries).toEqual([])
    expect(r.passed).toBe(true)
  })

  it('flags a marked system missing from the map (in-code-not-map)', () => {
    const drifted = [...inSync, claim({ system: 'Cache', kind: 'storage', parent: 'Api', holds: ['Session'] })]
    const r = compare(drifted, map, { generatedAt: 'T' })
    expect(r.passed).toBe(false)
    expect(r.entries.some((e) => e.category === 'in-code-not-map' && e.system === 'Cache')).toBe(true)
  })

  it('flags a kind conflict', () => {
    const drifted = inSync.map((c) => (c.system === 'Router' ? { ...c, kind: 'storage' as const, holds: ['Q'] } : c))
    const r = compare(drifted, map, { generatedAt: 'T' })
    expect(r.entries.some((e) => e.category === 'conflicting' && e.system === 'Router')).toBe(true)
  })

  it('flags a map system with no marker (in-map-not-code), but not gateways', () => {
    const withoutHandler = inSync.filter((c) => c.system !== 'Handler')
    const r = compare(withoutHandler, map, { generatedAt: 'T' })
    expect(r.entries.some((e) => e.category === 'in-map-not-code' && e.system === 'Handler')).toBe(true)
    expect(r.entries.some((e) => e.system === 'Users')).toBe(false) // gateway is map-owned
  })

  it('is deterministic for the same inputs', () => {
    const a = compare(inSync, map, { generatedAt: 'T' })
    const b = compare(inSync, map, { generatedAt: 'T' })
    expect(a).toEqual(b)
  })
})
