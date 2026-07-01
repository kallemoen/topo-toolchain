// view-server.ts — the `topo view` server.
//
// Serves the prebuilt viewer bundle, streams the live map + coverage/drift report
// over SSE, re-runs the coverage check in-process on every file change, and exposes
// approve. Node's built-in http only — no framework.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import type { ToposConfig } from '../core/config'
import { ASSETS_DIR } from '../core/assets'
import { mapPath } from '../core/paths'
import { parseTopos } from '../core/topos'
import { buildSnapshot } from '../core/coverage/snapshot'
import { readLock } from '../core/coverage/lock'
import { checkSnapshot } from '../core/coverage/check'
import type { DriftReport } from '../core/types'
import { watchRepo } from './watch'
import { runApprove } from '../cli/commands/approve'

const DIST = join(ASSETS_DIR, 'viewer-dist')

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

type Payload = { type: 'map'; source: string } | { type: 'report'; report: DriftReport | null }

export interface ViewServer {
  url: string
  close: () => void
}

export function startViewServer(root: string, config: ToposConfig, port: number): ViewServer {
  const clients = new Set<ServerResponse>()
  const send = (res: ServerResponse, p: Payload) => res.write(`data: ${JSON.stringify(p)}\n\n`)
  const broadcast = (p: Payload) => {
    for (const res of clients) send(res, p)
  }

  const readMap = (): string => {
    const mp = mapPath(root, config)
    return existsSync(mp) ? readFileSync(mp, 'utf8') : ''
  }
  const computeReport = (): DriftReport | null => {
    const mp = mapPath(root, config)
    if (!existsSync(mp)) return null
    const text = readFileSync(mp, 'utf8')
    const { world } = parseTopos(text)
    if (!world) return null
    const snapshot = buildSnapshot(root, config, world, text)
    const lock = readLock(root, config)
    return checkSnapshot(config, world, snapshot, lock, { strict: config.check.strict })
  }

  const serveIndex = (res: ServerResponse) => {
    let html = readFileSync(join(DIST, 'index.html'), 'utf8')
    html = html.replace('</head>', '<script>window.__TOPO_LIVE__=true</script></head>')
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  }

  const serveStatic = (urlPath: string, res: ServerResponse) => {
    const rel = urlPath === '/' ? '/index.html' : urlPath
    const file = resolve(join(DIST, rel))
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
      return serveIndex(res) // SPA fallback
    }
    if (rel === '/index.html') return serveIndex(res)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const urlPath = (req.url ?? '/').split('?')[0]

    if (urlPath === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write(': connected\n\n')
      clients.add(res)
      send(res, { type: 'map', source: readMap() })
      send(res, { type: 'report', report: computeReport() })
      req.on('close', () => clients.delete(res))
      return
    }
    if (urlPath === '/current') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      return res.end(readMap())
    }
    if (urlPath === '/report') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify(computeReport()))
    }
    if (urlPath === '/approve' && req.method === 'POST') {
      runApprove({ dir: root, confirm: true }) // approving in the viewer is a human action
      res.writeHead(200)
      return res.end('ok')
    }
    return serveStatic(urlPath, res)
  })

  const watcher = watchRepo(root, () => {
    broadcast({ type: 'map', source: readMap() })
    broadcast({ type: 'report', report: computeReport() })
  })

  server.listen(port)
  return {
    url: `http://localhost:${port}`,
    close: () => {
      void watcher.close()
      for (const res of clients) res.end()
      server.close()
    },
  }
}
