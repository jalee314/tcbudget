import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  ColDef,
  CellValueChangedEvent,
  ICellRendererParams,
  IHeaderParams,
  RowDragEndEvent
} from 'ag-grid-community'
import { InventoryCard } from '../types'
import { CardImage } from '../utils/cardImage'

const CARD_CONDITIONS = ['Raw', 'Raw NM', 'Raw LP', 'Raw MP', 'Raw HP', 'PSA 10', 'PSA 9', 'PSA 8', 'PSA 7', 'CGC 10', 'CGC 9.5', 'CGC 9', 'BGS 10', 'BGS 9.5', 'BGS 9']
const SEALED_CONDITIONS = ['Sealed', 'Opened']

const TOGGLEABLE_COLUMNS: { colId: string; label: string }[] = [
  { colId: 'rarity', label: 'Rarity' },
  { colId: 'condition', label: 'Condition' },
  { colId: 'quantity', label: 'Qty' },
  { colId: 'market_value', label: 'Market Value' },
  { colId: 'purchase_price', label: 'Cost Basis' },
  { colId: 'total_gl', label: 'Total G/L' },
  { colId: 'sale_price', label: 'Sale Price' },
  { colId: 'purchase_date', label: 'Date' },
  { colId: 'notes', label: 'Notes' }
]
const DEFAULT_HIDDEN: string[] = []

type ColumnPreset = 'simple' | 'detailed'
const SIMPLE_VISIBLE_COLS: string[] = ['quantity', 'condition', 'market_value', 'total_gl', 'notes']

type DisplayMode = '$' | '%'

type GridRow = InventoryCard & {
  __isGroup?: boolean
  __inGroup?: boolean
  __groupKey?: string
  __lotCount?: number
  __expanded?: boolean
  __sortIndex?: number
}

interface DataGridProps {
  rowData: InventoryCard[]
  onCellValueChanged: (id: string, field: string, value: unknown) => void
  onDeleteRow: (id: string) => void
  onToggleSold: (card: InventoryCard) => void
  onToggleOpened: (card: InventoryCard) => void
  onToggleKeep: (card: InventoryCard) => void
  includeHeldInPL: boolean
  onToggleIncludeHeldInPL: () => void
  onViewContents?: (id: string) => void
  onEditPulledFrom?: (card: InventoryCard) => void
  onReorder?: (orderedIds: string[]) => void
}

// ─── Custom Cell Renderers ──────────────────────────────────────────────

// TCGplayer-sourced card names usually end with " - 199/197" or " - 199".
// Strip that suffix for cards so the row shows the actual card name only;
// the dedicated card-number column is the source of truth for that data.
function displayCardName(name: string, itemType?: string): string {
  if (itemType !== 'Card') return name
  return name.replace(/\s+[-–—]\s+\d+(\s*\/\s*\d+)?\s*$/, '').trim()
}

