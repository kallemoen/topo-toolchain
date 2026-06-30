import { useRef } from 'react'
import { useToposStore, type RightTab } from '../store'
import {
  EXAMPLES,
  KIND_META,
  childrenOf,
  connectionsFor,
  isOpen,
  type Kind,
  type ToposWorld,
} from '../lib/topos'

const TABS: { id: RightTab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'things', label: 'Things' },
  { id: 'source', label: 'Source' },
  { id: 'load', label: 'Load' },
]

export function SidePanel() {
  const tab = useToposStore((s) => s.rightTab)
  const setTab = useToposStore((s) => s.setRightTab)
  const mode = useToposStore((s) => s.mode)
  const reportCount = useToposStore((s) => s.driftReport?.entries.length ?? 0)
  const hasDraft = useToposStore((s) => s.draft != null)

  const tabs: { id: RightTab; label: string }[] =
    mode === 'live'
      ? [
          { id: 'details', label: 'Details' },
          { id: 'things', label: 'Things' },
          { id: 'warnings', label: reportCount ? `Issues ${reportCount}` : 'Issues' },
          { id: 'draft', label: hasDraft ? 'Draft •' : 'Draft' },
          { id: 'source', label: 'Source' },
        ]
      : TABS
  const active: RightTab = tabs.some((t) => t.id === tab) ? tab : 'details'

  return (
    <div className="side-panel">
      <div className="side-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`side-tab${active === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="side-panel__body">
        {active === 'details' && <DetailsPane />}
        {active === 'things' && <ThingsPane />}
        {active === 'source' && <SourcePane />}
        {active === 'load' && <LoadPane />}
        {active === 'warnings' && <WarningsPane />}
        {active === 'draft' && <DraftPane />}
      </div>
    </div>
  )
}

// ── Details ──────────────────────────────────────────────────────────────────

function kindCounts(world: ToposWorld) {
  const counts: Record<string, number> = {}
  for (const s of Object.values(world.systems)) counts[s.kind] = (counts[s.kind] ?? 0) + 1
  return counts
}

function plural(label: string, n: number) {
  if (n === 1) return label
  return label === 'activity' ? 'activities' : `${label}s`
}

