// Topos — a tiny parser + view model for the Topos system-description language.
//
// One .topo file describes one World as "worlds within worlds": every box is a
// `system`, every arrow a `connection` carrying a `thing`. This module turns the
// text into a navigable model. It is READ ONLY — there is no mutation here; the
// viewer renders one level of the world at a time and lets you drill in/out.
//
// Grammar (v1):
//   thing Name { field: type ... }          // data shapes, file scope
//   world Name { ... }                       // the root; exactly one
//   system Name { ... }                      // open system (has children)
//   activity|storage|gateway Name { ... }    // closed systems (leaves)
//   in Thing | out Thing | holds Thing       // boundary
//   A --( Thing )--> B                        // a connection

export type Kind = 'world' | 'system' | 'activity' | 'storage' | 'gateway'

export interface KindMeta {
  label: string
  color: string
  /** short blurb for the legend */
  blurb: string
}

export const KIND_META: Record<Kind, KindMeta> = {
  activity: { label: 'activity', color: '#e0633f', blurb: 'a system that does something' },
  storage: { label: 'storage', color: '#5b7cff', blurb: 'a system where things accumulate' },
  gateway: { label: 'gateway', color: '#34b27b', blurb: 'a crossing to another world' },
  system: { label: 'system', color: '#b7c0d0', blurb: 'an open system you can look inside' },
  world: { label: 'world', color: '#b7c0d0', blurb: 'the whole thing being described' },
}

export interface ToposField {
  name: string
  type: string
}

export interface ToposThing {
  name: string
  fields: ToposField[]
}

export interface ToposSystem {
  name: string
  kind: Kind
  parent: string | null
  children: string[] // direct child system names, in declaration order
  ins: string[]
  outs: string[]
  holds: string[]
  desc?: string // trailing // comment on the declaration line, if any
}

export interface ToposConn {
  from: string
  thing: string
  to: string
}

export interface ToposWorld {
  root: string // name of the `world`
  systems: Record<string, ToposSystem>
  things: Record<string, ToposThing>
  conns: ToposConn[]
}

export interface ParseResult {
  world: ToposWorld | null
  error: string | null
}

const KIND_KEYWORDS = new Set<Kind>(['world', 'system', 'activity', 'storage', 'gateway'])

/** Split source into meaningful tokens, dropping comments + whitespace. */
function tokenize(src: string): string[] {
  const noComments = src.replace(/\/\/[^\n]*/g, '')
  const re = /--\(|\)-->|[{}[\]:]|[A-Za-z_][A-Za-z0-9_]*/g
  return noComments.match(re) ?? []
}

/** Capture the trailing `// comment` on each system/thing declaration line. */
function captureDescriptions(src: string): Record<string, string> {
  const desc: Record<string, string> = {}
  for (const line of src.split('\n')) {
    const m = line.match(/^\s*(?:world|system|activity|storage|gateway|thing)\s+([A-Za-z_]\w*)\b.*?\/\/\s*(.+?)\s*$/)
    if (m) desc[m[1]] = m[2]
  }
  return desc
}

