// Shared toolchain types — the data shapes that flow between scan, compare, regen.
// These mirror the meta-model in topo-toolchain.topo (MarkerClaim, DriftReport, ...).

import type { Kind } from './topos'

/** A marker's kind is the same closed/open vocabulary as Topo (minus 'world'). */
export type MarkerKind = Exclude<Kind, 'world'>

export interface MarkerLocation {
  file: string // repo-relative POSIX path
  line: number // 1-based, the line of the `@topo <kind> <Name>` declaration
}

/** The normalized structural claim a piece of code makes about itself. */
export interface MarkerClaim {
  system: string
  kind: MarkerKind
  open: boolean // true ⇒ a container (kind === 'system'); false ⇒ a leaf
  parent: string | null
  ins: string[]
  outs: string[]
  holds: string[]
  loc: MarkerLocation
  extraLocs: MarkerLocation[] // same system declared in >1 place → a conflict signal
}

export type DriftCategory = 'in-code-not-map' | 'in-map-not-code' | 'conflicting' | 'unclear-boundary'

export interface DriftEntry {
  category: DriftCategory
  system: string
  detail: string
  location: MarkerLocation | null
  suggestion: string
}

export interface DriftReport {
  passed: boolean
  failures: number // blocking entries (excludes warnings unless --strict)
  warnings: number // unclear-boundary entries (non-blocking by default)
  entries: DriftEntry[]
  generatedAt: string // ISO; excluded from any pass/fail hashing
  scan: { filesScanned: number; systems: number }
}

/** A Thing whose producer/consumer wiring is ambiguous at a level. */
export interface Ambiguity {
  thing: string
  producers: string[]
  consumers: string[]
}
