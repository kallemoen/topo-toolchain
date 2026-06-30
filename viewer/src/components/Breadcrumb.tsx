import { useToposStore } from '../store'
import { KIND_META, type Kind } from '../lib/topos'

/** The breadcrumb of the current drill-down path, plus a kind legend. */
export function Breadcrumb() {
  const world = useToposStore((s) => s.world)
  const path = useToposStore((s) => s.path)
  const upTo = useToposStore((s) => s.upTo)

  if (!world || path.length === 0) return null

  return (
    <div className="topbar">
      <div className="crumbs">
        {path.map((name, i) => {
          const active = i === path.length - 1
          return (
            <span key={name} className="crumbs__item">
              {i > 0 && <span className="crumbs__sep">/</span>}
              <button className={`crumb${active ? ' is-active' : ''}`} disabled={active} onClick={() => upTo(i)}>
                {name}
              </button>
            </span>
          )
        })}
      </div>
      <div className="legend">
        {(['activity', 'storage', 'gateway', 'system'] as Kind[]).map((k) => (
          <span key={k} className="legend__item" title={KIND_META[k].blurb}>
            <span className="legend__sw" style={{ background: KIND_META[k].color }} />
            {KIND_META[k].label}
          </span>
        ))}
      </div>
    </div>
  )
}
