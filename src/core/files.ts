// files.ts — the shared source-file walker.
//
// Enumerates repo files with the same rules everywhere (fast-glob + .gitignore +
// config.ignore + a built-in deny list + a binary filter), so coverage, digests,
// and the viewer all agree on what "the code" is. POSIX-relative paths, sorted.

import fg from 'fast-glob'
import ignore from 'ignore'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ToposConfig } from './config'

const BUILTIN_DENY = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.topo/**',
  '**/dist/**',
  '**/build/**',
  '**/*.lock',
  '**/*-lock.json',
]

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'pdf', 'zip', 'gz', 'tar', 'woff', 'woff2',
  'ttf', 'eot', 'mp4', 'mov', 'mp3', 'wav', 'bin', 'exe', 'wasm', 'class', 'o', 'a', 'so',
  'dylib', 'dll', 'lockb',
])

function isBinaryExt(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return false
  return BINARY_EXT.has(path.slice(dot + 1).toLowerCase())
}

function looksBinary(text: string): boolean {
  const n = Math.min(text.length, 8192)
  for (let i = 0; i < n; i++) if (text.charCodeAt(i) === 0) return true
  return false
}

function makeIgnore(root: string, config: ToposConfig) {
  const ig = ignore()
  const gitignore = join(root, '.gitignore')
  if (existsSync(gitignore)) ig.add(readFileSync(gitignore, 'utf8'))
  if (config.ignore.length) ig.add(config.ignore)
  return ig
}

/** Every source file in the coverage universe (config.include minus ignores/binary). */
export function listSourceFiles(root: string, config: ToposConfig): string[] {
  const ig = makeIgnore(root, config)
  const entries = fg.sync(config.include, {
    cwd: root,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: BUILTIN_DENY,
  })
  return entries.filter((p) => !isBinaryExt(p) && !ig.ignores(p)).sort()
}

/** Files matching the given glob(s), under the same ignore chain. Not restricted to
 * the coverage universe — callers intersect with listSourceFiles() when they need to. */
export function matchGlobs(root: string, globs: string[], config: ToposConfig): string[] {
  if (!globs.length) return []
  const ig = makeIgnore(root, config)
  const entries = fg.sync(globs, {
    cwd: root,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: BUILTIN_DENY,
  })
  return entries.filter((p) => !isBinaryExt(p) && !ig.ignores(p)).sort()
}

/** Read a repo-relative file as text, or null if missing/binary. */
export function readFileText(root: string, rel: string): string | null {
  try {
    const text = readFileSync(join(root, rel), 'utf8')
    return looksBinary(text) ? null : text
  } catch {
    return null
  }
}
