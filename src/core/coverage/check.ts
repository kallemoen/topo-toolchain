// check.ts — diff the current snapshot against the lock and enforce coverage.
//
// Emits at most these categories (each with a concrete fix):
//   uncovered-code      a source file no system owns          (coverage policy)
//   region-changed      a declared region's code changed      (onRegionChange policy)
//   dangling-code       a `code` glob matches no source file
//   ambiguous-ownership a file two systems claim equally
//   manifest-unapproved system.topo changed / never approved  (run `topo approve`)

import { dirname } from 'node:path'
import type { ToposConfig } from '../config'
import type { ToposWorld } from '../topos'
import type { DriftEntry, DriftReport } from '../types'
import type { LockFile } from './lock'
import type { Snapshot } from './snapshot'
import { designLints } from './structure'

const CATEGORY_ORDER: Record<DriftEntry['category'], number> = {
  'manifest-unapproved': 0,
  'region-changed': 1,
  'uncovered-code': 2,
  'dangling-code': 3,
  'ambiguous-ownership': 4,
  'unknown-endpoint': 5,
  'bare-leaf': 6,
  'disconnected-system': 7,
  'boundary-gap': 8,
}

/** Directories (and their ancestors) that already contain an owned file. */
function mappedDirs(ownedFiles: Iterable<string>): Set<string> {
  const dirs = new Set<string>()
  for (const f of ownedFiles) {
    let d = dirname(f)
    while (d && d !== '.' && !dirs.has(d)) {
      dirs.add(d)
      d = dirname(d)
    }
  }
  return dirs
}

export function checkSnapshot(
  config: ToposConfig,
  world: ToposWorld,
  snapshot: Snapshot,
  lock: LockFile | null,
  opts: { strict?: boolean; generatedAt?: string } = {},
): DriftReport {
  const { policy } = config
  const { ownership, regions } = snapshot
  const entries: DriftEntry[] = []

  const add = (e: DriftEntry, isWarning: boolean) => {
    entries.push(isWarning ? { ...e, warning: true } : e)
  }

  // 1. Coverage — every universe file must be owned (policy.coverage).
  if (policy.coverage !== 'off') {
    const owned = mappedDirs(ownership.owner.keys())
    for (const file of ownership.uncovered) {
      const inMappedArea = owned.has(dirname(file))
      const isWarning = policy.coverage === 'mapped' && !inMappedArea
      add(
        {
          category: 'uncovered-code',
          system: '',
          detail: `${file} is not owned by any system.`,
          location: { file },
          suggestion: `Add a \`code "…"\` glob to the system this file belongs to in ${config.map} (or add it to "ignore").`,
        },
        isWarning,
      )
    }
  }

  // 2. Dangling globs — a declaration that matches no source file.
  for (const { system, glob } of ownership.dangling) {
    add(
      {
        category: 'dangling-code',
        system,
        detail: `${system}'s code glob "${glob}" matches no source file.`,
        location: null,
        suggestion: `Fix or remove the \`code "${glob}"\` line under ${system} in ${config.map}.`,
      },
      false,
    )
  }

  // 3. Ambiguous ownership — equally-specific rival claims.
  for (const { file, systems } of ownership.ambiguous) {
    add(
      {
        category: 'ambiguous-ownership',
        system: systems.join(', '),
        detail: `${file} is claimed equally by ${systems.join(' and ')}.`,
        location: { file },
        suggestion: `Make one glob more specific so a single system owns ${file}.`,
      },
      false,
    )
  }

  // 4. Design lints — quality of the map itself. Warnings: they guide the author
  // toward a map that reads complete at every level without blocking the commit.
  for (const e of designLints(world)) add(e, true)

  // 5. Approval / region freshness vs the lock.
  if (!lock) {
    add(
      {
        category: 'manifest-unapproved',
        system: '',
        detail: `No ${config.lock} yet — the map hasn't been approved.`,
        location: null,
        suggestion: `Once coverage is clean, run \`topo approve\` to record the approved snapshot.`,
      },
      false,
    )
  } else {
    if (lock.manifestDigest !== snapshot.manifestDigest) {
      add(
        {
          category: 'manifest-unapproved',
          system: '',
          detail: `${config.map} changed since it was last approved.`,
          location: null,
          suggestion: `Review the diagram, then run \`topo approve\` to re-lock it.`,
        },
        false,
      )
    }
    for (const [system, region] of Object.entries(regions)) {
      const prior = lock.systems[system]
      if (prior && prior.digest !== region.digest) {
        add(
          {
            category: 'region-changed',
            system,
            detail: `${system}'s code changed since it was last approved.`,
            location: null,
            suggestion: `Review ${system}'s code; update the diagram in ${config.map} if the structure changed, then \`topo approve\`.`,
          },
          policy.onRegionChange === 'warn',
        )
      }
    }
  }

  entries.sort(
    (a, b) =>
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      a.system.localeCompare(b.system) ||
      a.detail.localeCompare(b.detail),
  )

  const warnings = entries.filter((e) => e.warning).length
  const failures = entries.length - warnings
  const blocking = failures + (opts.strict ? warnings : 0)
  const systemsWithCode = Object.keys(regions).length

  return {
    passed: blocking === 0,
    failures,
    warnings,
    entries,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    scan: { filesScanned: ownership.universe.length, systems: Object.keys(world.systems).length - 1 },
    coverage: {
      universe: ownership.universe.length,
      covered: ownership.owner.size,
      uncovered: ownership.uncovered.length,
      systemsWithCode,
    },
  }
}
