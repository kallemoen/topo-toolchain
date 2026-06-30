import { create } from 'zustand'
import { parseTopos, pathToRoot, type ToposWorld } from './lib/topos'
import { DEFAULT_SOURCE } from './lib/topos'

const STORAGE_KEY = 'topos.source'

export type RightTab = 'details' | 'things' | 'source' | 'load' | 'warnings' | 'draft'

// ── Live-mode shapes (mirror the toolchain's DriftReport / draft payloads) ──
export interface DriftEntry {
  category: 'in-code-not-map' | 'in-map-not-code' | 'conflicting' | 'unclear-boundary'
  system: string
  detail: string
  location: { file: string; line: number } | null
  suggestion: string
}
export interface DriftReport {
  passed: boolean
  failures: number
  warnings: number
  entries: DriftEntry[]
  scan: { filesScanned: number; systems: number }
}
export interface DraftState {
  base: string
  draftSource: string
}
export type ServerPush =
  | { type: 'map'; source: string }
  | { type: 'report'; report: DriftReport }
  | { type: 'draft'; base: string; draftSource: string }
  | { type: 'draft'; cleared: true }

function loadSource(): string {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s && s.trim()) return s
  } catch {
    /* ignore */
  }
  return DEFAULT_SOURCE
}

function saveSource(src: string) {
  try {
    localStorage.setItem(STORAGE_KEY, src)
  } catch {
    /* ignore */
  }
}

interface ToposState {
  source: string
  world: ToposWorld | null
  parseError: string | null

  path: string[]
  selected: string | null
  rightTab: RightTab
  tracedThing: string | null

  // live mode
  mode: 'static' | 'live'
  connection: 'connecting' | 'open' | 'closed'
  driftReport: DriftReport | null
  draft: DraftState | null

  load: (src: string) => void
  loadExample: (src: string) => void
  loadLive: (src: string) => void
  enter: (name: string) => void
  upTo: (index: number) => void
  goRoot: () => void
  select: (name: string | null) => void
  setRightTab: (tab: RightTab) => void
  traceThing: (thing: string | null) => void

  connectLive: () => void
  applyServerPush: (msg: ServerPush) => void
  approveDraft: () => void
  rejectDraft: () => void
}

function parseInto(src: string): Pick<ToposState, 'world' | 'parseError' | 'path' | 'selected'> {
  const { world, error } = parseTopos(src)
  return { world, parseError: error, path: world ? [world.root] : [], selected: null }
}

const initialSource = loadSource()

export const useToposStore = create<ToposState>((set, get) => ({
  source: initialSource,
  ...parseInto(initialSource),
  rightTab: 'details',
  tracedThing: null,

  mode: 'static',
  connection: 'connecting',
  driftReport: null,
  draft: null,

  load: (src) => {
    saveSource(src)
    set({ source: src, rightTab: 'details', tracedThing: null, ...parseInto(src) })
  },

  loadExample: (src) => get().load(src),

  // Like load, but for live pushes: don't touch localStorage, and PRESERVE the
  // current drill-down path/selection when those systems still exist.
  loadLive: (src) =>
    set((s) => {
      const { world, error } = parseTopos(src)
      let path = s.path
      if (world) {
        const stillValid = path.length > 0 && path.every((n) => world.systems[n])
        path = stillValid ? path : [world.root]
      } else {
        path = []
      }
      const selected = world && s.selected && world.systems[s.selected] ? s.selected : null
      return { source: src, world, parseError: error, path, selected }
    }),

  enter: (name) => {
    const { world, path } = get()
    if (!world) return
    if ((world.systems[name]?.children.length ?? 0) === 0) return
    if (path[path.length - 1] === name) return
    set({ path: pathToRoot(world, name), selected: null, tracedThing: null })
  },

  upTo: (index) => set((s) => ({ path: s.path.slice(0, Math.max(1, index + 1)), selected: null, tracedThing: null })),
  goRoot: () => set((s) => ({ path: s.path.slice(0, 1), selected: null, tracedThing: null })),
  select: (name) => set({ selected: name }),
  setRightTab: (tab) => set({ rightTab: tab }),
  traceThing: (thing) => set((s) => ({ tracedThing: s.tracedThing === thing ? null : thing })),

  connectLive: () => {
    set({ mode: 'live', connection: 'connecting' })
    const es = new EventSource('/events')
    es.onopen = () => set({ connection: 'open' })
    es.onerror = () => set({ connection: 'closed' }) // EventSource auto-reconnects
    es.onmessage = (ev) => {
      try {
        get().applyServerPush(JSON.parse(ev.data) as ServerPush)
      } catch {
        /* ignore malformed push */
      }
    }
  },

  applyServerPush: (msg) => {
    if (msg.type === 'map') get().loadLive(msg.source)
    else if (msg.type === 'report') set({ driftReport: msg.report })
    else if (msg.type === 'draft') set({ draft: 'cleared' in msg ? null : { base: msg.base, draftSource: msg.draftSource } })
  },

  approveDraft: () => {
    void fetch('/approve', { method: 'POST' })
  },
  rejectDraft: () => {
    void fetch('/reject', { method: 'POST' })
  },
}))

if (import.meta.env.DEV) {
  ;(window as unknown as { __topos: typeof useToposStore }).__topos = useToposStore
}
