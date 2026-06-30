import type { CSSProperties } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useToposStore } from '../store'
import { KIND_META, childrenOf, crossingsFor, type Kind } from '../lib/topos'

const handleStyle = { width: 9, height: 9 }

/** A read-only Topos system rendered on the board. Colored by kind; open systems
 *  (those with children) are drillable. Boundary + boundary-crossing connections
 *  show as chips so a leaf is understandable without opening it. */
export function SystemNode({ data }: NodeProps) {
  const name = (data as { name: string }).name
  const world = useToposStore((s) => s.world)
  const level = useToposStore((s) => s.path[s.path.length - 1])
  const tracedThing = useToposStore((s) => s.tracedThing)
  const selected = useToposStore((s) => s.selected === name)

  if (!world) return null
  const sys = world.systems[name]
  if (!sys) return null

  const meta = KIND_META[sys.kind as Kind]
  const open = childrenOf(world, name).length > 0
  const crossings = crossingsFor(world, level, name)
  const childCount = sys.children.length

  const carries = (thing: string) => tracedThing != null && thing === tracedThing
  const traced =
    tracedThing != null &&
    (sys.ins.includes(tracedThing) ||
      sys.outs.includes(tracedThing) ||
      sys.holds.includes(tracedThing) ||
      crossings.some((c) => c.thing === tracedThing))
  const dim = tracedThing != null && !traced

  return (
    <div
      className={`topo-node kind-${sys.kind}${open ? ' is-open' : ''}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}`}
      style={{ '--kind': meta.color } as CSSProperties}
      title={open ? 'Double-click to open' : sys.kind}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="topo-node__head">
        <span className="topo-node__name">{name}</span>
        <span className="topo-node__kind">{meta.label}</span>
        {open && <span className="topo-node__enter" title={`${childCount} inside — double-click to open`}>⤢ {childCount}</span>}
      </div>

      {sys.desc && <div className="topo-node__desc">{sys.desc}</div>}

      {(sys.ins.length > 0 || sys.outs.length > 0 || sys.holds.length > 0) && (
        <div className="topo-node__boundary">
          {sys.ins.map((t, k) => (
            <span key={`i${k}`} className={`bchip in${carries(t) ? ' is-traced' : ''}`}>
              <span className="bk">in</span> {t}
            </span>
          ))}
          {sys.outs.map((t, k) => (
            <span key={`o${k}`} className={`bchip out${carries(t) ? ' is-traced' : ''}`}>
              <span className="bk">out</span> {t}
            </span>
          ))}
          {sys.holds.map((t, k) => (
            <span key={`h${k}`} className={`bchip holds${carries(t) ? ' is-traced' : ''}`}>
              <span className="bk">holds</span> {t}
            </span>
          ))}
        </div>
      )}

      {crossings.length > 0 && (
        <div className="topo-node__ports">
          {crossings.map((c, k) => (
            <span key={k} className={`port port-${c.dir}${carries(c.thing) ? ' is-traced' : ''}`} title={`${c.dir === 'in' ? 'from' : 'to'} ${c.other} (outside this system)`}>
              {c.dir === 'in' ? '⇠' : '⇢'} {c.other} <span className="port-thing">· {c.thing}</span>
            </span>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
}
