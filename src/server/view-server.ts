// view-server.ts — the `topo view` server.
//
// Serves the prebuilt viewer bundle, streams the live map + drift report + draft
// over SSE, re-runs scan+compare in-process on every file change, and exposes
// approve/reject. Node's built-in http only — no framework.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import type { ToposConfig } from '../core/config'
import { ASSETS_DIR } from '../core/assets'
import { mapPath, draftPath } from '../core/paths'
import { scanClaims } from '../core/markers/scan'
import { parseTopos } from '../core/topos'
import { compare } from '../core/compare/compare'
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

type Payload =
  | { type: 'map'; source: string }
  | { type: 'report'; report: ReturnType<typeof compare> }
  | { type: 'draft'; base: string; draftSource: string }
  | { type: 'draft'; cleared: true }

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
  const computeReport = () => {
    const { claims, filesScanned } = scanClaims(root, config)
    const mp = mapPath(root, config)
    const world = existsSync(mp) ? parseTopos(readFileSync(mp, 'utf8')).world : null
    return compare(claims, world ?? null, { strict: config.check.strict, filesScanned })
  }
  const draftPayload = (): Payload => {
    const dp = draftPath(root, config)
    return existsSync(dp) ? { type: 'draft', base: '', draftSource: readFileSync(dp, 'utf8') } : { type: 'draft', cleared: true }
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
      send(res, draftPayload())
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
      runApprove({ dir: root })
      res.writeHead(200)
      return res.end('ok')
    }
    if (urlPath === '/reject' && req.method === 'POST') {
      runApprove({ dir: root, reject: true })
      res.writeHead(200)
      return res.end('ok')
    }
    return serveStatic(urlPath, res)
  })

  const watcher = watchRepo(root, () => {
    broadcast({ type: 'map', source: readMap() })
    broadcast({ type: 'report', report: computeReport() })
    broadcast(draftPayload())
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
