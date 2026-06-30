// report.ts — render a DriftReport for humans (the --json form is the raw object).

import chalk from 'chalk'
import type { DriftReport, DriftEntry, DriftCategory } from '../types'

const HEADING: Record<DriftCategory, string> = {
  'in-code-not-map': 'In code, not in map',
  'in-map-not-code': 'In map, not in code',
  conflicting: 'Conflicting',
  'unclear-boundary': 'Unclear (warnings)',
}

const COLOR: Record<DriftCategory, (s: string) => string> = {
  'in-code-not-map': chalk.yellow,
  'in-map-not-code': chalk.magenta,
  conflicting: chalk.red,
  'unclear-boundary': chalk.gray,
}

function loc(e: DriftEntry): string {
  return e.location ? `${e.location.file}:${e.location.line}` : '—'
}

export function renderHuman(report: DriftReport): string {
  const lines: string[] = []
  const cats: DriftCategory[] = ['in-code-not-map', 'in-map-not-code', 'conflicting', 'unclear-boundary']

  for (const cat of cats) {
    const group = report.entries.filter((e) => e.category === cat)
    if (!group.length) continue
    lines.push('')
    lines.push(COLOR[cat](chalk.bold(`${HEADING[cat]} (${group.length})`)))
    for (const e of group) {
      lines.push(`  ${chalk.bold(e.system)}  ${chalk.dim(loc(e))}`)
      lines.push(`    ${e.detail}`)
      lines.push(`    ${chalk.cyan('→')} ${chalk.dim(e.suggestion)}`)
    }
  }

  lines.push('')
  if (report.passed) {
    lines.push(chalk.green(`✓ map is in sync`) + chalk.dim(`  (${report.scan.systems} systems, ${report.scan.filesScanned} files)`))
  } else {
    const w = report.warnings ? chalk.dim(` + ${report.warnings} warning${report.warnings === 1 ? '' : 's'}`) : ''
    lines.push(chalk.red(`✗ ${report.failures} drift failure${report.failures === 1 ? '' : 's'}`) + w)
  }
  return lines.join('\n')
}
