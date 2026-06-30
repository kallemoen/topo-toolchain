#!/usr/bin/env node
// topo launcher — runs the TypeScript CLI through the package's own bundled tsx,
// so `topo` works after a plain `npm install` (no global tsx, no per-call npx).
// stdio is inherited and the child's exit code propagates, so `topo check` stays
// a usable hard blocker (exit 0/1/2) and `topo view` streams to your terminal.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tsx = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx')
const entry = join(root, 'src', 'cli', 'index.ts')

if (!existsSync(tsx)) {
  console.error("topo: dependencies not installed. Run `npm install` in the topo-toolchain package first.")
  process.exit(2)
}

const child = spawn(tsx, [entry, ...process.argv.slice(2)], { stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
