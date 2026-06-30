// hash.ts — deterministic content hashing (draft base guard, scan cache).

import { createHash } from 'node:crypto'

export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}
