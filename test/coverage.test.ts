import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { defaultConfig, type ToposConfig } from '../src/core/config'
import { parseTopos } from '../src/core/topos'
import { resolveOwnership } from '../src/core/coverage/resolve'
import { buildSnapshot } from '../src/core/coverage/snapshot'
import { checkSnapshot } from '../src/core/coverage/check'
import { readLock, writeLock, type LockFile, type RegionLock } from '../src/core/coverage/lock'

const made: string[] = []
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

function repo(files: Record<string, string>): { root: string; config: ToposConfig } {
  const root = mkdtempSync(join(tmpdir(), 'topo-'))
  made.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  return { root, config: defaultConfig(root) }
}

function lockFrom(root: string, config: ToposConfig, text: string): LockFile {
  const world = parseTopos(text).world!
  const snap = buildSnapshot(root, config, world, text)
  const systems: Record<string, RegionLock> = {}
  for (const [name, r] of Object.entries(snap.regions))
    systems[name] = { globs: world.systems[name].codePaths, files: r.files, digest: r.digest }
  return {
    version: 1,
    world: world.root,
    manifestDigest: snap.manifestDigest,
    systems,
    coverage: { universe: snap.ownership.universe.length, covered: snap.ownership.owner.size },
    approvedAt: '',
  }
}

describe('resolveOwnership', () => {
  it('attributes files to the most-specific glob, and flags dangling globs', () => {
    const { root, config } = repo({
      'src/payments/charge.ts': 'a',
      'src/api/router.ts': 'b',
      'src/orphan.ts': 'c',
    })
    const world = parseTopos(
      `world W {\n  system App {\n    code "src/**"\n    system Payments { code "src/payments/**" }\n    system Api { code "src/api/**" }\n  }\n  gateway Ext { code "vendor/**" }\n}\n`,
    ).world!
    const own = resolveOwnership(root, config, world)
    expect(own.owner.get('src/payments/charge.ts')).toBe('Payments')
    expect(own.owner.get('src/api/router.ts')).toBe('Api')
    expect(own.owner.get('src/orphan.ts')).toBe('App')
    expect(own.uncovered).toEqual([])
    expect(own.dangling).toEqual([{ system: 'Ext', glob: 'vendor/**' }])
  })

  it('reports files owned by nobody as uncovered', () => {
    const { root, config } = repo({ 'src/a.ts': 'a', 'docs/b.ts': 'b' })
    const world = parseTopos(`world W {\n  system S { code "src/**" }\n}\n`).world!
    const own = resolveOwnership(root, config, world)
    expect(own.owner.get('src/a.ts')).toBe('S')
    expect(own.uncovered).toEqual(['docs/b.ts'])
  })

  it('flags equally-specific rival claims as ambiguous', () => {
    const { root, config } = repo({ 'src/x.ts': 'x' })
    const world = parseTopos(`world W {\n  system A { code "src/x.ts" }\n  system B { code "src/x.ts" }\n}\n`).world!
    const own = resolveOwnership(root, config, world)
    expect(own.ambiguous).toEqual([{ file: 'src/x.ts', systems: ['A', 'B'] }])
    expect(own.owner.get('src/x.ts')).toBe('A') // deterministic
  })
})

describe('checkSnapshot', () => {
  const text = `world W {\n  system Payments { code "src/pay/**" }\n  system Api { code "src/api/**" }\n}\n`

  it('is unapproved without a lock, green once locked, and catches a region change', () => {
    const { root, config } = repo({ 'src/pay/charge.ts': 'v1\n', 'src/api/router.ts': 'r\n' })
    const world = parseTopos(text).world!

    let snap = buildSnapshot(root, config, world, text)
    let rep = checkSnapshot(config, world, snap, null, { generatedAt: 'x' })
    expect(rep.passed).toBe(false)
    expect(rep.entries.some((e) => e.category === 'manifest-unapproved')).toBe(true)
    expect(rep.coverage).toMatchObject({ universe: 2, covered: 2, uncovered: 0 })

    const lock = lockFrom(root, config, text)
    rep = checkSnapshot(config, world, snap, lock, { generatedAt: 'x' })
    expect(rep.passed).toBe(true)

    writeFileSync(join(root, 'src/pay/charge.ts'), 'v2\n')
    snap = buildSnapshot(root, config, world, text)
    rep = checkSnapshot(config, world, snap, lock, { generatedAt: 'x' })
    expect(rep.passed).toBe(false)
    expect(rep.entries.find((e) => e.category === 'region-changed')?.system).toBe('Payments')
  })

  it('flags a manifest edit as unapproved even when code is unchanged', () => {
    const { root, config } = repo({ 'src/pay/charge.ts': 'v1\n', 'src/api/router.ts': 'r\n' })
    const world = parseTopos(text).world!
    const snap = buildSnapshot(root, config, world, text)
    const lock = lockFrom(root, config, text)
    // Re-lock with a different manifest digest to simulate an unapproved diagram edit.
    const staleLock = { ...lock, manifestDigest: 'deadbeef' }
    const rep = checkSnapshot(config, world, snap, staleLock, { generatedAt: 'x' })
    expect(rep.entries.some((e) => e.category === 'manifest-unapproved')).toBe(true)
  })

  it('honors policy.coverage (strict vs mapped vs off)', () => {
    // charge.ts is owned; extra.ts sits in the same (mapped) dir; util.ts is elsewhere.
    const { root, config } = repo({
      'src/pay/charge.ts': 'c',
      'src/pay/extra.ts': 'e',
      'lib/util.ts': 'u',
    })
    const t = `world W {\n  system Payments { code "src/pay/charge.ts" }\n}\n`
    const world = parseTopos(t).world!
    const snap = buildSnapshot(root, config, world, t)
    const lock = lockFrom(root, config, t)

    const strict = checkSnapshot({ ...config, policy: { ...config.policy, coverage: 'strict' } }, world, snap, lock, { generatedAt: 'x' })
    expect(strict.entries.filter((e) => e.category === 'uncovered-code')).toHaveLength(2)
    expect(strict.warnings).toBe(0)
    expect(strict.passed).toBe(false)

    const mapped = checkSnapshot({ ...config, policy: { ...config.policy, coverage: 'mapped' } }, world, snap, lock, { generatedAt: 'x' })
    expect(mapped.entries.filter((e) => e.category === 'uncovered-code')).toHaveLength(2)
    expect(mapped.warnings).toBe(1) // lib/util.ts is a warning; src/pay/extra.ts still blocks
    expect(mapped.passed).toBe(false)

    const off = checkSnapshot({ ...config, policy: { ...config.policy, coverage: 'off' } }, world, snap, lock, { generatedAt: 'x' })
    expect(off.entries.some((e) => e.category === 'uncovered-code')).toBe(false)
    expect(off.passed).toBe(true)
  })
})

describe('lock IO', () => {
  it('writes and reads back a lockfile', () => {
    const { root, config } = repo({ 'src/a.ts': 'a' })
    const text = `world W {\n  system S { code "src/**" }\n}\n`
    const lock = lockFrom(root, config, text)
    writeLock(root, config, lock)
    expect(readLock(root, config)).toEqual(lock)
  })
})
