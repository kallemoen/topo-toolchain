import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadConfig } from '../src/core/config'
import { scanClaims } from '../src/core/markers/scan'

const here = dirname(fileURLToPath(import.meta.url))
const sampleRepo = join(here, 'fixtures', 'sample-repo')

describe('scanClaims — extracts marker claims from a repo', () => {
  it('finds the three marked systems across ts + py', () => {
    const { root, config } = loadConfig(sampleRepo)
    const { claims } = scanClaims(root, config)
    const byName = Object.fromEntries(claims.map((c) => [c.system, c]))

    expect(Object.keys(byName).sort()).toEqual(['Api', 'Handler', 'Router'])

    expect(byName.Api).toMatchObject({ kind: 'system', open: true, parent: null })
    expect(byName.Router).toMatchObject({ kind: 'activity', parent: 'Api', ins: ['Request'], outs: ['Query'] })
    expect(byName.Handler).toMatchObject({ kind: 'activity', parent: 'Api', ins: ['Query'], outs: ['Result'] })
  })

  it('anchors locations to the @topo declaration line', () => {
    const { root, config } = loadConfig(sampleRepo)
    const { claims } = scanClaims(root, config)
    const router = claims.find((c) => c.system === 'Router')!
    expect(router.loc.file).toBe('src/router.ts')
    expect(router.loc.line).toBe(2)
  })
})
