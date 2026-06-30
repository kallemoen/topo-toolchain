// claims.ts — aggregate classified marker lines into normalized MarkerClaims.
//
// Within a file, an `@topo <kind> <Name>` line opens a claim; subsequent
// in/out/holds lines attach to the most recently opened claim. Across files, a
// system declared in more than one place keeps the first as primary and records
// the rest in `extraLocs` (a duplicate-declaration signal for the comparator).

import type { MarkerClaim } from '../types'
import { classifyLine } from './grammar'

export interface RawLine {
  file: string
  line: number // 1-based
  text: string
}

function dedup(arr: string[]): string[] {
  return [...new Set(arr)]
}

/** Build per-file claims from that file's lines (already read). */
export function claimsForFile(file: string, lines: string[]): MarkerClaim[] {
  const claims: MarkerClaim[] = []
  let current: MarkerClaim | null = null

  lines.forEach((text, idx) => {
    const m = classifyLine(text)
    if (!m) return
    if (m.type === 'system') {
      current = {
        system: m.name,
        kind: m.kind,
        open: m.kind === 'system',
        parent: m.parent,
        ins: [],
        outs: [],
        holds: [],
        loc: { file, line: idx + 1 },
        extraLocs: [],
      }
      claims.push(current)
    } else if (current) {
      if (m.dir === 'in') current.ins.push(m.thing)
      else if (m.dir === 'out') current.outs.push(m.thing)
      else current.holds.push(m.thing)
    }
    // a boundary line with no open claim is an orphan — ignored (lenient)
  })

  // Normalize: `holds` implies storage; dedup boundary lists.
  for (const c of claims) {
    c.ins = dedup(c.ins)
    c.outs = dedup(c.outs)
    c.holds = dedup(c.holds)
    if (c.holds.length > 0 && c.kind !== 'storage') {
      c.kind = 'storage'
      c.open = false
    }
  }
  return claims
}

/**
 * Merge per-file claims into one claim per system name. The first occurrence
 * (sorted by file, line) is primary; later ones contribute to extraLocs and
 * union their boundaries. Result is sorted deterministically by system name.
 */
export function mergeClaims(perFile: MarkerClaim[]): MarkerClaim[] {
  const sorted = [...perFile].sort(
    (a, b) => a.loc.file.localeCompare(b.loc.file) || a.loc.line - b.loc.line,
  )
  const bySystem = new Map<string, MarkerClaim>()
  for (const c of sorted) {
    const existing = bySystem.get(c.system)
    if (!existing) {
      bySystem.set(c.system, { ...c, ins: [...c.ins], outs: [...c.outs], holds: [...c.holds], extraLocs: [] })
      continue
    }
    existing.extraLocs.push(c.loc)
    existing.ins = dedup([...existing.ins, ...c.ins])
    existing.outs = dedup([...existing.outs, ...c.outs])
    existing.holds = dedup([...existing.holds, ...c.holds])
    // a later parent= fills in a missing one; conflicts are left for the comparator
    if (!existing.parent && c.parent) existing.parent = c.parent
    if (existing.holds.length > 0) {
      existing.kind = 'storage'
      existing.open = false
    }
  }
  return [...bySystem.values()].sort((a, b) => a.system.localeCompare(b.system))
}
