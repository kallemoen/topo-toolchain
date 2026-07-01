// init.ts — `topo init`: install Topo into a repo.
// Idempotent and additive: scaffolds a starter manifest (authored by hand, not
// generated), installs the agent skill + manifest reference + CLAUDE.md note, and
// a pre-commit drift guard. The lockfile appears on the first `topo approve`.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
  appendFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { defaultConfig, CONFIG_FILE, type ToposConfig } from '../../core/config'
import { mapPath } from '../../core/paths'
import { ASSETS_DIR } from '../../core/assets'

const ASSETS = ASSETS_DIR

export interface InitOptions {
  dir?: string
  name?: string
  force?: boolean
  hook?: boolean
}

function starterMap(world: string): string {
  return `// ${world} — system map. Authored by hand; Topo does not generate this file.
// Draw your systems, the arrows between them (A --( Thing )--> B), and give each
// system a \`code "glob"\` line so every source file is owned. Then:
//   topo check   → fix drift → topo approve   (writes system.topo.lock)
// Full grammar: .claude/skills/topo/MANIFEST.md

world ${world} {
}
`
}

export function runInit(opts: InitOptions): number {
  const root = resolve(opts.dir ?? process.cwd())
  const cfgFile = join(root, CONFIG_FILE)
  if (existsSync(cfgFile) && !opts.force) {
    console.error(`topo: ${CONFIG_FILE} already exists in ${root}. Re-run with --force to reinstall.`)
    return 2
  }

  const base = defaultConfig(root)
  const config: ToposConfig = { ...base, world: opts.name ?? base.world }
  const log = (s: string) => console.log(`  ${s}`)
  console.log(`Installing Topo into ${root}`)

  // 1. config
  writeFileSync(cfgFile, JSON.stringify(config, null, 2) + '\n')
  log(`wrote ${CONFIG_FILE}`)

  // 2. starter manifest (only if absent — never clobber an authored map)
  const mp = mapPath(root, config)
  if (!existsSync(mp)) {
    writeFileSync(mp, starterMap(config.world))
    log(`scaffolded ${config.map} (empty — author it by hand)`)
  } else {
    log(`${config.map} already exists (kept)`)
  }

  // 3. agent skill + manifest reference
  const skillDir = join(root, '.claude', 'skills', 'topo')
  mkdirSync(skillDir, { recursive: true })
  copyFileSync(join(ASSETS, 'skill', 'SKILL.md'), join(skillDir, 'SKILL.md'))
  copyFileSync(join(ASSETS, 'MANIFEST.md'), join(skillDir, 'MANIFEST.md'))
  log(`installed .claude/skills/topo/{SKILL,MANIFEST}.md`)

  // 4. CLAUDE.md rule note
  const claudeMd = join(root, 'CLAUDE.md')
  const note = readFileSync(join(ASSETS, 'claude-rule.md'), 'utf8')
  if (!existsSync(claudeMd)) {
    writeFileSync(claudeMd, `# ${config.world}\n\n${note}`)
    log(`created CLAUDE.md with the Topo rule note`)
  } else if (!readFileSync(claudeMd, 'utf8').includes('## Topo system map')) {
    appendFileSync(claudeMd, `\n${note}`)
    log(`appended the Topo rule note to CLAUDE.md`)
  } else {
    log(`CLAUDE.md already has the Topo rule note (skipped)`)
  }

  // 5. pre-commit hook
  if (opts.hook !== false) {
    const hooksDir = join(root, '.git', 'hooks')
    if (existsSync(hooksDir)) {
      const hookFile = join(hooksDir, 'pre-commit')
      if (!existsSync(hookFile)) {
        copyFileSync(join(ASSETS, 'pre-commit'), hookFile)
        chmodSync(hookFile, 0o755)
        log(`installed .git/hooks/pre-commit (drift blocker)`)
      } else if (!readFileSync(hookFile, 'utf8').includes('Topo drift guard')) {
        appendFileSync(
          hookFile,
          `\n# --- Topo drift guard (added by topo init) ---\nif command -v topo >/dev/null 2>&1; then topo check || exit 1; else npx --no-install topo check || exit 1; fi\n`,
        )
        log(`appended a Topo drift check to the existing pre-commit hook`)
      } else {
        log(`pre-commit hook already has the Topo drift guard (skipped)`)
      }
    } else {
      log(`no .git/hooks found — skipped the pre-commit hook`)
    }
  }

  console.log(`\nNext — author the map (world '${config.world}'):`)
  console.log('  1. Read  .claude/skills/topo/SKILL.md   (the loop + how to author the manifest)')
  console.log(`  2. Edit  ${config.map}   — draw your systems + arrows, and add a`)
  console.log('           code "glob" to each so every source file is owned')
  console.log('  3. Run   topo check     — lists uncovered files + what to fix')
  console.log('  4. Run   topo approve   — records the approved snapshot (system.topo.lock)')
  console.log('     then  topo view      — watch the live map in your browser')
  console.log(`\n  (World name is '${config.world}'. Re-run with --name <World> to change it.)`)
  return 0
}
