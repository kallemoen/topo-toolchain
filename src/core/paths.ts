// paths.ts — canonical file locations derived from config.

import { join } from 'node:path'
import type { ToposConfig } from './config'

export function mapPath(root: string, cfg: ToposConfig): string {
  return join(root, cfg.map)
}

export function draftPath(root: string, cfg: ToposConfig): string {
  return join(root, cfg.draft)
}

export function draftMetaPath(root: string, cfg: ToposConfig): string {
  return `${draftPath(root, cfg)}.meta.json`
}

export const CACHE_DIR = '.topo'
