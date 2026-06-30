import { useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react'
import { useToposStore } from '../store'
import { SystemNode } from './SystemNode'
import { RoutedEdge } from './RoutedEdge'
import { KIND_META, childrenOf, estimateNodeHeight, layeredLayout, levelEdges, type Kind } from '../lib/topos'

function BoardInner() {
  const world = useToposStore((s) => s.world)
  const level = useToposStore((s) => s.path[s.path.length - 1])
  const tracedThing = useToposStore((s) => s.tracedThing)
  const select = useToposStore((s) => s.select)
  const enter = useToposStore((s) => s.enter)

  const nodeTypes = useMemo(() => ({ sys: SystemNode }), [])
  const edgeTypes = useMemo(() => ({ routed: RoutedEdge }), [])

  const ids = useMemo(() => (world ? childrenOf(world, level) : []), [world, level])
  const lEdges = useMemo(() => (world ? levelEdges(world, level) : []), [world, level])

  const layout = useMemo(
    () =>
      layeredLayout(
        ids,
        lEdges.map((e) => ({ from: e.from, to: e.to })),
        { heightOf: (id) => (world ? estimateNodeHeight(world, level, id) : 130) },
      ),
    [ids, lEdges, world, level],
  )

  const rfNodes: Node[] = useMemo(
    () =>
      ids.map((id) => ({
        id,
        type: 'sys',
        position: layout.pos[id] ?? { x: 0, y: 0 },
        data: { name: id },
      })),
    [ids, layout],
  )

  const rfEdges: Edge[] = useMemo(
    () =>
      lEdges.map((e) => {
        const traced = tracedThing != null && e.things.includes(tracedThing)
        const dim = tracedThing != null && !traced
        const key = `${e.from}__${e.to}`
        return {
          id: key,
          source: e.from,
          target: e.to,
          type: 'routed',
          data: { waypoints: layout.waypoints[key] ?? [], label: e.things.join(', '), traced, dim },
          className: `${traced ? 'is-traced' : ''}${dim ? ' is-dim' : ''}`.trim() || undefined,
          animated: traced,
          markerEnd: { type: MarkerType.ArrowClosed, color: traced ? '#f5c451' : '#39414f', width: 18, height: 18 },
        }
      }),
    [lEdges, tracedThing, layout],
  )

  return (
    <ReactFlow
      key={level} /* remount per level so fitView re-centers */
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, n) => select(n.id)}
      onNodeDoubleClick={(_, n) => enter(n.id)}
      onPaneClick={() => select(null)}
      nodesConnectable={false}
      nodesDraggable
      elementsSelectable={false}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
    >
      <Background color="#2a303c" gap={20} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => {
          const k = world?.systems[n.id]?.kind as Kind | undefined
          return k ? KIND_META[k].color : '#1a1e28'
        }}
        maskColor="rgba(0,0,0,0.5)"
      />
    </ReactFlow>
  )
}

export function Board() {
  const world = useToposStore((s) => s.world)
  const error = useToposStore((s) => s.parseError)

  if (!world) {
    return (
      <div className="board-empty">
        <div className="board-empty__card">
          <div className="board-empty__title">Nothing to show</div>
          <p className="board-empty__msg">{error ?? 'Load a .topo file to visualize it.'}</p>
        </div>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <BoardInner />
    </ReactFlowProvider>
  )
}