export function parseTopos(src: string): ParseResult {
  try {
    const toks = tokenize(src)
    const descByName = captureDescriptions(src)
    let i = 0
    const peek = () => toks[i]
    const next = () => toks[i++]

    const systems: Record<string, ToposSystem> = {}
    const things: Record<string, ToposThing> = {}
    const conns: ToposConn[] = []
    let root: string | null = null

    const thingRef = (): string => {
      if (peek() === '[') {
        next()
        const n = next()
        if (peek() === ']') next()
        return n
      }
      return next()
    }

    const parseThing = () => {
      const name = next()
      const fields: ToposField[] = []
      if (peek() === '{') {
        next()
        while (peek() && peek() !== '}') {
          const fname = next()
          if (peek() === ':') next()
          let type: string
          if (peek() === '[') {
            next()
            type = `[${next()}]`
            if (peek() === ']') next()
          } else {
            type = next()
          }
          fields.push({ name: fname, type })
        }
        if (peek() === '}') next()
      }
      things[name] = { name, fields }
    }

    const parseSystem = (kind: Kind, parent: string | null) => {
      const name = next()
      const sys: ToposSystem = {
        name,
        kind,
        parent,
        children: [],
        ins: [],
        outs: [],
        holds: [],
        desc: descByName[name],
      }
      systems[name] = sys
      if (parent) systems[parent]?.children.push(name)
      if (kind === 'world') root = name
      if (peek() === '{') {
        next()
        parseBody(name)
      }
    }

    function parseBody(owner: string) {
      while (peek() && peek() !== '}') {
        const t = peek()
        if (t === 'thing') {
          next()
          parseThing()
        } else if (KIND_KEYWORDS.has(t as Kind)) {
          next()
          parseSystem(t as Kind, owner)
        } else if (t === 'in' || t === 'out' || t === 'holds') {
          next()
          const ref = thingRef()
          const s = systems[owner]
          if (s) {
            if (t === 'in') s.ins.push(ref)
            else if (t === 'out') s.outs.push(ref)
            else s.holds.push(ref)
          }
        } else {
          // maybe a connection: Name --( Thing )--> Name
          const from = next()
          if (peek() === '--(') {
            next()
            const thing = thingRef()
            if (peek() === ')-->') next()
            const to = next()
            if (from && to) conns.push({ from, thing, to })
          }
          // otherwise: a stray token, already consumed — keep scanning
        }
      }
      if (peek() === '}') next()
    }

    // Top level: thing declarations + one world (tolerate stray systems).
    while (peek()) {
      const t = peek()
      if (t === 'thing') {
        next()
        parseThing()
      } else if (KIND_KEYWORDS.has(t as Kind)) {
        next()
        parseSystem(t as Kind, null)
      } else {
        next()
      }
    }

    if (!root) {
      // Fall back to any top-level system if there's no explicit `world`.
      const topLevel = Object.values(systems).find((s) => s.parent === null)
      if (!topLevel) return { world: null, error: 'No `world` (or any system) found in the source.' }
      root = topLevel.name
    }

    return { world: { root, systems, things, conns }, error: null }
  } catch (e) {
    return { world: null, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── View helpers ─────────────────────────────────────────────────────────────

/** The direct child of `level` that contains `name` (or `name` itself), else null. */
export function ancestorAtLevel(world: ToposWorld, name: string, level: string): string | null {
  let cur: string | null = name
  const seen = new Set<string>()
  while (cur != null && !seen.has(cur)) {
    const at: string = cur
    seen.add(at)
    const sys: ToposSystem | undefined = world.systems[at]
    if (!sys) return null
    if (sys.parent === level) return at
    cur = sys.parent
  }
  return null
}

/** Direct children of a system, in declaration order. */
export function childrenOf(world: ToposWorld, level: string): string[] {
  return world.systems[level]?.children ?? []
}

/** A system you can drill into (it has children). */
export function isOpen(world: ToposWorld, name: string): boolean {
  return (world.systems[name]?.children.length ?? 0) > 0
}

export interface LevelEdge {
  from: string
  to: string
  things: string[]
}

/** Connections lifted to a level: edges between its direct children. */
export function levelEdges(world: ToposWorld, level: string): LevelEdge[] {
  const map = new Map<string, LevelEdge>()
  for (const c of world.conns) {
    const a = ancestorAtLevel(world, c.from, level)
    const b = ancestorAtLevel(world, c.to, level)
    if (a && b && a !== b) {
      const key = `${a} ${b}`
      let e = map.get(key)
      if (!e) {
        e = { from: a, to: b, things: [] }
        map.set(key, e)
      }
      if (!e.things.includes(c.thing)) e.things.push(c.thing)
    }
  }
  return [...map.values()]
}

export interface Crossing {
  dir: 'in' | 'out'
  thing: string
  other: string
}

/** Connections that cross this level's boundary at `node` — shown as chips. */
export function crossingsFor(world: ToposWorld, level: string, node: string): Crossing[] {
  const seen = new Set<string>()
  const out: Crossing[] = []
  const add = (c: Crossing) => {
    const k = `${c.dir} ${c.thing} ${c.other}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(c)
    }
  }
  for (const c of world.conns) {
    const a = ancestorAtLevel(world, c.from, level)
    const b = ancestorAtLevel(world, c.to, level)
    if (a === node && b === null) add({ dir: 'out', thing: c.thing, other: c.to })
    else if (b === node && a === null) add({ dir: 'in', thing: c.thing, other: c.from })
  }
  return out
}

/** Every connection touching `name` (either end), for the details panel. */
export function connectionsFor(world: ToposWorld, name: string): { dir: 'in' | 'out'; thing: string; other: string }[] {
  const out: { dir: 'in' | 'out'; thing: string; other: string }[] = []
  for (const c of world.conns) {
    if (c.from === name) out.push({ dir: 'out', thing: c.thing, other: c.to })
    if (c.to === name) out.push({ dir: 'in', thing: c.thing, other: c.from })
  }
  return out
}

/** Names of every system from the root down to (and including) `name`. */
export function pathToRoot(world: ToposWorld, name: string): string[] {
  const chain: string[] = []
  let cur: string | null = name
  const seen = new Set<string>()
  while (cur != null && !seen.has(cur)) {
    const at: string = cur
    seen.add(at)
    chain.unshift(at)
    cur = world.systems[at]?.parent ?? null
  }
  return chain
}

// ── Layout ───────────────────────────────────────────────────────────────────

export interface Pos {
  x: number
  y: number
}

export interface LayoutOpts {
  /** rendered node width (matches CSS) — columns are spaced by this + colGap */
  width?: number
  colGap?: number
  rowGap?: number
  origin?: Pos
  /** estimated rendered height per node, used so tall nodes don't overlap */
  heightOf?: (id: string) => number
}

export interface LayoutResult {
  pos: Record<string, Pos>
  /** per-edge (`from__to`) intermediate points to route through — empty = straight */
  waypoints: Record<string, Pos[]>
}

/**
 * Rough rendered height of a system node, so the layout can stack nodes without
 * overlap and the diagram reads cleanly. Mirrors what SystemNode draws.
 */
export function estimateNodeHeight(world: ToposWorld, level: string, name: string): number {
  const s = world.systems[name]
  if (!s) return 120
  let h = 44 // header
  if (s.desc) h += 26
  const nb = s.ins.length + s.outs.length + s.holds.length
  if (nb > 0) h += Math.ceil(nb / 2) * 24 + 10
  const nc = crossingsFor(world, level, name).length
  if (nc > 0) h += nc * 20 + 6
  return h
}

/**
 * Layered (Sugiyama-style) left-to-right layout, tuned for readability:
 *
 *  1. Longest-path layering. Topos worlds have feedback loops, so back-edges are
 *     found with a DFS and excluded from layering (they still render as edges).
 *  2. Dummy nodes for edges that span more than one column, so a long edge gets
 *     its own vertical track instead of cutting through a node.
 *  3. Barycenter ordering sweeps to reduce crossings and line each node up with
 *     what it connects to.
 *  4. Width-aware columns + per-column vertical centering using real node heights.
 */
export function layeredLayout(
  ids: string[],
  edges: { from: string; to: string }[],
  opts: LayoutOpts = {},
): LayoutResult {
  const NODE_W = opts.width ?? 234
  const COL_GAP = opts.colGap ?? 130
  const ROW_GAP = opts.rowGap ?? 40
  const origin = opts.origin ?? { x: 40, y: 24 }
  const heightOf = opts.heightOf ?? (() => 130)

  if (ids.length === 0) return { pos: {}, waypoints: {} }

  const idset = new Set(ids)
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of edges) {
    if (idset.has(e.from) && idset.has(e.to) && e.from !== e.to) adj.get(e.from)!.push(e.to)
  }

  // 1. DFS → forward edges (drop back-edges) + finish order, then longest-path layers.
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>(ids.map((id) => [id, WHITE]))
  const forward = new Map<string, string[]>(ids.map((id) => [id, []]))
  const finished: string[] = []
  const visit = (start: string) => {
    const stack: { id: string; i: number }[] = [{ id: start, i: 0 }]
    color.set(start, GRAY)
    while (stack.length) {
      const frame = stack[stack.length - 1]
      const kids = adj.get(frame.id)!
      if (frame.i < kids.length) {
        const v = kids[frame.i++]
        const c = color.get(v)
        if (c === GRAY) continue // back-edge → breaks a cycle, drop it
        forward.get(frame.id)!.push(v)
        if (c === WHITE) {
          color.set(v, GRAY)
          stack.push({ id: v, i: 0 })
        }
      } else {
        color.set(frame.id, BLACK)
        finished.push(frame.id)
        stack.pop()
      }
    }
  }
  for (const id of ids) if (color.get(id) === WHITE) visit(id)

  const topo = finished.reverse()
  const layer = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const u of topo) for (const v of forward.get(u)!) layer.set(v, Math.max(layer.get(v)!, layer.get(u)! + 1))
  const maxLayer = Math.max(0, ...ids.map((id) => layer.get(id)!))

  // 2. Build per-layer node lists, inserting dummy nodes along multi-layer edges.
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const id of ids) layers[layer.get(id)!].push(id) // seed order = declaration order
  const down = new Map<string, string[]>() // node → neighbours in the next layer
  const up = new Map<string, string[]>() // node → neighbours in the previous layer
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const arr = m.get(k)
    if (arr) arr.push(v)
    else m.set(k, [v])
  }
  const edgeDummies = new Map<string, string[]>() // `from__to` → ordered dummy ids
  let dummies = 0
  for (const u of ids) {
    for (const v of forward.get(u)!) {
      const chain: string[] = []
      let prev = u
      for (let l = layer.get(u)! + 1; l < layer.get(v)!; l++) {
        const d = `__d${dummies++}`
        chain.push(d)
        layers[l].push(d)
        push(down, prev, d)
        push(up, d, prev)
        prev = d
      }
      if (chain.length) edgeDummies.set(`${u}__${v}`, chain)
      push(down, prev, v)
      push(up, v, prev)
    }
  }

  // 3. Barycenter ordering sweeps (down, up, …) to reduce crossings.
  const median = (neighbours: string[], idx: Map<string, number>, fallback: number): number => {
    const xs = neighbours
      .map((n) => idx.get(n))
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b)
    if (xs.length === 0) return fallback
    const m = Math.floor(xs.length / 2)
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2
  }
  const indexOf = (arr: string[]) => new Map(arr.map((id, i) => [id, i]))
  const reorder = (arr: string[], nbrs: Map<string, string[]>, adjIdx: Map<string, number>) => {
    const keyed = arr.map((id, i) => ({ id, key: median(nbrs.get(id) ?? [], adjIdx, i) }))
    keyed.sort((a, b) => a.key - b.key) // Array.sort is stable → ties keep prior order
    return keyed.map((k) => k.id)
  }
  for (let sweep = 0; sweep < 6; sweep++) {
    if (sweep % 2 === 0) {
      for (let l = 1; l < layers.length; l++) layers[l] = reorder(layers[l], up, indexOf(layers[l - 1]))
    } else {
      for (let l = layers.length - 2; l >= 0; l--) layers[l] = reorder(layers[l], down, indexOf(layers[l + 1]))
    }
  }

  // 4. Coordinates. Fixed-width columns; each column vertically centered using
  //    real heights (dummies are thin) so connected nodes sit near each other.
  const H = (id: string) => (id.startsWith('__d') ? 8 : heightOf(id))
  const layerHeight = layers.map((arr) => arr.reduce((s, id, i) => s + H(id) + (i > 0 ? ROW_GAP : 0), 0))
  const maxH = Math.max(1, ...layerHeight)
  const pos: Record<string, Pos> = {}
  const dummyPos: Record<string, Pos> = {}
  layers.forEach((arr, l) => {
    const x = origin.x + l * (NODE_W + COL_GAP)
    let y = origin.y + (maxH - layerHeight[l]) / 2
    for (const id of arr) {
      if (id.startsWith('__d')) dummyPos[id] = { x, y }
      else pos[id] = { x, y }
      y += H(id) + ROW_GAP
    }
  })

  // Build per-edge waypoints. Multi-column edges thread the dummy lanes (clear of
  // boxes); feedback / backward edges loop through a lane below the whole diagram,
  // staggered so they don't pile up.
  let maxBottom = 0
  for (const id of ids) maxBottom = Math.max(maxBottom, pos[id].y + heightOf(id))
  const half = NODE_W / 2
  const waypoints: Record<string, Pos[]> = {}
  let belowIdx = 0
  for (const e of edges) {
    if (!idset.has(e.from) || !idset.has(e.to) || e.from === e.to) continue
    const key = `${e.from}__${e.to}`
    const lf = layer.get(e.from)!
    const lt = layer.get(e.to)!
    const chain = edgeDummies.get(key)
    if (chain && chain.length) {
      waypoints[key] = chain.map((d) => ({ x: dummyPos[d].x + half, y: dummyPos[d].y + 4 }))
    } else if (lt > lf && lt - lf === 1) {
      // adjacent forward — a straight edge is already clean
    } else {
      const viaY = maxBottom + 60 + belowIdx * 28
      belowIdx++
      waypoints[key] = [
        { x: pos[e.from].x + NODE_W + 30, y: viaY },
        { x: pos[e.to].x - 30, y: viaY },
      ]
    }
  }

  return { pos, waypoints }
}

// ── Bundled examples ─────────────────────────────────────────────────────────

const WEAVE = `// weave.topo — the Weave real-estate scraper system, drawn in Topos.

thing ScrapeJob   { config_id: id  agency: text  listing_type: text }
thing ListingUrl  { url: text }
thing UrlCheck    { urls: [text]  existing_urls: [text] }
thing ListingPage { url: text  markdown: text  images: [text] }
thing ListingInput {
  listing_id: id  source_url: text  price_amount: money
  property_type: text  title: text  raw_data: text
}
thing Listing     { listing_id: id  source_url: text  listing_status: text }
thing Rejection   { config_id: id  tier_1_errors: [text]  tier_2_errors: [text] }
thing RunReceipt  { config_id: id  status: text  listings_accepted: int }
thing ScraperConfig { config_id: id  agency_name: text  status: text }
thing HealthVerdict { config_id: id  new_status: text  reason: text }
thing DailyDigest { date: time  healthy: int  broken: int }
thing SearchQuery { filters: text  bbox: text }
thing SearchResult { listings: [Listing]  total: int }
thing MapTiles    { style: text  region: text }   // Mapbox base map for the web app

world Weave {

  gateway AgencySites { out ListingPage }     // ~17 Lisbon agency sites — origin of all data
  gateway Firecrawl   { in ListingUrl  out ListingPage }   // JS render / anti-bot
  gateway Mapbox      { out Listing  out MapTiles }   // geocoding (Enrich) + map tiles (web app)
  gateway Telegram    { in DailyDigest }       // owner alerting
  gateway Scheduler   { out ScrapeJob }        // GitHub Actions cron
  gateway ClaudeCode  { in HealthVerdict  out ScraperConfig }   // the dev agents
  gateway Visitors    { out SearchQuery  in SearchResult }   // home-seekers on the public site

  AgencySites --( ListingPage )--> Firecrawl

  system Collection {                          // discover, dedup, extract, normalize, submit
    in  ScrapeJob
    out ListingInput
    out RunReceipt

    activity Discovery { in ScrapeJob   out ListingUrl }    // crawl search pages
    activity Discard   { in ListingUrl  out ListingUrl }    // drop known URLs
    activity Extract   { in ListingUrl  out ListingPage }   // scrape each page
    activity Normalize { in ListingPage out ListingInput }  // map to contract
    activity Submit    { in ListingInput out RunReceipt }   // batch + report

    Firecrawl --( ListingPage )--> Discovery
    Discovery --( ListingUrl )-->  Discard
    Discard   --( ListingUrl )-->  Extract
    Firecrawl --( ListingPage )--> Extract
    Extract   --( ListingPage )--> Normalize
    Normalize --( ListingInput )--> Submit
  }

  Scheduler --( ScrapeJob )--> Collection
  Listings  --( UrlCheck )-->  Discard         // check-urls dedup

  system Validation {                          // 3-tier gate, enrichment, health
    in  ListingInput
    in  RunReceipt
    out Listing
    out Rejection

    activity Validate { in ListingInput  out Listing  out Rejection }  // schema/semantic/complete
    activity Enrich   { in Listing       out Listing }                 // PostGIS + Mapbox
    activity HealthMonitor { in RunReceipt out HealthVerdict }         // 6 failure modes

    Validate --( Listing )--> Enrich
    Mapbox   --( Listing )--> Enrich
  }

  Collection --( ListingInput )--> Validation
  Collection --( RunReceipt )-->   Validation

  system Storage {                             // Supabase (Postgres + PostGIS)
    in Listing
    in Rejection
    in RunReceipt
    in HealthVerdict

    storage Listings    { holds Listing }      // permanent, unique source_url
    storage Rejections  { holds Rejection }    // 30-day retention
    storage RunReceipts { holds RunReceipt }   // 90-day retention
    storage Registry    { holds ScraperConfig } // config + health
  }

  Validation    --( Listing )-->       Listings
  Validation    --( Rejection )-->     Rejections
  Collection    --( RunReceipt )-->    RunReceipts
  HealthMonitor --( HealthVerdict )--> Registry

  system Maintenance {                         // pg_cron + Vercel cron
    activity DeadListingCheck { in Listing       out Listing }     // 404/410 -> expired
    activity Retention        { in RunReceipt    in Rejection }    // purge old logs
    activity CrossSourceDedup { in Listing       out Listing }     // merge duplicates
    activity DailySummary     { in ScraperConfig out DailyDigest } // 08:00 UTC report
  }

  Listings         --( Listing )-->     DeadListingCheck
  DeadListingCheck --( Listing )-->     Listings
  DeadListingCheck --( ListingUrl )-->  AgencySites
  Listings         --( Listing )-->     CrossSourceDedup
  CrossSourceDedup --( Listing )-->     Listings
  RunReceipts      --( RunReceipt )-->  Retention
  Rejections       --( Rejection )-->   Retention
  Registry         --( ScraperConfig )--> DailySummary
  DailySummary     --( DailyDigest )--> Telegram

  system QueryApi {                            // the read side
    in  SearchQuery
    out SearchResult

    activity Search    { in SearchQuery out SearchResult }   // filters + geo bbox
    activity Geography { in SearchQuery out SearchResult }    // admin-region lookups
  }

  Listings --( Listing )--> Search

  // ===== WEB APP — consumer-facing Next.js site (Front-end/web-app) =====
  system WebApp {
    in  SearchQuery
    in  SearchResult
    out SearchQuery
    out SearchResult

    activity Browse    { in SearchResult  out SearchQuery }   // region search: filters, list, sort, pagination
    activity DataFetch { in SearchQuery   out SearchResult }  // /listings + /locations route handlers (data-provider)
    activity MapView   { in SearchResult }                    // Mapbox map — ListingMap / DetailMap
    activity Detail    { in SearchResult }                    // /buy|rent/[slug] listing detail page

    Browse    --( SearchQuery )-->  DataFetch
    DataFetch --( SearchResult )--> Browse
    DataFetch --( SearchResult )--> MapView
    DataFetch --( SearchResult )--> Detail

    Visitors --( SearchQuery )-->  Browse     // a home-seeker searches
    Browse   --( SearchResult )--> Visitors   // the listings page they see
    Mapbox   --( MapTiles )-->     MapView     // base map + region polygons
  }

  DataFetch --( SearchQuery )-->  Search        // read stored listings through the Query API
  Search    --( SearchResult )--> DataFetch
  DataFetch --( SearchQuery )-->  Geography     // /locations — admin-region lookups
  Geography --( SearchResult )--> DataFetch

  system Development {                          // agentic workflow (Claude Code)
    in  HealthVerdict
    out ScraperConfig

    activity BuildScraper  { out ScraperConfig }
    activity MonitorHealth { in ScraperConfig in Rejection out HealthVerdict }
    activity FixScraper    { in HealthVerdict out ScraperConfig }

    MonitorHealth --( HealthVerdict )--> FixScraper
  }

  Registry    --( ScraperConfig )--> MonitorHealth
  Rejections  --( Rejection )-->     MonitorHealth
  ClaudeCode  --( ScraperConfig )--> BuildScraper
  Development --( ScraperConfig )--> Registry
  Registry    --( ScraperConfig )--> Collection   // scrapers drive each run (feedback loop)
}
`

const COFFEE = `// coffee.topo — a neighbourhood coffee bar, drawn in Topos.

thing Order   { items: [text]  table: int }
thing Cup     { drink: text  size: text }
thing Beans   { origin: text  kg: number }
thing Payment { amount: money  method: text }

world CoffeeBar {

  gateway Customer { out Order  in Cup }
  gateway Roaster  { in Payment  out Beans }   // pay the roaster, it ships beans
  gateway Bank     { in Payment }

  system FrontOfHouse {
    in  Order
    in  Beans
    out Cup
    out Payment

    activity Till    { in Order  out Payment }          // takes the customer's money
    activity Barista { in Order  in Beans  out Cup }     // pulls the shot

    Till --( Payment )--> Bank
  }

  system BackOfHouse {
    in  Payment
    out Beans

    storage Pantry   { holds Beans }
    activity Restock { in Payment  in Beans  out Beans } // buys + shelves beans

    Restock --( Payment )--> Roaster
    Roaster --( Beans )-->   Restock
    Restock --( Beans )-->   Pantry
  }

  Customer     --( Order )-->   FrontOfHouse
  FrontOfHouse --( Cup )-->     Customer
  Till         --( Payment )--> Restock         // some takings fund restocking
  Pantry       --( Beans )-->   Barista         // beans to the bar
}
`

const CRYPTOSTATS = `// cryptostats.topo — CryptoStats: a community-built, open registry of crypto metrics.
// The site (github.com/crypto-stats/site) is an explorer for adapters & collections,
// plus editors to write, test, publish (to IPFS) and register (on-chain) adapters
// and Graph subgraphs.

thing Collection         { id: text }
thing AdapterCID         { cid: text }                    // an adapter, by IPFS CID
thing SourceCode         { language: text  source: text } // TypeScript adapter source
thing CompiledModule     { name: text  code: text }       // compiled adapter (JS)
thing AdapterCode        { js: text  hash: text }          // module code stored on IPFS
thing ChainData          { chain: text  result: text }    // RPC / subgraph query result
thing Metric             { adapter: text  value: number  date: time }
thing Ranking            { collection: text  metrics: [Metric] }
thing Signature          { signer: text  hash: text }     // wallet signature
thing ListUpdate         { collection: text  old_cid: text  new_cid: text }
thing ContractABI        { address: text  abi: text }
thing MappingSource      { code: text }                   // AssemblyScript subgraph mapping
thing SubgraphFiles      { manifest: text  schema: text }
thing SubgraphBuild      { wasm: text }
thing SubgraphDeployment { id: text  ipfs_hash: text }

world CryptoStats {

  // ---- Gateways: services & chains the site uses but does not own ----
  gateway IPFS            { in AdapterCode  in SubgraphFiles  out AdapterCode  out AdapterCID }  // Infura + Graph IPFS
  gateway AdapterRegistry { in ListUpdate  out Collection  out AdapterCID }   // on-chain registry + its subgraph
  gateway Blockchains     { out ChainData }                  // multi-chain archive RPC (eth, arbitrum, optimism, …)
  gateway TheGraph        { in SubgraphDeployment  out ChainData }   // subgraph hosting + data queries
  gateway Etherscan       { out ContractABI }                // contract ABIs / metadata
  gateway Wallet          { out Signature }                  // the user's web3 wallet (web3-react)

  // ===== EXPLORER — browse collections, run adapters via the SDK, rank =====
  system Explorer {
    in  Collection
    out Ranking

    activity Discover    { in Collection  in AdapterCID  out AdapterCID }            // /discover
    activity Runtime     { in AdapterCID  in AdapterCode  in ChainData  out Metric } // @cryptostats/sdk runs adapters
    activity Leaderboard { in Metric  out Ranking }                                  // /leaderboard

    AdapterRegistry --( Collection )--> Discover
    AdapterRegistry --( AdapterCID )--> Discover
    Discover        --( AdapterCID )--> Runtime
    IPFS            --( AdapterCode )--> Runtime
    Blockchains     --( ChainData )-->  Runtime
    TheGraph        --( ChainData )-->  Runtime
    Runtime         --( Metric )-->     Leaderboard
  }

  // ===== ADAPTER EDITOR — write, compile, test, publish, register =====
  system AdapterEditor {
    out ListUpdate

    activity Editor   { out SourceCode }                                     // Monaco editor (/editor)
    activity Compile  { in SourceCode  out CompiledModule }                  // ts-compiler (TS → JS)
    activity TestRun  { in CompiledModule  in ChainData  out Metric }        // live preview via the SDK
    activity Publish  { in CompiledModule  out AdapterCode  out AdapterCID } // /api/upload-adapter → IPFS
    activity Register { in AdapterCID  in Signature  out ListUpdate }        // /api/update-list (signed)

    Editor      --( SourceCode )-->     Compile
    Compile     --( CompiledModule )--> TestRun
    Compile     --( CompiledModule )--> Publish
    Blockchains --( ChainData )-->      TestRun
    Publish     --( AdapterCode )-->    IPFS
    Publish     --( AdapterCID )-->     Register
    Wallet      --( Signature )-->      Register
  }

  AdapterEditor --( ListUpdate )--> AdapterRegistry   // register the adapter on-chain

  // ===== SUBGRAPH EDITOR — scaffold from a contract, compile, deploy =====
  system SubgraphEditor {
    out SubgraphDeployment

    activity MappingEditor { in ContractABI  out MappingSource }    // /subgraph-editor
    activity GenerateFiles { out SubgraphFiles }                    // graph-file-generator (manifest, schema)
    activity CompileAS     { in MappingSource  out SubgraphBuild }  // /api/graph/compile-as (AssemblyScript)
    activity Deploy        { in SubgraphBuild  in SubgraphFiles  out SubgraphDeployment }  // /api/graph/deploy

    Etherscan     --( ContractABI )-->   MappingEditor
    MappingEditor --( MappingSource )--> CompileAS
    GenerateFiles --( SubgraphFiles )--> Deploy
    CompileAS     --( SubgraphBuild )-->  Deploy
    Deploy        --( SubgraphFiles )-->  IPFS
  }

  SubgraphEditor --( SubgraphDeployment )--> TheGraph   // deploy to the hosted service
}
`

export interface Example {
  key: string
  label: string
  src: string
}

export const EXAMPLES: Example[] = [
  { key: 'weave', label: 'Weave — real-estate scraper', src: WEAVE },
  { key: 'cryptostats', label: 'CryptoStats — crypto-stats/site', src: CRYPTOSTATS },
  { key: 'coffee', label: 'Coffee bar — minimal', src: COFFEE },
]

export const DEFAULT_SOURCE = WEAVE
