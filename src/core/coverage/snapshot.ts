// snapshot.ts — compute the current (manifest, code) state: who owns what, and the
// digest of each region. Shared by `topo check` (diff vs lock) and `topo approve`
// (write it as the new lock).

import type { ToposConfig } from '../config'
import type { ToposWorld } from '../topos'
import { resolveOwnership, type Ownership } from './resolve'
import { regionDigest, manifestDigest, type RegionDigest } from './digest'

export interface Snapshot {
  ownership: Ownership
  manifestDigest: string
  regions: Record<string, RegionDigest> // system → digest, only systems that own files
}

export function buildSnapshot(
  root: string,
  config: ToposConfig,
  world: ToposWorld,
  manifestText: string,
): Snapshot {
  const ownership = resolveOwnership(root, config, world)
  const regions: Record<string, RegionDigest> = {}
  for (const [system, files] of ownership.bySystem) regions[system] = regionDigest(root, files)
  return { ownership, manifestDigest: manifestDigest(manifestText), regions }
}
