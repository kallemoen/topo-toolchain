// config.ts — load/resolve topo.config.json with defaults.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, basename, resolve } from 'node:path'

export interface ToposConfig {
  world: string // world/root name
  map: string // path to the live map, relative to repo root
  draft: string // path to the draft map
  include: string[] // glob(s) of files to scan
  ignore: string[] // extra ignore globs (on top of .gitignore + built-in deny list)
  viewer: { port: number }
  check: { strict: boolean }
}

export const CONFIG_FILE = 'topo.config.json'

export function defaultConfig(dir: string): ToposConfig {
  return {
    world: titleCase(basename(resolve(dir))),
    map: 'system.topo',
    draft: 'system.draft.topo',
    include: ['**/*'],
    ignore: ['dist/**', 'build/**', '**/*.min.*'],
    viewer: { port: 4517 },
    check: { strict: false },
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
      },
    }
  } catch {
    return { root, config: base }
  }
}
