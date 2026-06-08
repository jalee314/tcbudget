import React, { useMemo, useState } from 'react'
import { InventoryCard } from '../types'
import { CardImage } from '../utils/cardImage'

interface PullMapPageProps {
  inventory: InventoryCard[]
}

type ViewMode = 'lineage' | 'sets' | 'rarity' | 'pnl'

const SINGLES_ID = '__singles__'

interface ClusterSpec {
  id: string
  label: string
  subtitle?: string
  imageUrl?: string
  cost: number
  isCategoryCluster: boolean
  children: InventoryCard[]
}

interface SealedNode {
  kind: 'sealed'
  id: string
  label: string
  subtitle?: string
  imageUrl?: string
  cost: number
  pullsValue: number
  childCount: number
  isCategoryCluster: boolean
  cx: number
  cy: number
  r: number
}

interface CardNode {
  kind: 'card'
  id: string
  name: string
  setName: string
  rarity: string
  imageUrl?: string
  value: number
  cost: number
  parentId: string
  isSold: boolean
  cx: number
  cy: number
  r: number
}

type GraphNode = SealedNode | CardNode

function formatUSD(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v)
}

function cardValue(c: InventoryCard): number {
  return c.is_sold ? c.sale_price : c.market_price * c.quantity
}

function cardCost(c: InventoryCard): number {
  return c.purchase_price * c.quantity
}

function cardRadius(value: number): number {
  if (value <= 0) return 32
  return Math.max(32, Math.min(140, 26 + Math.sqrt(value) * 5))
}

function sealedRadius(pullsValue: number): number {
  if (pullsValue <= 0) return 100
  return Math.max(100, Math.min(220, 80 + Math.sqrt(pullsValue) * 3.5))
}

// Rarity tiers grouped from the messy real-world strings ("Rare Holo", "Hyper
// Rare", "Common", "Ultra Rare" etc.) into a small set of buckets so the
// "By Rarity" view doesn't end up with 30 micro-clusters.
function bucketRarity(rarity: string): string {
  const r = (rarity || '').toLowerCase()
  if (!r) return 'Unknown'
  if (r.includes('common') && !r.includes('uncommon')) return 'Common'
  if (r.includes('uncommon')) return 'Uncommon'
  if (r.includes('hyper') || r.includes('secret') || r.includes('special illustration'))
    return 'Secret / Hyper Rare'
  if (r.includes('illustration') || r.includes('alt')) return 'Illustration Rare'
  if (r.includes('ultra') || r.includes('full art')) return 'Ultra Rare'
  if (r.includes('double rare') || r === 'rare holo' || r === 'rare') return 'Rare'
  if (r.includes('promo')) return 'Promo'
  return 'Other'
}

const RARITY_ORDER = [
  'Common',
  'Uncommon',
  'Rare',
  'Ultra Rare',
  'Illustration Rare',
  'Secret / Hyper Rare',
  'Promo',
  'Other',
  'Unknown'
]

