#!/usr/bin/env node
// topo launcher — runs the TypeScript CLI through the bundled `tsx`, so `topo`
// works after any install (global, npx, or local) with no global tsx and no
// per-call npx. tsx is resolved via Node's module resolution, so it's found
// wherever the installer put it (package node_modules or hoisted). stdio is
// inherited and the child's exit code propagates, so `topo check` stays a usable
// hard blocker (0/1/2) and `topo view` streams to your terminal.

import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

let tsxCli
try {
  const pkgPath = require.resolve('tsx/package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.tsx
  tsxCli = join(dirname(pkgPath), binRel)
} catch {
  console.error('topo: could not locate the bundled `tsx` runtime. Run `npm install` in the topo-toolchain package.')
  process.exit(2)
}

const entry = fileURLToPath(new URL('../src/cli/index.ts', import.meta.url))
const child = spawn(process.execPath, [tsxCli, entry, ...process.argv.slice(2)], { stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
