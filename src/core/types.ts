// Shared toolchain types — the shapes that flow between coverage, digest, and check.

export interface SourceLocation {
  file: string // repo-relative POSIX path
  line?: number // 1-based, when the entry points at a specific line
}

export type DriftCategory =
  | 'uncovered-code' // a source file owned by no system (whole-repo coverage)
  | 'region-changed' // a declared system's code changed since it was last approved
  | 'dangling-code' // a `code` glob matches no source file
  | 'ambiguous-ownership' // a file is claimed by two equally-specific globs
  | 'manifest-unapproved' // system.topo changed (or was never approved) vs the lock
  // design lints — map QUALITY feedback (warnings unless --strict):
  | 'bare-leaf' // an activity/storage/gateway with no in/out/holds
  | 'disconnected-system' // a box wired to nothing in its whole subtree
  | 'boundary-gap' // an arrow crosses a box's edge the box doesn't declare
  | 'unknown-endpoint' // an arrow to/from an undeclared system name
  | 'undeclared-thing' // a Thing used on boundaries/arrows with no `thing` declaration
  | 'empty-thing' // a `thing` declared with no fields — a shape with no shape

export interface DriftEntry {
  category: DriftCategory
  system: string // the system involved, or '' when not system-specific
  detail: string
  location: SourceLocation | null
  suggestion: string
  warning?: boolean // true = non-blocking (promoted to a failure by --strict)
}

export interface CoverageStats {
  universe: number // source files in scope (config.include minus ignores)
  covered: number
  uncovered: number
  systemsWithCode: number
}

export interface DriftReport {
  passed: boolean
  failures: number // blocking entries
  warnings: number // non-blocking entries (promoted to failures under --strict)
  entries: DriftEntry[]
  generatedAt: string // ISO; never part of any digest
  scan: { filesScanned: number; systems: number }
  coverage: CoverageStats
}
