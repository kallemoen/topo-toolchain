// topo — the Topo Repo Toolchain CLI.
// The `.topo` manifest is a hand-authored map whose systems declare the code they
// own (`code "glob"`). `topo check` hashes those regions and blocks on drift;
// `topo approve` records the approved snapshot in the lockfile.

import { Command } from 'commander'
import { runCheck } from './commands/check'
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
  .description('Hash the declared code regions, diff against the lock, report drift (the hard blocker)')
  .option('--dir <path>', 'repo directory')
  .option('--json', 'machine-readable report')
  .option('--strict', 'promote warnings to failures')
  .action((o) => process.exit(runCheck({ dir: o.dir, json: o.json, strict: o.strict })))

program
  .command('approve')
  .argument('[systems...]', 're-lock only these systems (default: the whole repo)')
  .description('Record the current code + map as approved — writes the lockfile, reaching green')
  .option('--dir <path>', 'repo directory')
  .option('--confirm', "required under the 'human' approval policy")
  .option('--json', 'machine-readable summary')
  .action((systems, o) => process.exit(runApprove({ dir: o.dir, systems, confirm: o.confirm, json: o.json })))

program
  .command('init')
  .description('Install Topo into a repo: scaffold the manifest, skill, rule note, hook')
  .option('--dir <path>', 'repo directory')
  .option('--name <world>', 'world name (defaults to the repo folder name)')
  .option('--map <file>', 'use an existing .topo file as the manifest (default: system.topo)')
  .option('--force', 'overwrite an existing install')
  .option('--no-hook', 'skip installing the pre-commit hook')
  .action((o) => process.exit(runInit({ dir: o.dir, name: o.name, map: o.map, force: o.force, hook: o.hook })))

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
