// config.ts — load/resolve topo.config.json with defaults.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, basename, resolve } from 'node:path'

/** What must be owned by a system for `topo check` to pass. */
export type CoveragePolicy = 'strict' | 'mapped' | 'off'
/** Who may write the lock (accept the current code+manifest as truth). */
export type ApprovalPolicy = 'agent' | 'human'
/** How a changed already-declared region is treated. */
export type RegionChangePolicy = 'block' | 'warn'

export interface ToposPolicy {
  coverage: CoveragePolicy
  approval: ApprovalPolicy
  onRegionChange: RegionChangePolicy
}

export interface ToposConfig {
  world: string // world/root name
  map: string // path to the manifest (system.topo), relative to repo root
  lock: string // path to the digest lockfile (system.topo.lock)
  include: string[] // glob(s) of source files that must be owned (the coverage universe)
  ignore: string[] // extra ignore globs (on top of .gitignore + built-in deny list)
  viewer: { port: number }
  check: { strict: boolean }
  policy: ToposPolicy
}

export const CONFIG_FILE = 'topo.config.json'

// The default coverage universe: common source-code extensions. Whole-repo-strict
// coverage requires every matched file to be owned by a system, so this is scoped
// to code (docs/config/data are excluded) and is meant to be tuned per repo.
const DEFAULT_INCLUDE = [
  '**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,rb,java,kt,kts,php,cs,swift,scala,c,cc,cpp,h,hh,hpp,m,mm,vue,svelte,sql,sh}',
]

export function defaultConfig(dir: string): ToposConfig {
  return {
    world: titleCase(basename(resolve(dir))),
    map: 'system.topo',
    lock: 'system.topo.lock',
    include: DEFAULT_INCLUDE,
    ignore: ['dist/**', 'build/**', '**/*.min.*'],
    viewer: { port: 4517 },
    check: { strict: false },
    policy: { coverage: 'strict', approval: 'agent', onRegionChange: 'block' },
  }
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]+/g, ' ')
    .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, '')
}

/** Walk up from `start` until a topo.config.json is found; else return `start`. */
export function findRepoRoot(start: string): string {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir
    const parent = dirname(dir)
    if (parent === dir) return resolve(start)
    dir = parent
  }
}

/** Load and merge config from `dir` (or its nearest ancestor with a config). */
export function loadConfig(dir: string): { root: string; config: ToposConfig } {
  const root = findRepoRoot(dir)
  const base = defaultConfig(root)
  const file = join(root, CONFIG_FILE)
  if (!existsSync(file)) return { root, config: base }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<ToposConfig>
    return {
      root,
      config: {
        ...base,
        ...parsed,
        viewer: { ...base.viewer, ...(parsed.viewer ?? {}) },
        check: { ...base.check, ...(parsed.check ?? {}) },
        policy: { ...base.policy, ...(parsed.policy ?? {}) },
      },
    }
  } catch {
    return { root, config: base }
  }
}
