// lock.ts — the digest lockfile (system.topo.lock): the last approved snapshot of
// the (manifest, code) pair. Committed to git; the diff is the human review surface.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { ToposConfig } from '../config'
import { lockPath } from '../paths'

export interface RegionLock {
  globs: string[] // the system's `code` globs at approval time
  files: Record<string, string> // repo-relative path → sha256
  digest: string // rolled-up region digest
}

export interface LockFile {
  version: 1
  world: string
  manifestDigest: string // sha256 of system.topo at approval time
  systems: Record<string, RegionLock> // only systems that own code
  coverage: { universe: number; covered: number }
  approvedAt: string
}

export function readLock(root: string, config: ToposConfig): LockFile | null {
  const lp = lockPath(root, config)
  if (!existsSync(lp)) return null
  try {
    return JSON.parse(readFileSync(lp, 'utf8')) as LockFile
  } catch {
    return null
  }
}

export function writeLock(root: string, config: ToposConfig, lock: LockFile): void {
  writeFileSync(lockPath(root, config), JSON.stringify(lock, null, 2) + '\n')
}
