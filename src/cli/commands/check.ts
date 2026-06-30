// check.ts — `topo check`: scan markers, compare to the map, report drift.
// Exit 0 = in sync, 1 = drift, 2 = usage/IO error. The hard blocker.

import { readFileSync, existsSync } from 'node:fs'
import { loadConfig } from '../../core/config'
import { mapPath } from '../../core/paths'
import { scanClaims } from '../../core/markers/scan'
import { parseTopos, type ToposWorld } from '../../core/topos'
import { compare } from '../../core/compare/compare'
import { renderHuman } from '../../core/compare/report'

export interface CheckOptions {
  dir?: string
  json?: boolean
  strict?: boolean
}

export function runCheck(opts: CheckOptions): number {
  const { root, config } = loadConfig(opts.dir ?? process.cwd())
  const { claims, filesScanned } = scanClaims(root, config)

  const mp = mapPath(root, config)
  let priorWorld: ToposWorld | null = null
  if (existsSync(mp)) {
    const { world, error } = parseTopos(readFileSync(mp, 'utf8'))
    if (error || !world) {
      console.error(`topo: failed to parse ${config.map}: ${error ?? 'no world found'}`)
      return 2
    }
    priorWorld = world
  }

  const report = compare(claims, priorWorld, { strict: opts.strict, filesScanned })
  if (opts.json) console.log(JSON.stringify(report, null, 2))
  else console.log(renderHuman(report))
  return report.passed ? 0 : 1
}