function buildClusters(
  inventory: InventoryCard[],
  mode: ViewMode
): { clusters: ClusterSpec[]; floatingCards: InventoryCard[] } {
  const childCards = inventory.filter(c => c.item_type !== 'Sealed')

  if (mode === 'lineage' || mode === 'pnl') {
    const sealedParents = inventory.filter(
      c => c.item_type === 'Sealed' && c.is_opened === 1
    )
    const byParent = new Map<string, InventoryCard[]>()
    for (const card of childCards) {
      const key = card.parent_id ?? SINGLES_ID
      const list = byParent.get(key) ?? []
      list.push(card)
      byParent.set(key, list)
    }
    const clusters: ClusterSpec[] = sealedParents.map(s => ({
      id: s.id,
      label: s.name,
      subtitle:
        s.rarity && s.rarity !== 'Sealed' ? `${s.rarity} · ${s.set_name}` : s.set_name,
      imageUrl: s.image_url,
      cost: cardCost(s),
      isCategoryCluster: false,
      children: byParent.get(s.id) ?? []
    }))
    // Orphan cards (no parent_id) flow as standalone floating nodes, not as a
    // synthetic "Singles" cluster — that pseudo-node added more visual noise
    // than meaning, and it implied a relationship that doesn't exist.
    const singles = byParent.get(SINGLES_ID) ?? []
    return { clusters, floatingCards: singles }
  }

  if (mode === 'sets') {
    const bySet = new Map<string, { name: string; children: InventoryCard[] }>()
    for (const card of childCards) {
      const key = card.set_id || card.set_name || 'unknown'
      const entry = bySet.get(key) ?? { name: card.set_name || 'Unknown set', children: [] }
      entry.children.push(card)
      bySet.set(key, entry)
    }
    const clusters: ClusterSpec[] = [...bySet.entries()]
      .sort((a, b) => b[1].children.length - a[1].children.length)
      .map(([key, entry]) => ({
        id: `set-${key}`,
        label: entry.name,
        subtitle: `${entry.children.length} cards`,
        cost: 0,
        isCategoryCluster: true,
        children: entry.children
      }))
    return { clusters, floatingCards: [] }
  }

  // rarity
  const byRarity = new Map<string, InventoryCard[]>()
  for (const card of childCards) {
    const bucket = bucketRarity(card.rarity)
    const list = byRarity.get(bucket) ?? []
    list.push(card)
    byRarity.set(bucket, list)
  }
  const clusters: ClusterSpec[] = [...byRarity.entries()]
    .sort((a, b) => {
      const ia = RARITY_ORDER.indexOf(a[0])
      const ib = RARITY_ORDER.indexOf(b[0])
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    .map(([bucket, children]) => ({
      id: `rarity-${bucket}`,
      label: bucket,
      subtitle: `${children.length} cards`,
      cost: 0,
      isCategoryCluster: true,
      children
    }))
  return { clusters, floatingCards: [] }
}

// Map P&L percent to a fill color: green for gains, red for losses, neutral
// for ~flat positions. Saturation scales with magnitude (capped at ±100%).
function pnlColor(card: InventoryCard): string {
  const cost = cardCost(card)
  if (cost <= 0) return '#FFFFFF'
  const value = cardValue(card)
  const pct = (value - cost) / cost
  const clamped = Math.max(-1, Math.min(1, pct))
  if (clamped >= 0) {
    const alpha = 0.25 + clamped * 0.65
    return `rgba(16, 185, 129, ${alpha.toFixed(2)})`
  }
  const alpha = 0.25 + Math.abs(clamped) * 0.65
  return `rgba(239, 68, 68, ${alpha.toFixed(2)})`
}

const VIEW_OPTIONS: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'lineage', label: 'Lineage', hint: 'Cards grouped by the sealed they came from' },
  { id: 'sets', label: 'By Set', hint: 'Cards grouped by set' },
  { id: 'rarity', label: 'By Rarity', hint: 'Cards grouped by rarity tier' },
  { id: 'pnl', label: 'P&L', hint: 'Lineage layout, colored by gain/loss' }
]

