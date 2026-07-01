// approve.ts — `topo approve`: record the current (manifest, code) as the approved
// truth by writing system.topo.lock. This is the reach-green + explicit-approval
// gesture. `topo approve` re-locks the whole repo; `topo approve <System…>` re-locks
// only those regions (keeping the rest of the prior lock).

import { readFileSync, existsSync } from 'node:fs'
import { loadConfig } from '../../core/config'
import { mapPath } from '../../core/paths'
import { parseTopos } from '../../core/topos'
import { buildSnapshot } from '../../core/coverage/snapshot'
import { readLock, writeLock, type LockFile, type RegionLock } from '../../core/coverage/lock'

export interface ApproveOptions {
  dir?: string
  systems?: string[]
  confirm?: boolean
  json?: boolean
}

function diffRegion(prior: RegionLock | undefined, next: RegionLock): string {
  const p = prior?.files ?? {}
  const n = next.files
  let added = 0
  let changed = 0
  let removed = 0
  for (const k of Object.keys(n)) {
    if (!(k in p)) added++
    else if (p[k] !== n[k]) changed++
  }
  for (const k of Object.keys(p)) if (!(k in n)) removed++
  const total = Object.keys(n).length
  if (!prior) return `${total} file${total === 1 ? '' : 's'} (new)`
  if (!added && !changed && !removed) return `${total} file${total === 1 ? '' : 's'}, unchanged`
  return `+${added} ~${changed} -${removed}  (${total} file${total === 1 ? '' : 's'})`
}

export function runApprove(opts: ApproveOptions): number {
  const { root, config } = loadConfig(opts.dir ?? process.cwd())

  if (config.policy.approval === 'human' && !opts.confirm && !process.stdin.isTTY) {
    console.error(
      `topo: approval policy is 'human' — a person must run 'topo approve --confirm' (or approve in 'topo view').`,
    )
    return 2
  }

  const mp = mapPath(root, config)
  if (!existsSync(mp)) {
    console.error(`topo: no ${config.map} found. Run 'topo init', then author the map.`)
    return 2
  }
  const text = readFileSync(mp, 'utf8')
  const { world, error } = parseTopos(text)
  if (error || !world) {
    console.error(`topo: failed to parse ${config.map}: ${error ?? 'no world found'}`)
    return 2
  }

  const snapshot = buildSnapshot(root, config, world, text)
  const prior = readLock(root, config)
  const scope = opts.systems && opts.systems.length ? new Set(opts.systems) : null

  const systems: Record<string, RegionLock> = {}
  if (scope) {
    if (!prior) {
      console.error(`topo: no ${config.lock} yet — run 'topo approve' (no arguments) first.`)
      return 2
    }
    Object.assign(systems, prior.systems)
    for (const name of scope) {
      const region = snapshot.regions[name]
      if (!region) {
        console.error(`topo: '${name}' owns no code; nothing to re-lock.`)
        return 2
      }
      systems[name] = { globs: world.systems[name]?.codePaths ?? [], files: region.files, digest: region.digest }
    }
  } else {
    for (const [name, region] of Object.entries(snapshot.regions)) {
      systems[name] = { globs: world.systems[name]?.codePaths ?? [], files: region.files, digest: region.digest }
    }
  }

  const lock: LockFile = {
    version: 1,
    world: world.root,
    manifestDigest: scope && prior ? prior.manifestDigest : snapshot.manifestDigest,
    systems,
    coverage: { universe: snapshot.ownership.universe.length, covered: snapshot.ownership.owner.size },
    approvedAt: new Date().toISOString(),
  }
  writeLock(root, config, lock)

  if (opts.json) {
    console.log(JSON.stringify({ approved: config.lock, systems: Object.keys(systems).length }, null, 2))
    return 0
  }

  const names = Object.keys(systems).sort()
  console.log(`Approved ${config.lock}  (${world.root})`)
  for (const name of names) {
    if (scope && !scope.has(name)) continue
    console.log(`  ${name}  ${diffRegion(prior?.systems[name], systems[name])}`)
  }
  const uncovered = snapshot.ownership.uncovered.length
  console.log(
    `${lock.coverage.covered}/${lock.coverage.universe} source files owned by ${names.length} system${names.length === 1 ? '' : 's'}${uncovered ? ` — ${uncovered} still uncovered (topo check)` : '.'}`,
  )
  return 0
}
