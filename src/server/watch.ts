// watch.ts — a debounced recursive file watcher (chokidar), used by `topo view`.

import chokidar, { type FSWatcher } from 'chokidar'

export function watchRepo(root: string, onChange: () => void, debounceMs = 150): FSWatcher {
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    persistent: true,
    ignored: (p: string) => p.includes('/node_modules/') || p.includes('/.git/') || p.includes('/.topo/'),
  })
  let timer: ReturnType<typeof setTimeout> | null = null
  const fire = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, debounceMs)
  }
  watcher.on('all', fire)
  return watcher
}
