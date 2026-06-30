#!/usr/bin/env -S npx tsx
// topo — the Topo Repo Toolchain CLI.
// Keeps an accurate Topo system map in sync with code: markers in code are the
// source of truth, the .topo map is regenerated from them, and `topo check` is a
// hard blocker until code, markers, and map agree.

import { Command } from 'commander'
import { runCheck } from './commands/check'
import { runRegen } from './commands/regen'
import { runApprove } from './commands/approve'
import { runInit } from './commands/init'
import { runView } from './commands/view'

const program = new Command()
program
  .name('topo')
  .description('Topo Repo Toolchain — build & maintain an accurate system map')
  .version('0.1.0')

program
  .command('check')
  .description('Scan markers, compare to the map, report drift (the hard blocker)')
  .option('--dir <path>', 'repo directory')
  .option('--json', 'machine-readable report')
  .option('--strict', 'promote warnings to failures')
  .option('--no-cache', 'ignore the scan cache')
  .action((o) => process.exit(runCheck({ dir: o.dir, json: o.json, strict: o.strict })))

program
  .command('regen')
  .alias('propose')
  .description('Regenerate the map from markers (default: write system.draft.topo)')
  .option('--dir <path>', 'repo directory')
  .option('--write', 'write the live map directly (discouraged)')
  .option('--json', 'machine-readable summary')
  .action((o) => process.exit(runRegen({ dir: o.dir, write: o.write, json: o.json })))

program
  .command('approve')
  .description('Promote the draft map to live (or --reject to discard)')
  .option('--dir <path>', 'repo directory')
  .option('--reject', 'discard the draft instead of approving')
  .action((o) => process.exit(runApprove({ dir: o.dir, reject: o.reject })))

program
  .command('init')
  .description('Install Topo into a repo: scaffold the map, skill, rule note, hook')
  .option('--dir <path>', 'repo directory')
  .option('--name <world>', 'world name (defaults to the repo folder name)')
  .option('--force', 'overwrite an existing install')
  .option('--no-hook', 'skip installing the pre-commit hook')
  .action((o) => process.exit(runInit({ dir: o.dir, name: o.name, force: o.force, hook: o.hook })))

program
  .command('view')
  .description('Start the live viewer: watch the map and serve it in the browser')
  .option('--dir <path>', 'repo directory')
  .option('--port <n>', 'port', (v) => parseInt(v, 10))
  .option('--open', 'open the browser')
  .action((o) => runView({ dir: o.dir, port: o.port, open: o.open }))

program.parseAsync(process.argv).catch((err) => {
  console.error(`topo: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(2)
})
