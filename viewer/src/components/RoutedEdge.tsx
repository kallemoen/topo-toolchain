import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { Pos } from '../lib/topos'

interface RoutedData {
  waypoints?: Pos[]
  label?: string
  traced?: boolean
  dim?: boolean
}

/** Catmull-Rom spline through the points → a smooth, box-avoiding path. */
function smoothPath(pts: Pos[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? pts[i + 1]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`
  }
  return d
}

/** Edge that follows precomputed waypoints (so long/feedback edges route around
 *  boxes), with its label rendered in the lane it travels through. */
export function RoutedEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = props
  const data = (props.data ?? {}) as RoutedData
  const wps = data.waypoints ?? []

  let path: string
  let lx: number
  let ly: number
  if (wps.length) {
    const pts = [{ x: sourceX, y: sourceY }, ...wps, { x: targetX, y: targetY }]
    path = smoothPath(pts)
    const mid = pts[Math.floor(pts.length / 2)]
    lx = mid.x
    ly = mid.y
  } else {
    const [p, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
    path = p
    lx = labelX
    ly = labelY
  }

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} />
      {data.label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label${data.traced ? ' is-traced' : ''}${data.dim ? ' is-dim' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
