// report.ts — render a DriftReport for the terminal.
//
// Findings are grouped when a category is bulky (real repos produce hundreds of
// near-identical rows), and the coverage summary rides on the header line so it's
// never mistaken for a finding. `topo check --json` always has the full per-file list.

import type { DriftReport, DriftEntry } from '../types'

const LABEL: Record<DriftEntry['category'], string> = {
  'manifest-unapproved': 'not approved',
  'region-changed': 'region changed',
  'uncovered-code': 'uncovered',
  'dangling-code': 'dangling glob',
  'ambiguous-ownership': 'ambiguous',
  'unknown-endpoint': 'design: unknown endpoint',
  'bare-leaf': 'design: bare leaf',
  'disconnected-system': 'design: disconnected',
  'boundary-gap': 'design: boundary gap',
  'undeclared-thing': 'design: undeclared thing',
  'empty-thing': 'design: empty thing',
}

const HINT: Record<DriftEntry['category'], string> = {
  'manifest-unapproved': 'run `topo approve`',
  'region-changed': 'review the code; update system.topo if the structure changed, then `topo approve`',
  'uncovered-code': "add each to a system's `code` glob, or to \"ignore\" in topo.config.json",
  'dangling-code': 'fix or remove these globs',
  'ambiguous-ownership': 'make one glob more specific, or nest one system inside the other (the child wins)',
  'unknown-endpoint': 'declare the missing box or fix the name',
  'bare-leaf': 'declare in/out/holds on every leaf — the boundary is what makes each level readable',
  'disconnected-system': 'wire it in with boundaries + arrows, or fold its code into the system it serves',
  'boundary-gap': 'declare the Thing on every edge the arrow crosses',
  'undeclared-thing': "declare 'thing X { field: type }' for every Thing the map uses",
  'empty-thing': 'give each thing its fields — the data shapes are half the design',
}

const GROUP_THRESHOLD = 6

/** How bulk findings collapse: uncovered by top-level dir, ambiguous by system pair. */
function groupKey(e: DriftEntry): string {
  if (e.category === 'uncovered-code' && e.location) return `${e.location.file.split('/')[0]}/…`
  return e.system || e.detail
}

function coverageLine(r: DriftReport): string {
  const c = r.coverage
  return `${c.covered}/${c.universe} files owned by ${c.systemsWithCode} system${c.systemsWithCode === 1 ? '' : 's'}${c.uncovered ? `, ${c.uncovered} uncovered` : ''}`
}

export function renderReport(r: DriftReport): string {
  const cov = coverageLine(r)

  if (r.passed && r.entries.length === 0) return `✓ map is in sync  (${cov})`

  const failures = r.entries.filter((e) => !e.warning)
  const lines: string[] = []

  // Clean and fully covered — the only blocker is approval. Not "drift".
  if (failures.length > 0 && failures.every((e) => e.category === 'manifest-unapproved')) {
    lines.push(`● not approved yet — coverage is clean (${cov}). Run \`topo approve\` to lock it in.`)
    if (r.warnings === 0) return lines[0]
  } else if (failures.length === 0) {
    lines.push(`✓ map is in sync  (${cov}) — ${r.warnings} design warning${r.warnings > 1 ? 's' : ''} below`)
  } else {
    const counts = `${r.failures} to fix${r.warnings ? `, ${r.warnings} warning${r.warnings > 1 ? 's' : ''}` : ''}`
    lines.push(`✗ map has drifted — ${counts}  (${cov})`)
  }

  const byCat = new Map<DriftEntry['category'], DriftEntry[]>()
  for (const e of r.entries) {
    const a = byCat.get(e.category) ?? []
    a.push(e)
    byCat.set(e.category, a)
  }

  for (const [cat, entries] of byCat) {
    lines.push('')
    lines.push(`  ${LABEL[cat]} (${entries.length}):`)
    if (entries.length > GROUP_THRESHOLD) {
      const groups = new Map<string, { count: number; example?: string }>()
      for (const e of entries) {
        const key = groupKey(e)
        const g = groups.get(key) ?? { count: 0, example: e.location?.file }
        g.count++
        groups.set(key, g)
      }
      const sorted = [...groups.entries()].sort((a, b) => b[1].count - a[1].count)
      for (const [key, g] of sorted.slice(0, 12)) {
        lines.push(`    ${g.count} × ${key}${g.example ? `   e.g. ${g.example}` : ''}`)
      }
      if (sorted.length > 12) lines.push(`    …and ${sorted.length - 12} more`)
      lines.push(`    → ${HINT[cat]}   (topo check --json for the full list)`)
    } else {
      for (const e of entries) {
        const loc = e.location ? `  (${e.location.file}${e.location.line ? `:${e.location.line}` : ''})` : ''
        lines.push(`    ${e.detail}${loc}`)
        lines.push(`      → ${e.suggestion}`)
      }
    }
  }
  return lines.join('\n')
}