function DetailsPane() {
  const world = useToposStore((s) => s.world)
  const selected = useToposStore((s) => s.selected)
  const level = useToposStore((s) => s.path[s.path.length - 1])
  const enter = useToposStore((s) => s.enter)
  const select = useToposStore((s) => s.select)
  const traceThing = useToposStore((s) => s.traceThing)
  const setTab = useToposStore((s) => s.setRightTab)

  if (!world) return <div className="pane"><p className="empty-hint">No world loaded.</p></div>

  // With nothing explicitly selected, describe where you are: the current level
  // (the root world → world overview; any deeper level → that system's detail).
  const focusName = selected ?? level
  const sys = world.systems[focusName] ?? null
  const isCurrentLevel = focusName === level

  if (!sys || (sys.kind === 'world' && !selected)) {
    const counts = kindCounts(world)
    return (
      <div className="pane">
        <div className="detail__kicker">World</div>
        <h2 className="detail__title">{world.root}</h2>
        <p className="empty-hint" style={{ marginBottom: 16 }}>
          Click a system to inspect it. Double-click an <strong>open</strong> system (⤢) to descend into it.
        </p>
        <div className="detail__section">
          <div className="detail__h">Contents</div>
          <div className="stat-grid">
            {(['system', 'activity', 'storage', 'gateway'] as Kind[]).map((k) =>
              counts[k] ? (
                <div className="stat" key={k}>
                  <span className="stat__n">{counts[k]}</span>
                  <span className="stat__l">{plural(KIND_META[k].label, counts[k])}</span>
                </div>
              ) : null,
            )}
            <div className="stat">
              <span className="stat__n">{Object.keys(world.things).length}</span>
              <span className="stat__l">things</span>
            </div>
            <div className="stat">
              <span className="stat__n">{world.conns.length}</span>
              <span className="stat__l">connections</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const meta = KIND_META[sys.kind as Kind]
  const open = isOpen(world, sys.name)
  const conns = connectionsFor(world, sys.name)
  const ins = conns.filter((c) => c.dir === 'in')
  const outs = conns.filter((c) => c.dir === 'out')

  return (
    <div className="pane">
      <div className="detail__kicker" style={{ color: meta.color }}>
        <span className="legend__sw" style={{ background: meta.color }} /> {meta.label}
      </div>
      <h2 className="detail__title">{sys.name}</h2>
      {sys.desc && <p className="detail__desc">{sys.desc}</p>}

      {open && !isCurrentLevel && (
        <button className="btn btn--primary" style={{ marginBottom: 16 }} onClick={() => enter(sys.name)}>
          ⤢ Open {sys.name}
        </button>
      )}
      {isCurrentLevel && <p className="empty-hint" style={{ marginBottom: 16 }}>You are here. Double-click a child to descend further.</p>}

      {(sys.ins.length > 0 || sys.outs.length > 0 || sys.holds.length > 0) && (
        <div className="detail__section">
          <div className="detail__h">Boundary</div>
          <div className="chips">
            {sys.ins.map((t, i) => <ThingChip key={`i${i}`} kind="in" thing={t} onClick={() => traceThing(t)} />)}
            {sys.outs.map((t, i) => <ThingChip key={`o${i}`} kind="out" thing={t} onClick={() => traceThing(t)} />)}
            {sys.holds.map((t, i) => <ThingChip key={`h${i}`} kind="holds" thing={t} onClick={() => traceThing(t)} />)}
          </div>
        </div>
      )}

      {open && (
        <div className="detail__section">
          <div className="detail__h">Contains ({childrenOf(world, sys.name).length})</div>
          <div className="child-list">
            {childrenOf(world, sys.name).map((c) => {
              const cs = world.systems[c]
              const cm = KIND_META[cs.kind as Kind]
              return (
                <button
                  key={c}
                  className="child-row"
                  onClick={() => select(c)}
                  onDoubleClick={() => isOpen(world, c) && enter(c)}
                >
                  <span className="legend__sw" style={{ background: cm.color }} />
                  <span className="child-row__name">{c}</span>
                  <span className="child-row__kind">{cm.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {ins.length > 0 && (
        <div className="detail__section">
          <div className="detail__h">Receives</div>
          <div className="conn-list">
            {ins.map((c, i) => (
              <button key={i} className="conn-row" onClick={() => world.systems[c.other] && select(c.other)} title={`carries ${c.thing}`}>
                <span className="conn-row__thing">{c.thing}</span>
                <span className="conn-row__arrow">⇠</span>
                <span className="conn-row__node">{c.other}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {outs.length > 0 && (
        <div className="detail__section">
          <div className="detail__h">Sends</div>
          <div className="conn-list">
            {outs.map((c, i) => (
              <button key={i} className="conn-row" onClick={() => world.systems[c.other] && select(c.other)} title={`carries ${c.thing}`}>
                <span className="conn-row__arrow">⇢</span>
                <span className="conn-row__node">{c.other}</span>
                <span className="conn-row__thing">{c.thing}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="link-btn" onClick={() => setTab('things')}>
        See the data shapes →
      </button>
    </div>
  )
}

function ThingChip({ kind, thing, onClick }: { kind: 'in' | 'out' | 'holds'; thing: string; onClick: () => void }) {
  return (
    <button className={`bchip bchip--btn ${kind}`} onClick={onClick} title={`highlight ${thing} across this level`}>
      <span className="bk">{kind}</span> {thing}
    </button>
  )
}

// ── Things ───────────────────────────────────────────────────────────────────

function ThingsPane() {
  const world = useToposStore((s) => s.world)
  const traced = useToposStore((s) => s.tracedThing)
  const traceThing = useToposStore((s) => s.traceThing)

  if (!world) return <div className="pane"><p className="empty-hint">No world loaded.</p></div>
  const things = Object.values(world.things)

  return (
    <div className="pane">
      <div className="detail__kicker">Things — the data that flows</div>
      <p className="empty-hint" style={{ marginBottom: 14 }}>
        Click a thing to trace every boundary &amp; connection that carries it on the current level.
      </p>
      <div className="thing-defs">
        {things.length === 0 && <p className="empty-hint">No things declared.</p>}
        {things.map((t) => (
          <div key={t.name} className={`thing-def${traced === t.name ? ' is-traced' : ''}`}>
            <button className="thing-def__name" onClick={() => traceThing(t.name)}>
              {t.name}
            </button>
            <div className="thing-def__fields">
              {t.fields.map((f, i) => (
                <div className="thing-field" key={i}>
                  <span className="thing-field__name">{f.name}</span>
                  <span className="thing-field__type">{f.type}</span>
                </div>
              ))}
              {t.fields.length === 0 && <span className="empty-hint">no fields</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Source ───────────────────────────────────────────────────────────────────

const KW = new Set(['world', 'system', 'activity', 'storage', 'gateway', 'thing', 'in', 'out', 'holds'])
const FT = new Set(['text', 'int', 'number', 'money', 'bool', 'id', 'time'])

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlight(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      const ci = line.indexOf('//')
      const code = ci >= 0 ? line.slice(0, ci) : line
      const comment = ci >= 0 ? line.slice(ci) : ''
      const hl = esc(code).replace(/(--\(|\)--&gt;|[{}[\]])|\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (_m, punc, word) => {
        if (punc) return `<span class="t-pn">${punc}</span>`
        if (KW.has(word)) return `<span class="t-kw">${word}</span>`
        if (FT.has(word)) return `<span class="t-ft">${word}</span>`
        if (/^[A-Z]/.test(word)) return `<span class="t-ty">${word}</span>`
        return word
      })
      return hl + (comment ? `<span class="t-cm">${esc(comment)}</span>` : '')
    })
    .join('\n')
}

function SourcePane() {
  const source = useToposStore((s) => s.source)
  return (
    <div className="pane pane--flush">
      <pre className="topo-source" dangerouslySetInnerHTML={{ __html: highlight(source) }} />
    </div>
  )
}

// ── Load ─────────────────────────────────────────────────────────────────────

function LoadPane() {
  const source = useToposStore((s) => s.source)
  const error = useToposStore((s) => s.parseError)
  const load = useToposStore((s) => s.load)
  const fileRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => load(String(reader.result ?? ''))
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="pane">
      {error && <div className="parse-error">⚠ {error}</div>}

      <div className="detail__section">
        <div className="detail__h">Examples</div>
        <div className="example-list">
          {EXAMPLES.map((ex) => (
            <button key={ex.key} className="example-chip" onClick={() => load(ex.src)}>
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      <div className="detail__section">
        <div className="detail__h">Open a file</div>
        <button className="file-pick" onClick={() => fileRef.current?.click()}>
          ⬆ Choose a .topo file
        </button>
        <input ref={fileRef} type="file" accept=".topo,.txt,text/plain" hidden onChange={onFile} />
      </div>

      <div className="detail__section">
        <div className="detail__h">Paste source</div>
        <textarea ref={taRef} className="textarea mono" rows={12} defaultValue={source} spellCheck={false} />
        <button
          className="btn btn--primary"
          style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
          onClick={() => taRef.current && load(taRef.current.value)}
        >
          Visualize
        </button>
      </div>
    </div>
  )
}

// ── Warnings (live mode) ─────────────────────────────────────────────────────

function WarningsPane() {
  const report = useToposStore((s) => s.driftReport)
  const select = useToposStore((s) => s.select)
  const setTab = useToposStore((s) => s.setRightTab)

  if (!report) return <div className="pane"><p className="empty-hint">Waiting for the drift check…</p></div>
  if (report.entries.length === 0)
    return (
      <div className="pane">
        <div className="detail__kicker">Drift check</div>
        <p className="empty-hint">✓ Map is in sync with the code markers.</p>
      </div>
    )

  return (
    <div className="pane">
      <div className="detail__kicker">
        {report.failures} issue{report.failures === 1 ? '' : 's'}
        {report.warnings ? ` · ${report.warnings} warning${report.warnings === 1 ? '' : 's'}` : ''}
      </div>
      <p className="empty-hint" style={{ marginBottom: 12 }}>Click an item to focus the system it refers to.</p>
      <div className="warn-list">
        {report.entries.map((e, i) => (
          <button
            key={i}
            className={`warn-row warn-${e.category}`}
            onClick={() => {
              select(e.system)
              setTab('details')
            }}
          >
            <div className="warn-row__head">
              <span className="warn-row__cat">{e.category}</span>
              <span className="warn-row__sys">{e.system}</span>
              {e.location && <span className="warn-row__loc">{e.location.file}:{e.location.line}</span>}
            </div>
            <div className="warn-row__detail">{e.detail}</div>
            <div className="warn-row__fix">→ {e.suggestion}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Draft (live mode) ────────────────────────────────────────────────────────

function DraftPane() {
  const draft = useToposStore((s) => s.draft)
  const source = useToposStore((s) => s.source)
  const approve = useToposStore((s) => s.approveDraft)
  const reject = useToposStore((s) => s.rejectDraft)

  if (!draft)
    return (
      <div className="pane">
        <div className="detail__kicker">Draft map</div>
        <p className="empty-hint">
          No draft proposed. Run <code>topo propose</code> to regenerate the map from markers; it appears here for review.
        </p>
      </div>
    )

  return (
    <div className="pane">
      <div className="detail__kicker">Proposed change — review &amp; approve</div>
      <div className="draft-actions">
        <button className="btn btn--primary" onClick={approve}>Approve → write map</button>
        <button className="btn" onClick={reject}>Reject</button>
      </div>
      <div className="detail__h">Current (live)</div>
      <pre className="topo-source draft-pane" dangerouslySetInnerHTML={{ __html: highlight(source) }} />
      <div className="detail__h" style={{ marginTop: 14 }}>Proposed (draft)</div>
      <pre className="topo-source draft-pane" dangerouslySetInnerHTML={{ __html: highlight(draft.draftSource) }} />
    </div>
  )
}
