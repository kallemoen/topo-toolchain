// report.ts — render a DriftReport for the terminal.

import type { DriftReport, DriftEntry } from '../types'

const LABEL: Record<DriftEntry['category'], string> = {
  'manifest-unapproved': 'not approved',
  'region-changed': 'region changed',
  'uncovered-code': 'uncovered',
  'dangling-code': 'dangling glob',
  'ambiguous-ownership': 'ambiguous',
}

export function renderReport(r: DriftReport): string {
  const c = r.coverage
  const coverageLine = `coverage: ${c.covered}/${c.universe} source files owned by ${c.systemsWithCode} system${c.systemsWithCode === 1 ? '' : 's'}${c.uncovered ? `, ${c.uncovered} uncovered` : ''}`

  if (r.passed && r.entries.length === 0) {
    return `✓ map is in sync  (${coverageLine})`
  }

  const lines: string[] = []
  const counts = `${r.failures} to fix${r.warnings ? `, ${r.warnings} warning${r.warnings > 1 ? 's' : ''}` : ''}`
  lines.push(r.passed ? `✓ map is in sync  (${counts})` : `✗ map has drifted  (${counts})`)
  for (const e of r.entries) {
    const loc = e.location ? `  (${e.location.file}${e.location.line ? `:${e.location.line}` : ''})` : ''
    lines.push('')
    lines.push(`  ${LABEL[e.category]}: ${e.detail}${loc}`)
    lines.push(`    → ${e.suggestion}`)
  }
  lines.push('')
  lines.push(`  ${coverageLine}`)
  return lines.join('\n')
}
