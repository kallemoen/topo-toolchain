// approve.ts — `topo approve`: promote the draft map to live (or --reject it).
// Guards on the base hash so an approval can't silently clobber a map that moved.

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { loadConfig } from '../../core/config'
import { mapPath, draftPath, draftMetaPath } from '../../core/paths'
import { sha256 } from '../../core/hash'
import type { DraftMeta } from '../../core/regen/draft'

export interface ApproveOptions {
  dir?: string
  reject?: boolean
}

export function runApprove(opts: ApproveOptions): number {
  const { root, config } = loadConfig(opts.dir ?? process.cwd())
  const dp = draftPath(root, config)
  const mtp = draftMetaPath(root, config)

  if (!existsSync(dp)) {
    console.error(`topo: no draft at ${config.draft}. Run 'topo propose' first.`)
    return 2
  }

  if (opts.reject) {
    rmSync(dp)
    if (existsSync(mtp)) rmSync(mtp)
    console.log(`Rejected — discarded ${config.draft}.`)
    return 0
  }

  const mp = mapPath(root, config)
  const currentBase = existsSync(mp) ? sha256(readFileSync(mp, 'utf8')) : sha256('')
  if (existsSync(mtp)) {
    try {
      const meta = JSON.parse(readFileSync(mtp, 'utf8')) as DraftMeta
      if (meta.base !== currentBase) {
        console.error(`topo: the live map changed since this draft was generated. Re-run 'topo propose'.`)
        return 1
      }
    } catch {
      /* malformed meta — proceed without the guard */
    }
  }

  writeFileSync(mp, readFileSync(dp, 'utf8'))
  rmSync(dp)
  if (existsSync(mtp)) rmSync(mtp)
  console.log(`Approved — ${config.map} updated.`)
  return 0
}
