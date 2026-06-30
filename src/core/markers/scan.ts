// scan.ts — enumerate repo files and extract marker claims, language-agnostically.
//
// Cheap by construction: whole files without the sentinel are rejected with one
// substring test; only the rest are line-classified. Result is deterministic.

import fg from 'fast-glob'
import ignore from 'ignore'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MarkerClaim } from '../types'
import type { ToposConfig } from '../config'
import { claimsForFile, mergeClaims } from './claims'

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
  'dylib', 'dll', 'jpg', 'lockb',
])

export interface ScanResult {
  claims: MarkerClaim[]
  filesScanned: number
}

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

export function scanClaims(root: string, config: ToposConfig): ScanResult {
  const ig = ignore()
  const gitignore = join(root, '.gitignore')
  if (existsSync(gitignore)) ig.add(readFileSync(gitignore, 'utf8'))
  if (config.ignore.length) ig.add(config.ignore)

  // fast-glob returns POSIX-relative paths on every platform.
  const entries = fg.sync(config.include, {
    cwd: root,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: BUILTIN_DENY,
  })

  const files = entries.filter((p) => !isBinaryExt(p) && !ig.ignores(p)).sort()

  const all: MarkerClaim[] = []
  let scanned = 0
  for (const rel of files) {
    let text: string
    try {
      text = readFileSync(join(root, rel), 'utf8')
    } catch {
      continue
    }
    if (looksBinary(text)) continue
    scanned++
    if (!text.includes('@topo')) continue // whole-file fast reject
    const fileClaims = claimsForFile(rel, text.split('\n'))
    if (fileClaims.length) all.push(...fileClaims)
  }

  return { claims: mergeClaims(all), filesScanned: scanned }
}
