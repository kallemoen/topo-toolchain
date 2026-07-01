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
}

const HINT: Record<DriftEntry['category'], string> = {
  'manifest-unapproved': 'run `topo approve`',
  'region-changed': 'review the code; update system.topo if the structure changed, then `topo approve`',
  'uncovered-code': "add each to a system's `code` glob, or to \"ignore\" in topo.config.json",
  'dangling-code': 'fix or remove these globs',
  'ambiguous-ownership': 'make one glob more specific, or nest one system inside the other (the child wins)',
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

  // Clean and fully covered — the only thing left is to approve it. Not "drift".
  if (r.entries.length > 0 && r.entries.every((e) => e.category === 'manifest-unapproved')) {
    return `● not approved yet — coverage is clean (${cov}). Run \`topo approve\` to lock it in.`
  }

  const counts = `${r.failures} to fix${r.warnings ? `, ${r.warnings} warning${r.warnings > 1 ? 's' : ''}` : ''}`
  const lines: string[] = [`✗ map has drifted — ${counts}  (${cov})`]

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
