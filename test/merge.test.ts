import { describe, it, expect } from 'vitest'
import { parseTopos } from '../src/core/topos'
import { serializeTopos } from '../src/core/serialize'
import { regenerate } from '../src/core/regen/merge'
import { compare } from '../src/core/compare/compare'
import type { MarkerClaim } from '../src/core/types'

const priorSrc = `// SampleApp — system map.

thing Request { id: id  body: text }
thing Query { sql: text }
thing Result { rows: int }

world SampleApp {
  gateway Users {
    out Request
    in Result
  }

  system Api {  // the public API
    activity Router {
      in Request
      out Query
    }
    activity Handler {
      in Query
      out Result
    }
  }

  activity OldThing {
    in Result
  }

  Users --( Request )--> Router
  Router --( Query )--> Handler
  Handler --( Result )--> Users
}
`

const prior = parseTopos(priorSrc).world!

const claim = (p: Partial<MarkerClaim> & { system: string }): MarkerClaim => ({
  kind: 'activity',
  open: false,
  parent: null,
  ins: [],
  outs: [],
  holds: [],
  loc: { file: 'x', line: 1 },
  extraLocs: [],
  ...p,
})

// Markers: keep Api/Router/Handler, add Cache, and (by omission) drop OldThing.
const claims: MarkerClaim[] = [
  claim({ system: 'Api', kind: 'system', open: true }),
  claim({ system: 'Router', parent: 'Api', ins: ['Request'], outs: ['Query'] }),
  claim({ system: 'Handler', parent: 'Api', ins: ['Query'], outs: ['Result'] }),
  claim({ system: 'Cache', kind: 'storage', parent: 'Api', holds: ['Session'] }),
]

describe('regenerate — markers drive structure, map supplies judgment', () => {
  const world = regenerate(claims, prior, { worldName: 'SampleApp' })

  it('preserves thing field schemas the markers do not carry', () => {
    expect(world.things.Request.fields.map((f) => f.name)).toEqual(['id', 'body'])
    expect(world.things.Query.fields).toHaveLength(1)
  })

  it('stubs a newly-referenced thing', () => {
    expect(world.things.Session).toEqual({ name: 'Session', fields: [] })
  })

  it('preserves map-owned gateways and descriptions', () => {
    expect(world.systems.Users?.kind).toBe('gateway')
    expect(world.systems.Api?.desc).toBe('the public API')
  })

  it('adds the newly-marked system and removes the orphan', () => {
    expect(world.systems.Cache?.kind).toBe('storage')
    expect(world.systems.OldThing).toBeUndefined()
  })

  it('derives connections from boundary matching', () => {
    const has = (from: string, thing: string, to: string) =>
      world.conns.some((c) => c.from === from && c.thing === thing && c.to === to)
    expect(has('Router', 'Query', 'Handler')).toBe(true)
    expect(has('Users', 'Request', 'Router')).toBe(true)
  })

  it('the regenerated map is in sync with the markers', () => {
    const reparsed = parseTopos(serializeTopos(world)).world!
    const report = compare(claims, reparsed, { generatedAt: 'T' })
    expect(report.passed).toBe(true)
  })
})
