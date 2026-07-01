// paths.ts — canonical file locations derived from config.

import { join } from 'node:path'
import type { ToposConfig } from './config'

export function mapPath(root: string, cfg: ToposConfig): string {
  return join(root, cfg.map)
}

export function lockPath(root: string, cfg: ToposConfig): string {
  return join(root, cfg.lock)
}

export const CACHE_DIR = '.topo'
