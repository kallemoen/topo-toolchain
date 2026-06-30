// grammar.ts — the marker syntax (comment markers) and the line classifier.
//
// A marker is a single comment line whose payload begins with the sentinel
// `@topo`. The comment opener can be any common one (// # -- ; % <!-- /* *), so
// the same grammar works across languages by simple pattern matching.
//
//   //@topo activity <Name> [parent=<Parent>]      (a leaf that does something)
//   //@topo storage  <Name> [parent=<Parent>]      (a leaf that holds things)
//   //@topo gateway  <Name> [parent=<Parent>]      (a crossing to another world)
//   //@topo system   <Name> [parent=<Parent>]      (an OPEN container)
//   //@topo in <Thing>   //@topo out <Thing>   //@topo holds <Thing>
//
// The keyword IS the Topo kind (open = `system`, closed = activity/storage/gateway),
// which is cleaner than a generic keyword + kind= flag and maps 1:1 to the language.
// `kind=` and `open` are still accepted as optional aliases for forward-compat.

import type { MarkerKind } from '../types'

/** Pull the payload after `@topo` out of any comment line. Group 1 = payload. */
const SENTINEL = /(?:\/\/|#|--|;|%|<!--|\/\*|\*)\s*@topo\b[ \t]*(.*)$/

const SYSTEM_RE = /^(system|activity|storage|gateway)\s+([A-Za-z_]\w*)\b(.*)$/
const BOUND_RE = /^(in|out|holds)\s+\[?([A-Za-z_]\w*)\]?\s*$/

export interface SystemLine {
  type: 'system'
  kind: MarkerKind
  name: string
  parent: string | null
}

export interface BoundaryLine {
  type: 'boundary'
  dir: 'in' | 'out' | 'holds'
  thing: string
}

export type MarkerLine = SystemLine | BoundaryLine

const KINDS = new Set<MarkerKind>(['system', 'activity', 'storage', 'gateway'])

// Strip a trailing block-comment closer (star-slash or -->) and surrounding space.
function cleanPayload(raw: string): string {
  return raw.replace(/\s*(?:-->|\*\/)\s*$/, '').trim()
}

/** Parse the option tail of a system marker (`parent=X kind=Y open`). */
function parseOpts(rest: string): { parent: string | null; kindOverride: MarkerKind | null; open: boolean } {
  let parent: string | null = null
  let kindOverride: MarkerKind | null = null
  let open = false
  for (const tok of rest.trim().split(/\s+/).filter(Boolean)) {
    if (tok === 'open') open = true
    else if (tok.startsWith('parent=')) parent = tok.slice(7) || null
    else if (tok.startsWith('kind=')) {
      const k = tok.slice(5)
      if (KINDS.has(k as MarkerKind)) kindOverride = k as MarkerKind
    }
  }
  return { parent, kindOverride, open }
}

/**
 * Classify one raw source line. Returns a structural MarkerLine, or null if the
 * line carries no recognizable `@topo` marker (the common case — cheap to reject).
 */
export function classifyLine(rawLine: string): MarkerLine | null {
  const m = SENTINEL.exec(rawLine)
  if (!m) return null
  const payload = cleanPayload(m[1])
  if (!payload) return null

  const sys = SYSTEM_RE.exec(payload)
  if (sys) {
    const keyword = sys[1] as MarkerKind
    const name = sys[2]
    const { parent, kindOverride, open } = parseOpts(sys[3] ?? '')
    let kind: MarkerKind = kindOverride ?? keyword
    if (open) kind = 'system'
    return { type: 'system', kind, name, parent }
  }

  const bound = BOUND_RE.exec(payload)
  if (bound) {
    return { type: 'boundary', dir: bound[1] as 'in' | 'out' | 'holds', thing: bound[2] }
  }

  return null // an @topo line we don't understand — ignored (lenient, like the parser)
}

/** True if a line contains the sentinel at all (used to gate the cheap path). */
export function hasMarker(rawLine: string): boolean {
  return SENTINEL.test(rawLine)
}