function CardNameRenderer(props: ICellRendererParams<GridRow> & { onToggleGroup?: (key: string) => void }) {
  const data = props.data
  if (!data) return null

  if (data.__isGroup) {
    return (
      <button
        onClick={() => props.onToggleGroup?.(data.__groupKey!)}
        className="flex items-center gap-3 overflow-hidden w-full text-left hover:bg-surface-100/50 -mx-4 px-4 py-1 rounded transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-surface-500 transition-transform flex-shrink-0 ${data.__expanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <div className="w-8 h-11 rounded overflow-hidden flex-shrink-0 bg-surface-100">
          <CardImage
            src={data.image_url}
            setId={data.set_id}
            name={data.name}
            alt={data.name}
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-surface-900 leading-snug flex items-start gap-2 whitespace-normal">
            <span className="min-w-0 line-clamp-2 break-words">{displayCardName(data.name, data.item_type)}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent-dark flex-shrink-0 self-center">
              {data.__lotCount} lots
            </span>
          </div>
          <div className="text-[11px] text-surface-500 truncate">{data.set_name}</div>
        </div>
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-3 overflow-hidden w-full ${data.__inGroup ? 'pl-6' : ''}`}>
      <div className="w-8 h-11 rounded overflow-hidden flex-shrink-0 bg-surface-100">
        <CardImage
          src={data.image_url}
          setId={data.set_id}
          name={data.name}
          alt={data.name}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-surface-900 leading-snug line-clamp-2 whitespace-normal break-words">
          {data.__inGroup ? <span className="text-surface-500 text-[11px]">Lot · </span> : null}
          {displayCardName(data.name, data.item_type)}
        </div>
        <div className="text-[11px] text-surface-500 truncate">{data.set_name}</div>
      </div>
    </div>
  )
}

function RarityRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data) return null
  if (data.item_type === 'Sealed') return <span className="text-surface-300">—</span>
  return <span className="text-surface-500 text-xs">{data.rarity || '—'}</span>
}

function ConditionRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data) return null
  if (data.item_type === 'Sealed') {
    const isOpened = data.is_opened === 1
    return (
      <span className={`text-xs font-medium ${isOpened ? 'text-amber-700' : 'text-surface-700'}`}>
        {isOpened ? 'Opened' : 'Sealed'}
      </span>
    )
  }
  return <span className="text-surface-700 text-xs font-medium">{data.condition || '—'}</span>
}

function MarketValueRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data) return null
  const total = data.market_price * data.quantity
  const showPriceChange = !(data.is_opened === 1 && !data.is_sold)
  const baseline = data.price_change_baseline ?? data.market_price
  const delta = data.market_price - baseline
  const pct = baseline > 0 ? ((data.market_price - baseline) / baseline) * 100 : null
  const hasMovement = showPriceChange && pct != null && Math.abs(delta) > 0.005
  const isPositive = delta >= 0
  const colorClass = isPositive ? 'text-gain' : 'text-loss'

  return (
    <div className="flex flex-col justify-center leading-tight tabular-nums py-0.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-surface-900 font-medium text-sm">{formatCurrency(total)}</span>
        {hasMovement && (
          <span className={`text-[11px] font-medium ${colorClass}`}>
            {isPositive ? '▲' : '▼'}{Math.abs(pct!).toFixed(1)}%
          </span>
        )}
      </div>
      {data.quantity > 1 && (
        <span className="text-surface-500 text-[11px]">{formatCurrency(data.market_price)} each</span>
      )}
    </div>
  )
}

function CostBasisRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data) return null
  const isGroup = !!data.__isGroup
  if (data.purchase_price === 0 && !isGroup) {
    if (data.parent_id) {
      return (
        <span className="badge badge-pulled" title="Pulled from a set — no purchase cost">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.29 7 12 12 20.71 7"/>
            <line x1="12" y1="22" x2="12" y2="12"/>
          </svg>
          Pulled
        </span>
      )
    }
    return (
      <span className="badge badge-gift" title="Gifted — no purchase cost">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 12 20 22 4 22 4 12"/>
          <rect x="2" y="7" width="20" height="5"/>
          <line x1="12" y1="22" x2="12" y2="7"/>
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
        </svg>
        Gift
      </span>
    )
  }
  const total = data.purchase_price * data.quantity
  return (
    <div className="flex items-baseline gap-1.5 tabular-nums">
      <span className={`text-sm font-medium ${isGroup ? 'text-surface-500 italic' : 'text-surface-900'}`}>
        {formatCurrency(total)}
      </span>
      {data.quantity > 1 && (
        <span className="text-surface-500 text-xs">({formatCurrency(data.purchase_price)})</span>
      )}
    </div>
  )
}

function makeTotalGLRenderer(mode: DisplayMode) {
  return function TotalGLRenderer(props: ICellRendererParams<GridRow>) {
    const data = props.data
    if (!data) return null
    if (data.is_sold || (data.is_opened === 1 && !data.is_sold)) {
      return <span className="text-surface-300">—</span>
    }
    const gl = (data.market_price - data.purchase_price) * data.quantity
    const isPositive = gl >= 0
    const pct = data.purchase_price > 0
      ? ((data.market_price - data.purchase_price) / data.purchase_price) * 100
      : null
    const colorClass = gl === 0 ? 'text-surface-500' : isPositive ? 'text-gain' : 'text-loss'
    return (
      <span className={`text-[15px] font-bold tabular-nums ${colorClass}`}>
        {mode === '$'
          ? `${isPositive && gl !== 0 ? '+' : ''}${formatCurrency(gl)}`
          : pct == null ? '—' : `${isPositive && pct !== 0 ? '+' : ''}${pct.toFixed(2)}%`}
      </span>
    )
  }
}

function ToggleHeader(props: IHeaderParams & { mode: DisplayMode; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); props.onToggle() }}
      className="flex items-center gap-1 w-full h-full text-left hover:text-surface-900 transition-colors"
      title={`Show as ${props.mode === '$' ? 'percentage' : 'dollars'}`}
    >
      <span>{props.label}</span>
      <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-surface-100 text-surface-500">
        {props.mode}
      </span>
    </button>
  )
}

function makeSaleRenderer(mode: DisplayMode) {
  return function SaleRenderer(props: ICellRendererParams<GridRow>) {
    const data = props.data
    if (!data || data.__isGroup || !data.is_sold || data.sale_price === 0) {
      return <span className="text-surface-400">—</span>
    }
    const total = data.sale_price
    const cost = data.purchase_price * data.quantity
    const gl = total - cost
    const isPositive = gl >= 0
    const pct = cost > 0 ? (gl / cost) * 100 : null
    const glClass = gl === 0 ? 'text-surface-500' : isPositive ? 'text-gain' : 'text-loss'
    const glText = mode === '$'
      ? `${isPositive && gl !== 0 ? '+' : ''}${formatCurrency(gl)}`
      : pct == null ? '—' : `${isPositive && pct !== 0 ? '+' : ''}${pct.toFixed(1)}%`

    return (
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-surface-900 font-medium text-sm">{formatCurrency(total)}</span>
        <span className={`text-xs ${glClass}`}>({glText})</span>
      </div>
    )
  }
}

function ActionsRenderer(props: ICellRendererParams<GridRow> & {
  onDelete: (id: string) => void
  onToggleSold: (card: InventoryCard) => void
  onToggleOpened: (card: InventoryCard) => void
  onToggleKeep: (card: InventoryCard) => void
  onViewContents?: (id: string) => void
  onEditPulledFrom?: (card: InventoryCard) => void
}) {
  const data = props.data
  if (!data || data.__isGroup) return null

  const isSold = !!data.is_sold
  const isSealed = data.item_type === 'Sealed'
  const isOpened = data.is_opened === 1
  const isCard = data.item_type === 'Card'
  const isHeld = !isSold && !isOpened
  const isKept = data.is_kept === 1

  return (
    <div className="flex items-center gap-1">
      {/* Keep toggle — only meaningful for held items (not sold, not opened) */}
      {isHeld && (
        <button
          onClick={() => props.onToggleKeep(data)}
          className={`p-1.5 rounded-md transition-all ${isKept ? 'text-indigo-600 hover:bg-indigo-50' : 'text-surface-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
          title={isKept ? 'Including in P&L' : 'Exclude from P&L (mark as keeping)'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={isKept ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      )}
      {/* Pulled-from edit — cards only */}
      {isCard && props.onEditPulledFrom && (
        <button
          onClick={() => props.onEditPulledFrom!(data)}
          className={`p-1.5 rounded-md transition-all ${data.parent_id ? 'text-accent-dark hover:bg-accent/10' : 'text-surface-500 hover:text-accent-dark hover:bg-accent/10'}`}
          title={data.parent_id ? 'Edit pulled-from source' : 'Set pulled-from source'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </button>
      )}

      {/* View contents — show for opened sealed items */}
      {isSealed && isOpened && props.onViewContents && (
        <button
          onClick={() => props.onViewContents!(data.id)}
          className="p-1.5 rounded-md text-surface-500 hover:text-accent hover:bg-accent/10 transition-all"
          title="View Pulled Cards"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.29 7 12 12 20.71 7"/>
            <line x1="12" y1="22" x2="12" y2="12"/>
          </svg>
        </button>
      )}

      {/* Open/seal toggle — only for sealed items that aren't sold */}
      {isSealed && !isSold && (
        <button
          onClick={() => props.onToggleOpened(data)}
          className={`p-1.5 rounded-md transition-all ${isOpened ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50' : 'text-surface-500 hover:text-amber-600 hover:bg-amber-50'}`}
          title={isOpened ? 'Mark as Sealed' : 'Mark as Opened'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isOpened ? (
              <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></>
            ) : (
              <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
            )}
          </svg>
        </button>
      )}

      {/* Sold toggle */}
      <button
        onClick={() => props.onToggleSold(data)}
        className="p-1.5 rounded-md text-surface-500 hover:text-surface-900 hover:bg-surface-200 transition-all"
        title={isSold ? 'Mark as Held' : 'Mark as Sold'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isSold ? (
            <><path d="M3 12h18"/><path d="m8 7-5 5 5 5"/></>
          ) : (
            <><path d="M20 6 9 17l-5-5"/></>
          )}
        </svg>
      </button>

      {/* Delete */}
      <button
        onClick={() => props.onDelete(data.id)}
        className="p-1.5 rounded-md text-surface-500 hover:text-loss hover:bg-loss/10 transition-all"
        title="Delete"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        </svg>
      </button>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(val)
}

// Row-status visual encoding: a 3px inset stripe on the left edge of the row,
// replacing the dedicated Status column. Held rows get no stripe (the common
// case is the visual default; non-held states stand out).
function getRowStatusStyle(params: { data?: GridRow }): { [key: string]: string } | undefined {
  const d = params.data
  if (!d || d.__isGroup || d.__inGroup) return undefined
  if (d.is_sold) return { boxShadow: 'inset 3px 0 0 #94a3b8' }
  if (d.is_opened === 1) return { boxShadow: 'inset 3px 0 0 #f59e0b' }
  if (d.is_kept === 1) return { boxShadow: 'inset 3px 0 0 #6366f1' }
  return undefined
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function DataGrid({ rowData, onCellValueChanged, onDeleteRow, onToggleSold, onToggleOpened, onToggleKeep, includeHeldInPL, onToggleIncludeHeldInPL, onViewContents, onEditPulledFrom, onReorder }: DataGridProps) {
  const gridRef = useRef<AgGridReact>(null)
  const gridWrapperRef = useRef<HTMLDivElement>(null)
  const [filterText, setFilterText] = useState('')
  const [viewFilter, setViewFilter] = useState<'all' | 'cards' | 'sealed'>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    // Read persisted column visibility synchronously during initial render so
    // the grid mounts directly into the user's preferred preset (avoids the
    // flash from Detailed → Simple on refresh).
    try {
      const saved = localStorage.getItem('datagrid:hiddenColumns')
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {}
    return new Set(DEFAULT_HIDDEN)
  })

  useEffect(() => {
    try {
      localStorage.setItem('datagrid:hiddenColumns', JSON.stringify([...hiddenColumns]))
    } catch {}
  }, [hiddenColumns])
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const columnMenuRef = useRef<HTMLDivElement>(null)
  const [totalGLMode, setTotalGLMode] = useState<DisplayMode>('$')
  const [salePriceMode, setSalePriceMode] = useState<DisplayMode>('$')

  const toggleColumn = useCallback((colId: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev)
      if (next.has(colId)) next.delete(colId)
      else next.add(colId)
      return next
    })
  }, [])

  const simpleHiddenSet = useMemo(
    () => new Set(TOGGLEABLE_COLUMNS.filter(c => !SIMPLE_VISIBLE_COLS.includes(c.colId)).map(c => c.colId)),
    []
  )

  const activePreset: ColumnPreset = useMemo(() => {
    if (hiddenColumns.size !== simpleHiddenSet.size) return 'detailed'
    for (const id of simpleHiddenSet) if (!hiddenColumns.has(id)) return 'detailed'
    return 'simple'
  }, [hiddenColumns, simpleHiddenSet])

  const applyPreset = useCallback((preset: ColumnPreset) => {
    setHiddenColumns(preset === 'simple' ? new Set(simpleHiddenSet) : new Set())
  }, [simpleHiddenSet])

  useEffect(() => {
    if (!showColumnMenu) return
    const handler = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColumnMenu])

  const handleTotalGLModeToggle = useCallback(() => {
    setTotalGLMode(m => m === '$' ? '%' : '$')
  }, [])

  const handleSalePriceModeToggle = useCallback(() => {
    setSalePriceMode(m => m === '$' ? '%' : '$')
  }, [])

  // Click on grid wrapper background → clear cell focus
  useEffect(() => {
    const wrapper = gridWrapperRef.current
    if (!wrapper) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // If the click landed outside any actual row/cell, clear focus
      if (!target.closest('.ag-row') && !target.closest('.ag-header')) {
        gridRef.current?.api?.clearFocusedCell()
      }
    }
    wrapper.addEventListener('mousedown', handler)
    return () => wrapper.removeEventListener('mousedown', handler)
  }, [])

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const filteredByType = useMemo(() => {
    if (viewFilter === 'cards') return rowData.filter(c => c.item_type === 'Card')
    if (viewFilter === 'sealed') return rowData.filter(c => c.item_type === 'Sealed')
    return rowData
  }, [rowData, viewFilter])

  // Columns auto-hidden by context: irrelevant to the current tab or to the
  // current data (e.g. Sale Price when nothing is sold). Layered on top of
  // the user's manual hide set so it doesn't affect the Simple/Detailed preset
  // detection.
  const autoHiddenColumns = useMemo(() => {
    const set = new Set<string>()
    if (viewFilter === 'sealed') set.add('rarity')
    if (!filteredByType.some(r => r.is_sold)) set.add('sale_price')
    return set
  }, [viewFilter, filteredByType])

  const isHidden = useCallback(
    (colId: string) => hiddenColumns.has(colId) || autoHiddenColumns.has(colId),
    [hiddenColumns, autoHiddenColumns]
  )

  const rowOrder = useMemo(() => {
    const order = new Map<string, number>()
    filteredByType.forEach((card, index) => {
      order.set(card.id, index)
    })
    return order
  }, [filteredByType])

  // Build grid rows with lot grouping for held items that share a card_id but differ in purchase_price.
  const gridRows = useMemo<GridRow[]>(() => {
    const groupable: InventoryCard[] = []
    const ungrouped: InventoryCard[] = []
    for (const c of filteredByType) {
      if (!c.is_sold && !c.is_opened && c.card_id) groupable.push(c)
      else ungrouped.push(c)
    }

    const buckets = new Map<string, InventoryCard[]>()
    for (const c of groupable) {
      const key = `${c.card_id}|${c.condition || ''}|${c.variant_id || ''}`
      const arr = buckets.get(key) ?? []
      arr.push(c)
      buckets.set(key, arr)
    }

    const out: GridRow[] = []
    for (const [key, lots] of buckets) {
      const sourceIndexes = lots
        .map(lot => rowOrder.get(lot.id) ?? Number.MAX_SAFE_INTEGER)
        .filter(index => index !== Number.MAX_SAFE_INTEGER)
      const sortIndex = sourceIndexes.length > 0 ? Math.min(...sourceIndexes) : Number.MAX_SAFE_INTEGER
      const distinctPrices = new Set(lots.map(l => l.purchase_price))
      if (lots.length >= 2 && distinctPrices.size >= 2) {
        const totalQty = lots.reduce((s, l) => s + l.quantity, 0)
        const totalCost = lots.reduce((s, l) => s + l.purchase_price * l.quantity, 0)
        const avgCost = totalQty > 0 ? totalCost / totalQty : 0
        const sample = lots[0]
        const isExpanded = expandedGroups.has(key)
        const groupRow: GridRow = {
          ...sample,
          id: `__group__${key}`,
          quantity: totalQty,
          purchase_price: avgCost,
          notes: '',
          sale_price: 0,
          sale_date: '',
          is_sold: 0,
          is_opened: 0,
          __isGroup: true,
          __groupKey: key,
          __lotCount: lots.length,
          __expanded: isExpanded,
          __sortIndex: sortIndex
        }
        out.push(groupRow)
        if (isExpanded) {
          for (const lot of lots) {
            out.push({
              ...lot,
              __inGroup: true,
              __groupKey: key,
              __sortIndex: rowOrder.get(lot.id) ?? Number.MAX_SAFE_INTEGER
            })
          }
        }
      } else {
        for (const lot of lots) {
          out.push({
            ...lot,
            __sortIndex: rowOrder.get(lot.id) ?? Number.MAX_SAFE_INTEGER
          })
        }
      }
    }
    for (const u of ungrouped) {
      out.push({
        ...u,
        __sortIndex: rowOrder.get(u.id) ?? Number.MAX_SAFE_INTEGER
      })
    }
    out.sort((a, b) => (a.__sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.__sortIndex ?? Number.MAX_SAFE_INTEGER))
    return out
  }, [filteredByType, expandedGroups, rowOrder])

  const handleRowDragEnd = useCallback((event: RowDragEndEvent<GridRow>) => {
    if (!onReorder) return
    const orderedIds: string[] = []
    event.api.forEachNodeAfterFilterAndSort(node => {
      if (node.data && !node.data.__isGroup && !node.data.__inGroup) {
        orderedIds.push(node.data.id)
      }
    })
    onReorder(orderedIds)
  }, [onReorder])

  // ─── Custom drag ghost ─────────────────────────────────────────────
  // AG Grid's default drag ghost only shows the cell whose column has
  // rowDrag: true (the name column here). To show the entire row visually
  // while keeping drag initiation locked to the handle, we hide the
  // default ghost (in index.css) and clone the source row's DOM into a
  // fixed-position element that tracks the cursor.
  const dragCloneRef = useRef<HTMLElement | null>(null)

  const startCustomGhost = useCallback((rowId: string) => {
    if (dragCloneRef.current) return
    const sourceRow = document.querySelector<HTMLElement>(`.ag-row[row-id="${rowId}"]`)
    if (!sourceRow) return
    const rect = sourceRow.getBoundingClientRect()

    // Wrap the clone in a theme container — the `.ag-theme-custom-light
    // .ag-cell { display: flex; align-items: center; padding: ... }` rules
    // require that ancestor for cells to size and align correctly.
    // Without the wrapper, the clone collapses: text hugs the top of each
    // cell, separators disappear, and horizontal padding vanishes.
    const wrapper = document.createElement('div')
    wrapper.className = 'ag-theme-custom-light row-drag-ghost'
    wrapper.style.position = 'fixed'
    wrapper.style.left = '0'
    wrapper.style.top = '0'
    wrapper.style.width = `${rect.width}px`
    wrapper.style.height = `${rect.height}px`
    wrapper.style.transform = `translate(${rect.left}px, ${rect.top}px)`
    wrapper.style.pointerEvents = 'none'
    wrapper.style.zIndex = '9999'

    const clone = sourceRow.cloneNode(true) as HTMLElement
    // AG Grid positions rows via inline transform (translateY for vertical
    // offset inside the viewport). That has to be cleared or the cloned
    // row will float to its original table position inside the wrapper.
    clone.style.position = 'relative'
    clone.style.transform = 'none'
    clone.style.top = '0'
    clone.style.left = '0'
    clone.style.width = '100%'
    clone.style.height = '100%'

    wrapper.appendChild(clone)
    document.body.appendChild(wrapper)
    dragCloneRef.current = wrapper
  }, [])

  const stopCustomGhost = useCallback(() => {
    dragCloneRef.current?.remove()
    dragCloneRef.current = null
  }, [])

  // Mouse position drives the clone's transform — runs once for the
  // grid's lifetime; the listener cheaply no-ops when there's no active
  // ghost, which keeps drag start latency low.
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const el = dragCloneRef.current
      if (!el) return
      el.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 24}px)`
    }
    const handleUp = () => stopCustomGhost()
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [stopCustomGhost])

  const handleRowDragEnter = useCallback((event: { node: { data?: GridRow } }) => {
    if (event.node?.data?.id) startCustomGhost(event.node.data.id)
  }, [startCustomGhost])

  const totalGLRenderer = useMemo(() => makeTotalGLRenderer(totalGLMode), [totalGLMode])
  const saleRenderer = useMemo(() => makeSaleRenderer(salePriceMode), [salePriceMode])

  const columnDefs = useMemo<ColDef<GridRow>[]>(() => [
    {
      headerName: 'Item',
      colId: 'name',
      field: 'name',
      cellRenderer: CardNameRenderer,
      cellRendererParams: { onToggleGroup: toggleGroup },
      rowDrag: (params) => !params.data?.__inGroup,
      width: 240,
      minWidth: 180,
      filter: false,
      wrapText: true,
      tooltipValueGetter: (params) => params.data?.name ?? ''
    },
    {
      headerName: 'Rarity',
      colId: 'rarity',
      field: 'rarity',
      width: 80,
      minWidth: 65,
      filter: false,
      hide: isHidden('rarity'),
      cellRenderer: RarityRenderer
    },
    {
      headerName: 'Condition',
      colId: 'condition',
      field: 'condition',
      width: 90,
      minWidth: 75,
      hide: isHidden('condition'),
      editable: (params) => !params.data?.__isGroup,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: (params: any) => ({
        values: params.data?.item_type === 'Sealed' ? SEALED_CONDITIONS : CARD_CONDITIONS
      }),
      cellRenderer: ConditionRenderer,
      valueGetter: (params) => {
        const d = params.data
        if (!d) return ''
        if (d.item_type === 'Sealed') return d.is_opened === 1 ? 'Opened' : 'Sealed'
        return d.condition || ''
      }
    },
    {
      headerName: 'Qty',
      colId: 'quantity',
      field: 'quantity',
      width: 55,
      minWidth: 48,
      hide: isHidden('quantity'),
      editable: (params) => !params.data?.__isGroup,
      cellDataType: 'number',
      cellClass: 'tabular-nums'
    },
    {
      headerName: 'Market Value',
      colId: 'market_value',
      width: 125,
      minWidth: 105,
      hide: isHidden('market_value'),
      cellRenderer: MarketValueRenderer,
      sortable: true,
      comparator: (_a, _b, nodeA, nodeB) => {
        const a = nodeA.data ? nodeA.data.market_price * nodeA.data.quantity : 0
        const b = nodeB.data ? nodeB.data.market_price * nodeB.data.quantity : 0
        return a - b
      }
    },
    {
      headerName: 'Cost Basis',
      colId: 'purchase_price',
      field: 'purchase_price',
      width: 105,
      minWidth: 90,
      hide: isHidden('purchase_price'),
      editable: (params) => !params.data?.__isGroup,
      cellDataType: 'number',
      cellRenderer: CostBasisRenderer,
      sortable: true,
      comparator: (_a, _b, nodeA, nodeB) => {
        const a = nodeA.data ? nodeA.data.purchase_price * nodeA.data.quantity : 0
        const b = nodeB.data ? nodeB.data.purchase_price * nodeB.data.quantity : 0
        return a - b
      }
    },
    {
      headerName: 'TOTAL G/L',
      colId: 'total_gl',
      width: 110,
      minWidth: 95,
      hide: isHidden('total_gl'),
      cellRenderer: totalGLRenderer,
      headerComponent: ToggleHeader,
      headerComponentParams: {
        mode: totalGLMode,
        onToggle: handleTotalGLModeToggle,
        label: 'TOTAL G/L'
      },
      sortable: true,
      comparator: (_a, _b, nodeA, nodeB) => {
        const a = nodeA.data ? (nodeA.data.market_price - nodeA.data.purchase_price) * nodeA.data.quantity : 0
        const b = nodeB.data ? (nodeB.data.market_price - nodeB.data.purchase_price) * nodeB.data.quantity : 0
        return a - b
      }
    },
    {
      headerName: 'SALE PRICE',
      colId: 'sale_price',
      field: 'sale_price',
      width: 145,
      minWidth: 125,
      hide: isHidden('sale_price'),
      editable: (params) => params.data?.is_sold === 1,
      cellDataType: 'number',
      cellRenderer: saleRenderer,
      headerComponent: ToggleHeader,
      headerComponentParams: {
        mode: salePriceMode,
        onToggle: handleSalePriceModeToggle,
        label: 'SALE PRICE'
      },
      tooltipValueGetter: (params) => {
        const d = params.data
        if (!d || !d.is_sold) return ''
        const unit = d.quantity > 0 ? d.sale_price / d.quantity : 0
        const pct = d.market_price > 0 ? (unit / d.market_price) * 100 : null
        return `Total ${formatCurrency(d.sale_price)} · Unit ${formatCurrency(unit)}${pct != null ? ` · ${pct.toFixed(1)}% of market` : ''}`
      }
    },
    {
      headerName: 'Date',
      colId: 'purchase_date',
      field: 'purchase_date',
      width: 110,
      minWidth: 95,
      hide: isHidden('purchase_date'),
      editable: (params) => !params.data?.__isGroup,
      cellEditor: 'agDateStringCellEditor',
      cellEditorParams: {
        min: '2000-01-01',
        max: new Date().toISOString().slice(0, 10)
      },
      cellClass: 'text-surface-500 text-xs tabular-nums',
      valueFormatter: (params) => {
        const v = params.value as string | null | undefined
        if (!v) return ''
        const d = new Date(v)
        if (isNaN(d.getTime())) return v
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }
    },
    {
      headerName: 'Notes',
      colId: 'notes',
      field: 'notes',
      flex: 1,
      minWidth: 100,
      hide: isHidden('notes'),
      editable: (params) => !params.data?.__isGroup,
      cellClass: 'text-surface-500 text-xs'
    },
    {
      headerName: '',
      colId: 'actions',
      valueGetter: (params) => params.data ? `${params.data.is_sold}|${params.data.is_opened}|${params.data.is_kept ?? 0}|${params.data.parent_id ?? ''}` : '',
      width: 158,
      minWidth: 158,
      cellRenderer: ActionsRenderer,
      cellRendererParams: {
        onDelete: onDeleteRow,
        onToggleSold: onToggleSold,
        onToggleOpened: onToggleOpened,
        onToggleKeep: onToggleKeep,
        onViewContents: onViewContents,
        onEditPulledFrom: onEditPulledFrom
      },
      sortable: false,
      filter: false
    }
  ], [onDeleteRow, onToggleSold, onToggleOpened, onToggleKeep, onViewContents, onEditPulledFrom, toggleGroup, isHidden, totalGLRenderer, saleRenderer, totalGLMode, salePriceMode, handleTotalGLModeToggle, handleSalePriceModeToggle])

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
    cellStyle: { lineHeight: 'normal' }
  }), [])

  const handleCellValueChanged = useCallback((event: CellValueChangedEvent<GridRow>) => {
    if (!event.data || event.data.__isGroup) return

    // Special-case: editing the Condition cell on a sealed item maps to is_opened.
    if (event.colDef.colId === 'condition' && event.data.item_type === 'Sealed') {
      const newVal = event.newValue as string
      const newOpened = newVal === 'Opened' ? 1 : 0
      if ((event.data.is_opened ?? 0) !== newOpened) {
        onToggleOpened(event.data)
      }
      // Don't write Sealed/Opened into the condition column itself.
      event.api.refreshCells({ rowNodes: [event.node], force: true })
      return
    }

    if (event.colDef.field) {
      onCellValueChanged(event.data.id, event.colDef.field, event.newValue)
      event.api.refreshCells({ rowNodes: [event.node], force: true })
    }
  }, [onCellValueChanged, onToggleOpened])

  const onFilterTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value)
    gridRef.current?.api?.setGridOption('quickFilterText', e.target.value)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Grid Filter Bar */}
      <div className="flex items-center gap-3 px-6 py-3">
        <div className="flex gap-1 border border-surface-200 rounded-lg p-0.5 bg-surface-50">
          {(['all', 'cards', 'sealed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setViewFilter(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewFilter === tab
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'cards' ? 'Cards' : 'Sealed'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            placeholder="Filter items..."
            value={filterText}
            onChange={onFilterTextChange}
            className="input-dark !pl-10 !py-2 !text-xs"
          />
        </div>
        <span className="text-xs text-surface-500 tabular-nums">
          {filteredByType.length} {filteredByType.length === 1 ? 'item' : 'items'}
        </span>

        <div className="ml-auto flex gap-1 border border-surface-200 rounded-lg p-0.5 bg-surface-50">
          {(['simple', 'detailed'] as const).map(p => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activePreset === p
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
              title={p === 'simple' ? 'Show only essentials' : 'Show all columns'}
            >
              {p === 'simple' ? 'Simple' : 'Detailed'}
            </button>
          ))}
        </div>

        <button
          onClick={onToggleIncludeHeldInPL}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-surface-700 border border-surface-200 rounded-lg bg-surface-50 hover:bg-white transition-colors"
          title={includeHeldInPL ? 'Held cards count toward P&L. Click to exclude.' : 'Held cards excluded from P&L. Click to include.'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="3" width="14" height="18" rx="2"/>
            <path d="M9 8h6"/>
            <path d="M9 12h6"/>
            <path d="M9 16h4"/>
          </svg>
          Held in P&L
          <span className={`text-[9px] font-bold px-1 py-0 leading-none rounded ${includeHeldInPL ? 'bg-accent/15 text-accent-dark' : 'bg-surface-200 text-surface-600'}`}>
            {includeHeldInPL ? 'ON' : 'OFF'}
          </span>
        </button>

        <div className="relative" ref={columnMenuRef}>
          <button
            onClick={() => setShowColumnMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-surface-700 border border-surface-200 rounded-lg bg-surface-50 hover:bg-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>
            </svg>
            Columns
            {hiddenColumns.size > 0 && (
              <span className="text-[9px] font-bold px-1 py-0 leading-none rounded bg-accent/15 text-accent-dark">
                {TOGGLEABLE_COLUMNS.length - hiddenColumns.size}/{TOGGLEABLE_COLUMNS.length}
              </span>
            )}
          </button>

          {showColumnMenu && (
            <div className="absolute right-0 top-full mt-1 z-20 w-56 max-h-80 overflow-y-auto bg-white border border-surface-200 rounded-lg shadow-lg-soft py-1">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-100">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Show Columns</span>
                <button
                  onClick={() => setHiddenColumns(new Set())}
                  className="text-[11px] text-accent hover:text-accent-dark font-medium"
                >
                  Show all
                </button>
              </div>
              {TOGGLEABLE_COLUMNS.map(col => {
                const visible = !hiddenColumns.has(col.colId)
                return (
                  <button
                    key={col.colId}
                    onClick={() => toggleColumn(col.colId)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm text-surface-700 hover:bg-surface-50"
                  >
                    <span
                      className={`w-4 h-4 flex items-center justify-center rounded border ${
                        visible ? 'bg-accent border-accent text-white' : 'border-surface-300 bg-white'
                      }`}
                    >
                      {visible && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5"/>
                        </svg>
                      )}
                    </span>
                    {col.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* AG Grid */}
      <div className="flex-1 px-5 pb-4" ref={gridWrapperRef}>
        <div className="ag-theme-alpine ag-theme-custom-light w-full h-full rounded-xl overflow-hidden glass-card-subtle">
          <AgGridReact<GridRow>
            ref={gridRef}
            rowData={gridRows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            onCellValueChanged={handleCellValueChanged}
            onRowDragEnd={(e) => { stopCustomGhost(); handleRowDragEnd(e) }}
            onRowDragEnter={handleRowDragEnter}
            onRowDragLeave={stopCustomGhost}
            rowDragManaged={true}
            pagination={false}
            getRowId={(params) => params.data.id}
            getRowStyle={getRowStatusStyle}
            domLayout="normal"
            headerHeight={44}
            rowHeight={60}
            suppressCellFocus={false}
            enableCellTextSelection={true}
            enableBrowserTooltips={true}
            tooltipShowDelay={500}
          />
        </div>
      </div>
    </div>
  )
}
