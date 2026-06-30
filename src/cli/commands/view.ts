// view.ts — `topo view`: start the live viewer (watch the map, serve it, SSE).

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { loadConfig } from '../../core/config'
import { mapPath } from '../../core/paths'
import { startViewServer } from '../../server/view-server'

export interface ViewOptions {
  dir?: string
  port?: number
  open?: boolean
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref()
  } catch {
    /* ignore */
  }
}

export function runView(opts: ViewOptions): void {
  const { root, config } = loadConfig(opts.dir ?? process.cwd())
  if (!existsSync(mapPath(root, config))) {
    console.error(`topo: no ${config.map} found in ${root}. Run 'topo init' first.`)
    process.exit(2)
  }
  const port = opts.port ?? config.viewer.port
  const { url, close } = startViewServer(root, config, port)

  console.log(`topo view — live map at ${url}`)
  console.log(`watching ${root}  (Ctrl-C to stop)`)
  if (opts.open) openBrowser(url)

  const shutdown = () => {
    close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