export default function PullMapPage({ inventory }: PullMapPageProps) {
  const [view, setView] = useState<ViewMode>('lineage')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)

  // Container width drives the bin-pack target row width so the layout
  // actually uses the available real estate. Measured once on mount and on
  // resize via ResizeObserver.
  const canvasContainerRef = React.useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(1200)
  React.useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Reset focus when the user switches views — a sealed id from Lineage isn't
  // a valid selection in Sets/Rarity views.
  React.useEffect(() => {
    setSelectedClusterId(null)
  }, [view])

  const graph = useMemo(() => {
    const { clusters: clusterSpecs, floatingCards } = buildClusters(inventory, view)

    const CLUSTER_PAD = 64
    type ClusterLayout = {
      sealed: SealedNode
      cards: CardNode[]
      boundingR: number
    }
    const clusters: ClusterLayout[] = clusterSpecs.map(spec => {
      const pullsValue = spec.children.reduce((sum, c) => sum + cardValue(c), 0)
      const sealedR = sealedRadius(pullsValue)

      const cardEntries = spec.children.map(c => {
        const v = cardValue(c)
        return { card: c, value: v, r: cardRadius(v) }
      })

      const maxChildR = cardEntries.reduce((m, c) => Math.max(m, c.r), 0)
      const n = Math.max(cardEntries.length, 1)
      const arcPerNode = 2 * maxChildR + 22
      const ringR = Math.max(
        sealedR + maxChildR + 28,
        (n * arcPerNode) / (2 * Math.PI)
      )

      const sealed: SealedNode = {
        kind: 'sealed',
        id: spec.id,
        label: spec.label,
        subtitle: spec.subtitle,
        imageUrl: spec.imageUrl,
        cost: spec.cost,
        pullsValue,
        childCount: spec.children.length,
        isCategoryCluster: spec.isCategoryCluster,
        cx: 0,
        cy: 0,
        r: sealedR
      }

      const cards: CardNode[] = cardEntries.map((entry, i) => {
        const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
        return {
          kind: 'card',
          id: entry.card.id,
          name: entry.card.name,
          setName: entry.card.set_name,
          rarity: entry.card.rarity,
          imageUrl: entry.card.image_url,
          value: entry.value,
          cost: cardCost(entry.card),
          parentId: spec.id,
          isSold: entry.card.is_sold === 1,
          cx: Math.cos(angle) * ringR,
          cy: Math.sin(angle) * ringR,
          r: entry.r
        }
      })

      // Add vertical room for the cluster label that hangs below the parent.
      const boundingR = ringR + maxChildR + 24
      return { sealed, cards, boundingR }
    })

    // Use the container's measured width so the layout fills the available
    // window instead of being capped at a fixed value. Floor of 600 keeps
    // things sane while initial measurement is happening.
    const TARGET_ROW_WIDTH = Math.max(600, containerWidth - 16)
    let cursorX = CLUSTER_PAD
    let cursorY = CLUSTER_PAD
    let rowHeight = 0
    let canvasWidth = TARGET_ROW_WIDTH
    for (const cluster of clusters) {
      const w = cluster.boundingR * 2
      const h = cluster.boundingR * 2
      if (cursorX + w + CLUSTER_PAD > TARGET_ROW_WIDTH && cursorX > CLUSTER_PAD) {
        cursorX = CLUSTER_PAD
        cursorY += rowHeight + CLUSTER_PAD
        rowHeight = 0
      }
      const centerX = cursorX + cluster.boundingR
      const centerY = cursorY + cluster.boundingR
      cluster.sealed.cx = centerX
      cluster.sealed.cy = centerY
      for (const card of cluster.cards) {
        card.cx += centerX
        card.cy += centerY
      }
      cursorX += w + CLUSTER_PAD
      rowHeight = Math.max(rowHeight, h)
      canvasWidth = Math.max(canvasWidth, cursorX + CLUSTER_PAD)
    }

    // Floating cards — orphan singles in lineage/PnL — flow into the same
    // bin-pack with no parent edge. They're sorted by value so the biggest
    // sits up front rather than scattered at random.
    const FLOAT_PAD = 18
    const floatingNodes: CardNode[] = []
    const floatingSorted = [...floatingCards].sort(
      (a, b) => cardValue(b) - cardValue(a)
    )
    if (floatingSorted.length > 0) {
      // Start a new row so floating cards don't visually crowd the last
      // cluster — they're a different "class" of item and read better as
      // their own band.
      if (cursorX > CLUSTER_PAD) {
        cursorX = CLUSTER_PAD
        cursorY += rowHeight + CLUSTER_PAD
        rowHeight = 0
      }
      for (const card of floatingSorted) {
        const v = cardValue(card)
        const r = cardRadius(v)
        const w = r * 2
        if (cursorX + w + FLOAT_PAD > TARGET_ROW_WIDTH && cursorX > CLUSTER_PAD) {
          cursorX = CLUSTER_PAD
          cursorY += rowHeight + FLOAT_PAD
          rowHeight = 0
        }
        const cx = cursorX + r
        const cy = cursorY + r
        floatingNodes.push({
          kind: 'card',
          id: card.id,
          name: card.name,
          setName: card.set_name,
          rarity: card.rarity,
          imageUrl: card.image_url,
          value: v,
          cost: cardCost(card),
          parentId: SINGLES_ID,
          isSold: card.is_sold === 1,
          cx,
          cy,
          r
        })
        cursorX += w + FLOAT_PAD
        rowHeight = Math.max(rowHeight, r * 2)
        canvasWidth = Math.max(canvasWidth, cursorX + FLOAT_PAD)
      }
    }
    const canvasHeight = cursorY + rowHeight + CLUSTER_PAD

    const sealedNodes = clusters.map(c => c.sealed)
    const cardNodes = [...clusters.flatMap(c => c.cards), ...floatingNodes]
    const edges = clusters.flatMap(cluster =>
      cluster.cards.map(card => ({ from: cluster.sealed, to: card }))
    )

    const topSources = [...sealedNodes]
      .filter(s => s.id !== SINGLES_ID)
      .sort((a, b) => b.pullsValue - a.pullsValue)
      .slice(0, 5)
    const biggestHits = [...cardNodes].sort((a, b) => b.value - a.value).slice(0, 5)
    const totalPulls =
      view === 'lineage' || view === 'pnl'
        ? cardNodes.filter(c => c.parentId !== SINGLES_ID).length
        : cardNodes.length
    const totalPullValue =
      view === 'lineage' || view === 'pnl'
        ? cardNodes
            .filter(c => c.parentId !== SINGLES_ID)
            .reduce((sum, c) => sum + c.value, 0)
        : cardNodes.reduce((sum, c) => sum + c.value, 0)
    const totalSealedCost = sealedNodes
      .filter(s => !s.isCategoryCluster)
      .reduce((sum, s) => sum + s.cost, 0)

    return {
      sealedNodes,
      cardNodes,
      edges,
      canvasWidth,
      canvasHeight,
      topSources,
      biggestHits,
      totalPulls,
      totalPullValue,
      totalSealedCost
    }
  }, [inventory, view, containerWidth])

  const isEmpty = graph.sealedNodes.length === 0 && graph.cardNodes.length === 0
  const isLineage = view === 'lineage' || view === 'pnl'
  const hasOpenedSealed = graph.sealedNodes.some(s => !s.isCategoryCluster)

  const hoveredNode: GraphNode | undefined = useMemo(() => {
    if (!hoveredId) return undefined
    return (
      graph.sealedNodes.find(s => s.id === hoveredId) ??
      graph.cardNodes.find(c => c.id === hoveredId)
    )
  }, [hoveredId, graph])

  function isNodeDimmed(node: GraphNode): boolean {
    if (!selectedClusterId) return false
    if (node.kind === 'sealed') return node.id !== selectedClusterId
    return node.parentId !== selectedClusterId
  }

  // Find the corresponding inventory row for a card node so we can read raw
  // fields (cost) for the P&L overlay color.
  const inventoryById = useMemo(() => {
    const m = new Map<string, InventoryCard>()
    for (const c of inventory) m.set(c.id, c)
    return m
  }, [inventory])

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center p-10">
          <div className="text-center">
            <p className="text-sm text-surface-700 font-medium">No items yet.</p>
            <p className="text-xs text-surface-500 mt-1">
              Add cards or sealed products to your portfolio and they&apos;ll appear here.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={canvasContainerRef}
            className="flex-1 min-h-0 overflow-auto"
          >
                <svg
                  width={graph.canvasWidth}
                  height={graph.canvasHeight}
                  viewBox={`0 0 ${graph.canvasWidth} ${graph.canvasHeight}`}
                  className="block"
                >
                  {/* Edges (lineage only — in Sets/Rarity views the grouping
                      is the relationship, no edges needed). */}
                  {isLineage && (
                    <g stroke="#9CA3AF" strokeOpacity={0.5} strokeWidth={1}>
                      {graph.edges.map((edge, i) => {
                        const dimmed =
                          selectedClusterId && edge.from.id !== selectedClusterId
                        return (
                          <line
                            key={i}
                            x1={edge.from.cx}
                            y1={edge.from.cy}
                            x2={edge.to.cx}
                            y2={edge.to.cy}
                            opacity={dimmed ? 0.08 : 0.5}
                          />
                        )
                      })}
                    </g>
                  )}

                  {/* Cluster centers (sealed or category) */}
                  {graph.sealedNodes.map(node => {
                    const dimmed = isNodeDimmed(node)
                    const hasImage = !!node.imageUrl && !node.isCategoryCluster
                    const isFocused = selectedClusterId === node.id
                    const inv = inventoryById.get(node.id)
                    return (
                      <g
                        key={node.id}
                        opacity={dimmed ? 0.2 : 1}
                        onMouseEnter={() => setHoveredId(node.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() =>
                          setSelectedClusterId(prev =>
                            prev === node.id ? null : node.id
                          )
                        }
                        className="cursor-pointer"
                      >
                        {hasImage ? (
                          <>
                            <foreignObject
                              x={node.cx - node.r}
                              y={node.cy - node.r}
                              width={node.r * 2}
                              height={node.r * 2}
                            >
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  borderRadius: '50%',
                                  overflow: 'hidden'
                                }}
                              >
                                <CardImage
                                  src={node.imageUrl}
                                  setId={inv?.set_id ?? null}
                                  name={node.label}
                                  alt={node.label}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            </foreignObject>
                            <circle
                              cx={node.cx}
                              cy={node.cy}
                              r={node.r}
                              fill="none"
                              stroke={isFocused ? '#1B6539' : '#22804A'}
                              strokeWidth={isFocused ? 4 : 2.5}
                              pointerEvents="none"
                            />
                          </>
                        ) : (
                          <>
                            <circle
                              cx={node.cx}
                              cy={node.cy}
                              r={node.r}
                              fill={node.isCategoryCluster ? '#E5E7EB' : '#37B86C'}
                              stroke={isFocused ? '#1B6539' : 'transparent'}
                              strokeWidth={3}
                            />
                            <text
                              x={node.cx}
                              y={node.cy + 4}
                              textAnchor="middle"
                              fontSize={11}
                              fontWeight={700}
                              fill={node.isCategoryCluster ? '#374151' : '#FFFFFF'}
                              pointerEvents="none"
                            >
                              {node.childCount}
                            </text>
                          </>
                        )}
                        {/* Label below the cluster center */}
                        <text
                          x={node.cx}
                          y={node.cy + node.r + 16}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={600}
                          fill="#1F2937"
                          pointerEvents="none"
                        >
                          {node.label.length > 28
                            ? node.label.slice(0, 27) + '…'
                            : node.label}
                        </text>
                      </g>
                    )
                  })}

                  {/* Card nodes */}
                  {graph.cardNodes.map(node => {
                    const dimmed = isNodeDimmed(node)
                    const inv = inventoryById.get(node.id)
                    const isChase = node.value >= 50
                    const hasImage = !!node.imageUrl
                    const fill =
                      view === 'pnl' && inv
                        ? pnlColor(inv)
                        : isChase
                        ? '#F59E0B'
                        : '#FFFFFF'
                    const stroke =
                      view === 'pnl'
                        ? '#374151'
                        : isChase
                        ? '#B45309'
                        : '#9CA3AF'
                    return (
                      <g
                        key={node.id}
                        opacity={dimmed ? 0.15 : node.isSold ? 0.45 : 1}
                        onMouseEnter={() => setHoveredId(node.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        className="cursor-pointer"
                      >
                        {hasImage && view !== 'pnl' ? (
                          <>
                            <foreignObject
                              x={node.cx - node.r}
                              y={node.cy - node.r}
                              width={node.r * 2}
                              height={node.r * 2}
                            >
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  borderRadius: '50%',
                                  overflow: 'hidden'
                                }}
                              >
                                <CardImage
                                  src={node.imageUrl}
                                  setId={inv?.set_id ?? null}
                                  name={node.name}
                                  alt={node.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            </foreignObject>
                            <circle
                              cx={node.cx}
                              cy={node.cy}
                              r={node.r}
                              fill="none"
                              stroke={isChase ? '#B45309' : '#9CA3AF'}
                              strokeWidth={isChase ? 2 : 1}
                              strokeDasharray={node.isSold ? '2 2' : undefined}
                              pointerEvents="none"
                            />
                          </>
                        ) : (
                          <circle
                            cx={node.cx}
                            cy={node.cy}
                            r={node.r}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={view === 'pnl' ? 1 : isChase ? 1.5 : 1}
                            strokeDasharray={node.isSold ? '2 2' : undefined}
                          />
                        )}
                      </g>
                    )
                  })}
            </svg>
          </div>
          {hoveredNode && (
            <div className="absolute left-4 bottom-4 max-w-[calc(100%-2rem)] px-3 py-2 rounded-lg bg-surface-900/85 text-xs text-white shadow-lg pointer-events-none">
              {hoveredNode.kind === 'sealed' ? (
                <>
                  <span className="font-semibold">{hoveredNode.label}</span>
                  {hoveredNode.subtitle && ` · ${hoveredNode.subtitle}`}
                  {' · '}
                  {hoveredNode.childCount}{' '}
                  {isLineage ? 'pulls' : 'cards'} ·{' '}
                  <span className="font-semibold">
                    {formatUSD(hoveredNode.pullsValue)}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold">{hoveredNode.name}</span>
                  {' · '}
                  {hoveredNode.setName} · {hoveredNode.rarity} ·{' '}
                  <span className="font-semibold">
                    {formatUSD(hoveredNode.value)}
                  </span>
                  {hoveredNode.isSold && ' · sold'}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
