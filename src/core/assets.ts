// assets.ts — locate the bundled assets dir (skill, rule note, pre-commit hook,
// viewer-dist), working whether we run from source (tsx, dev) or from the single
// bundled file in dist/. Bundling collapses every module's import.meta.url to the
// output file, so we probe a couple of relative locations and pick the real one.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

function resolveAssetsDir(): string {
  for (const rel of ['./assets/', '../assets/', '../../assets/']) {
    const p = fileURLToPath(new URL(rel, import.meta.url))
    if (existsSync(join(p, 'skill'))) return p
  }
  // last resort: alongside this module
  return fileURLToPath(new URL('./assets/', import.meta.url))
}

export const ASSETS_DIR = resolveAssetsDir()
