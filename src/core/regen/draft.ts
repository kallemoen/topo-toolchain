// draft.ts — draft summary, draft metadata, and header preservation.

import type { ToposWorld, ToposSystem } from '../topos'

export interface DraftSummary {
  added: string[]
  removed: string[]
  changed: string[]
}

export interface DraftMeta {
  base: string // sha256 of the live map when the draft was generated
  generatedAt: string
  summary: DraftSummary
}

function structuralKey(s: ToposSystem): string {
  return [s.kind, s.parent, [...s.ins].sort().join(','), [...s.outs].sort().join(','), [...s.holds].sort().join(',')].join('|')
}

/** What changed between the prior map and the regenerated world (systems only). */
export function summarizeDiff(prior: ToposWorld | null, next: ToposWorld): DraftSummary {
  const prev = prior?.systems ?? {}
  const nextNames = new Set(Object.values(next.systems).filter((s) => s.kind !== 'world').map((s) => s.name))
  const prevNames = new Set(Object.values(prev).filter((s) => s.kind !== 'world').map((s) => s.name))
  const added = [...nextNames].filter((n) => !prevNames.has(n)).sort()
  const removed = [...prevNames].filter((n) => !nextNames.has(n)).sort()
  const changed = [...nextNames]
    .filter((n) => prevNames.has(n) && structuralKey(next.systems[n]) !== structuralKey(prev[n]))
    .sort()
  return { added, removed, changed }
}

/** Pull the leading `//` comment block off a .topo file, to carry it forward. */
export function extractHeader(src: string): string | undefined {
  const head: string[] = []
  for (const line of src.split('\n')) {
    const t = line.trim()
    if (t === '') {
      if (head.length) break
      continue
    }
    if (t.startsWith('//')) head.push(line.replace(/\s+$/, ''))
    else break
  }
  return head.length ? head.join('\n') : undefined
}

export function isEmptyDiff(s: DraftSummary): boolean {
  return s.added.length === 0 && s.removed.length === 0 && s.changed.length === 0
}
