import { useToposStore } from '../store'
import { EXAMPLES } from '../lib/topos'

export function Toolbar() {
  const load = useToposStore((s) => s.load)
  const setTab = useToposStore((s) => s.setRightTab)
  const goRoot = useToposStore((s) => s.goRoot)
  const path = useToposStore((s) => s.path)
  const world = useToposStore((s) => s.world)
  const mode = useToposStore((s) => s.mode)
  const connection = useToposStore((s) => s.connection)

  return (
    <div className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__title">Topo</span>
        <span className="toolbar__sub">{mode === 'live' ? 'live system map' : 'system visualizer'}</span>
      </div>

      <div className="toolbar__spacer" />

      {world && (
        <button className="btn" disabled={path.length <= 1} onClick={goRoot} title="Back to the top of the world">
          ⌂ Top
        </button>
      )}

      {mode === 'live' ? (
        <div className="toolbar__group">
          <span className={`live-dot live-${connection}`} title={`watcher: ${connection}`} />
          <span className="live-label">{connection === 'open' ? 'LIVE' : connection === 'connecting' ? 'connecting…' : 'reconnecting…'}</span>
        </div>
      ) : (
        <div className="toolbar__group">
          <select
            className="select"
            style={{ width: 230 }}
            value=""
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.key === e.target.value)
              if (ex) load(ex.src)
            }}
          >
            <option value="" disabled>
              Load an example…
            </option>
            {EXAMPLES.map((ex) => (
              <option key={ex.key} value={ex.key}>
                {ex.label}
              </option>
            ))}
          </select>

          <button className="btn btn--primary" onClick={() => setTab('load')}>
            Load .topo
          </button>
        </div>
      )}
    </div>
  )
}
