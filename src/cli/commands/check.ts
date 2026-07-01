// check.ts — `topo check`: the hard blocker.
// Parses the manifest, hashes each declared code region, and diffs against the
// lock while enforcing coverage. Exit 0 = in sync, 1 = drift, 2 = usage/IO error.

import { readFileSync, existsSync } from 'node:fs'
import { loadConfig } from '../../core/config'
import { mapPath } from '../../core/paths'
import { parseTopos } from '../../core/topos'
import { buildSnapshot } from '../../core/coverage/snapshot'
import { readLock } from '../../core/coverage/lock'
import { checkSnapshot } from '../../core/coverage/check'
import { renderReport } from '../../core/coverage/report'

export interface CheckOptions {
  dir?: string
  json?: boolean
  strict?: boolean
}

export function runCheck(opts: CheckOptions): number {
  const { root, config } = loadConfig(opts.dir ?? process.cwd())
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
  const lock = readLock(root, config)
  const report = checkSnapshot(config, world, snapshot, lock, { strict: opts.strict })

  if (opts.json) console.log(JSON.stringify(report, null, 2))
  else console.log(renderReport(report))
  return report.passed ? 0 : 1
}
