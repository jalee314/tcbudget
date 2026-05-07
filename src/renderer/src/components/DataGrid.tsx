import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  ColDef,
  CellValueChangedEvent,
  ICellRendererParams,
  IHeaderParams,
  GridReadyEvent,
  RowDragEndEvent
} from 'ag-grid-community'
import { InventoryCard } from '../types'

const CARD_CONDITIONS = ['Raw', 'Raw NM', 'Raw LP', 'Raw MP', 'Raw HP', 'PSA 10', 'PSA 9', 'PSA 8', 'PSA 7', 'CGC 10', 'CGC 9.5', 'CGC 9', 'BGS 10', 'BGS 9.5', 'BGS 9']
const SEALED_CONDITIONS = ['Sealed', 'Opened']

const TOGGLEABLE_COLUMNS: { colId: string; label: string }[] = [
  { colId: 'rarity', label: 'Rarity' },
  { colId: 'condition', label: 'Condition' },
  { colId: 'quantity', label: 'Qty' },
  { colId: 'price_change', label: 'Price Change' },
  { colId: 'market_value', label: 'Market Value' },
  { colId: 'purchase_price', label: 'Unit Cost' },
  { colId: 'cost_basis', label: 'Cost Basis' },
  { colId: 'total_gl', label: 'Total G/L' },
  { colId: 'status', label: 'Status' },
  { colId: 'sale_price', label: 'Sale' },
  { colId: 'purchase_date', label: 'Date' },
  { colId: 'notes', label: 'Notes' }
]
const DEFAULT_HIDDEN: string[] = []

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
  onViewContents?: (id: string) => void
  onEditPulledFrom?: (card: InventoryCard) => void
  onReorder?: (orderedIds: string[]) => void
}

// ─── Custom Cell Renderers ──────────────────────────────────────────────

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
        {data.image_url && (
          <div className="w-8 h-11 rounded overflow-hidden flex-shrink-0">
            <img src={data.image_url} alt={data.name} className="w-full h-full object-contain" loading="lazy" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-surface-900 truncate flex items-center gap-2">
            {data.name}
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent-dark">
              {data.__lotCount} lots
            </span>
          </div>
          <div className="text-[11px] text-surface-500 truncate">{data.set_name} · {data.card_number}</div>
        </div>
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-3 overflow-hidden w-full ${data.__inGroup ? 'pl-6' : ''}`}>
      {data.image_url && (
        <div className="w-8 h-11 rounded overflow-hidden flex-shrink-0">
          <img
            src={data.image_url}
            alt={data.name}
            className="w-full h-full object-contain"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-surface-900 truncate">
          {data.__inGroup ? <span className="text-surface-500 text-xs">Lot · </span> : null}
          {data.name}
        </div>
        <div className="text-[11px] text-surface-500 truncate">{data.set_name} · {data.card_number}</div>
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
  return (
    <span className="text-surface-900 font-medium text-sm font-mono">
      {formatCurrency(data.market_price * data.quantity)}
    </span>
  )
}

function PurchasePriceRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data) return null
  const isGroup = !!data.__isGroup
  return (
    <span className={`text-sm font-mono ${isGroup ? 'text-surface-500 italic' : 'text-surface-700'}`}>
      {formatCurrency(data.purchase_price)}
    </span>
  )
}

function CostBasisRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data) return null
  const isGroup = !!data.__isGroup
  return (
    <span className={`text-sm font-mono ${isGroup ? 'text-surface-500 italic' : 'text-surface-700'}`}>
      {formatCurrency(data.purchase_price * data.quantity)}
    </span>
  )
}

function makePriceChangeRenderer(getMode: () => DisplayMode) {
  return function PriceChangeRenderer(props: ICellRendererParams<GridRow>) {
    const data = props.data
    if (!data) return null
    if (data.is_opened === 1 && !data.is_sold) {
      return <span className="text-surface-300">—</span>
    }
    // Price change uses a baseline snapshotted at add time so newly added items
    // show 0. Updates only when market_price refreshes (throttled to ~12h).
    const baseline = data.price_change_baseline ?? data.market_price
    const delta = data.market_price - baseline
    const isPositive = delta >= 0
    const pct = baseline > 0 ? ((data.market_price - baseline) / baseline) * 100 : null
    const mode = getMode()
    const colorClass = delta === 0 ? 'text-surface-500' : isPositive ? 'text-gain' : 'text-loss'
    return (
      <span className={`text-sm font-medium font-mono ${colorClass}`}>
        {mode === '$'
          ? `${isPositive && delta !== 0 ? '+' : ''}${formatCurrency(delta)}`
          : pct == null ? '—' : `${isPositive && pct !== 0 ? '+' : ''}${pct.toFixed(2)}%`}
      </span>
    )
  }
}

function makeTotalGLRenderer(getMode: () => DisplayMode) {
  return function TotalGLRenderer(props: ICellRendererParams<GridRow>) {
    const data = props.data
    if (!data) return null
    if (data.is_opened === 1 && !data.is_sold) {
      return <span className="text-surface-300">—</span>
    }
    const gl = (data.market_price - data.purchase_price) * data.quantity
    const isPositive = gl >= 0
    const pct = data.purchase_price > 0
      ? ((data.market_price - data.purchase_price) / data.purchase_price) * 100
      : null
    const mode = getMode()
    const colorClass = gl === 0 ? 'text-surface-500' : isPositive ? 'text-gain' : 'text-loss'
    return (
      <span className={`text-sm font-medium font-mono ${colorClass}`}>
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
        {props.mode === '$' ? '$' : '%'}
      </span>
    </button>
  )
}

function SaleRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data || data.__isGroup || !data.is_sold || data.sale_price === 0) {
    return <span className="text-surface-400">—</span>
  }
  const total = data.sale_price
  const unit = data.quantity > 0 ? total / data.quantity : 0
  const pctOfMarket = data.market_price > 0 ? (unit / data.market_price) * 100 : null
  const pctClass = pctOfMarket == null
    ? ''
    : pctOfMarket >= 80 ? 'text-gain' : 'text-loss'

  const parts: string[] = []
  if (data.quantity > 1) parts.push(formatCurrency(unit))
  if (pctOfMarket != null) parts.push(`${pctOfMarket.toFixed(0)}%`)

  return (
    <div className="flex items-baseline gap-1.5 font-mono">
      <span className="text-surface-900 font-medium text-sm">{formatCurrency(total)}</span>
      {parts.length > 0 && (
        <span className={`text-xs ${pctClass || 'text-surface-400'}`}>
          ({parts.join(' · ')})
        </span>
      )}
    </div>
  )
}

function StatusRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data) return null
  if (data.__isGroup) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-surface-100 text-surface-500">Lots</span>
  }
  const isSold = !!data.is_sold
  const isOpened = data.is_opened === 1 && !isSold

  if (isSold) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider badge-sold">Sold</span>
  }
  if (isOpened) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-700">Opened</span>
  }
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider badge-held">Held</span>
}

function ActionsRenderer(props: ICellRendererParams<GridRow> & {
  onDelete: (id: string) => void
  onToggleSold: (card: InventoryCard) => void
  onToggleOpened: (card: InventoryCard) => void
  onViewContents?: (id: string) => void
  onEditPulledFrom?: (card: InventoryCard) => void
}) {
  const data = props.data
  if (!data || data.__isGroup) return null

  const isSold = !!data.is_sold
  const isSealed = data.item_type === 'Sealed'
  const isOpened = data.is_opened === 1
  const isCard = data.item_type === 'Card'

  return (
    <div className="flex items-center gap-1">
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

// ─── Main Component ─────────────────────────────────────────────────────

export default function DataGrid({ rowData, onCellValueChanged, onDeleteRow, onToggleSold, onToggleOpened, onViewContents, onEditPulledFrom, onReorder }: DataGridProps) {
  const gridRef = useRef<AgGridReact>(null)
  const gridWrapperRef = useRef<HTMLDivElement>(null)
  const [filterText, setFilterText] = useState('')
  const [viewFilter, setViewFilter] = useState<'all' | 'cards' | 'sealed'>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(DEFAULT_HIDDEN))
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const columnMenuRef = useRef<HTMLDivElement>(null)
  const [priceChangeMode, setPriceChangeMode] = useState<DisplayMode>('$')
  const [totalGLMode, setTotalGLMode] = useState<DisplayMode>('$')

  const toggleColumn = useCallback((colId: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev)
      if (next.has(colId)) next.delete(colId)
      else next.add(colId)
      return next
    })
  }, [])

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

  useEffect(() => {
    gridRef.current?.api?.sizeColumnsToFit()
  }, [hiddenColumns])

  // Refresh price-change/total-gl cells when their display mode flips
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ columns: ['price_change'], force: true })
  }, [priceChangeMode])
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ columns: ['total_gl'], force: true })
  }, [totalGLMode])

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

  const priceChangeRenderer = useMemo(() => makePriceChangeRenderer(() => priceChangeMode), [priceChangeMode])
  const totalGLRenderer = useMemo(() => makeTotalGLRenderer(() => totalGLMode), [totalGLMode])

  const columnDefs = useMemo<ColDef<GridRow>[]>(() => [
    {
      headerName: 'Item',
      colId: 'name',
      field: 'name',
      cellRenderer: CardNameRenderer,
      cellRendererParams: { onToggleGroup: toggleGroup },
      rowDrag: (params) => !params.data?.__inGroup,
      width: 220,
      minWidth: 160,
      filter: false,
      pinned: 'left' as const,
      tooltipValueGetter: (params) => params.data?.name ?? ''
    },
    {
      headerName: 'Rarity',
      colId: 'rarity',
      field: 'rarity',
      width: 95,
      minWidth: 75,
      filter: false,
      hide: hiddenColumns.has('rarity'),
      cellRenderer: RarityRenderer
    },
    {
      headerName: 'Condition',
      colId: 'condition',
      field: 'condition',
      width: 110,
      minWidth: 90,
      hide: hiddenColumns.has('condition'),
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
      width: 65,
      minWidth: 55,
      hide: hiddenColumns.has('quantity'),
      editable: (params) => !params.data?.__isGroup,
      cellDataType: 'number',
      cellClass: 'text-center font-mono'
    },
    {
      headerName: 'PRICE CHANGE',
      colId: 'price_change',
      width: 130,
      minWidth: 110,
      hide: hiddenColumns.has('price_change'),
      cellRenderer: priceChangeRenderer,
      headerComponent: ToggleHeader,
      headerComponentParams: {
        mode: priceChangeMode,
        onToggle: () => setPriceChangeMode(m => m === '$' ? '%' : '$'),
        label: 'PRICE CHANGE'
      },
      sortable: true,
      comparator: (_a, _b, nodeA, nodeB) => {
        const baseA = nodeA.data?.price_change_baseline ?? nodeA.data?.market_price ?? 0
        const baseB = nodeB.data?.price_change_baseline ?? nodeB.data?.market_price ?? 0
        const a = nodeA.data ? nodeA.data.market_price - baseA : 0
        const b = nodeB.data ? nodeB.data.market_price - baseB : 0
        return a - b
      }
    },
    {
      headerName: 'Market Value',
      colId: 'market_value',
      width: 130,
      minWidth: 110,
      hide: hiddenColumns.has('market_value'),
      cellRenderer: MarketValueRenderer,
      sortable: true,
      comparator: (_a, _b, nodeA, nodeB) => {
        const a = nodeA.data ? nodeA.data.market_price * nodeA.data.quantity : 0
        const b = nodeB.data ? nodeB.data.market_price * nodeB.data.quantity : 0
        return a - b
      }
    },
    {
      headerName: 'Unit Cost',
      colId: 'purchase_price',
      field: 'purchase_price',
      width: 100,
      minWidth: 90,
      hide: hiddenColumns.has('purchase_price'),
      editable: (params) => !params.data?.__isGroup,
      cellDataType: 'number',
      cellRenderer: PurchasePriceRenderer,
      sortable: true
    },
    {
      headerName: 'COST BASIS',
      colId: 'cost_basis',
      width: 130,
      minWidth: 110,
      hide: hiddenColumns.has('cost_basis'),
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
      width: 130,
      minWidth: 110,
      hide: hiddenColumns.has('total_gl'),
      cellRenderer: totalGLRenderer,
      headerComponent: ToggleHeader,
      headerComponentParams: {
        mode: totalGLMode,
        onToggle: () => setTotalGLMode(m => m === '$' ? '%' : '$'),
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
      headerName: 'Status',
      colId: 'status',
      cellRenderer: StatusRenderer,
      width: 95,
      minWidth: 85,
      hide: hiddenColumns.has('status'),
      filter: false,
      sortable: true,
      valueGetter: (params) => {
        const d = params.data
        if (!d || d.__isGroup) return ''
        if (d.is_sold) return 'Sold'
        if (d.is_opened) return 'Opened'
        return 'Held'
      }
    },
    {
      headerName: 'Sale',
      colId: 'sale_price',
      field: 'sale_price',
      width: 160,
      minWidth: 130,
      hide: hiddenColumns.has('sale_price'),
      editable: (params) => params.data?.is_sold === 1,
      cellDataType: 'number',
      cellRenderer: SaleRenderer,
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
      hide: hiddenColumns.has('purchase_date'),
      editable: (params) => !params.data?.__isGroup,
      cellClass: 'text-surface-500 text-xs font-mono'
    },
    {
      headerName: 'Notes',
      colId: 'notes',
      field: 'notes',
      width: 130,
      minWidth: 90,
      hide: hiddenColumns.has('notes'),
      editable: (params) => !params.data?.__isGroup,
      cellClass: 'text-surface-500 text-xs'
    },
    {
      headerName: '',
      colId: 'actions',
      valueGetter: (params) => params.data ? `${params.data.is_sold}|${params.data.is_opened}|${params.data.parent_id ?? ''}` : '',
      width: 140,
      minWidth: 140,
      cellRenderer: ActionsRenderer,
      cellRendererParams: {
        onDelete: onDeleteRow,
        onToggleSold: onToggleSold,
        onToggleOpened: onToggleOpened,
        onViewContents: onViewContents,
        onEditPulledFrom: onEditPulledFrom
      },
      pinned: 'right' as const,
      sortable: false,
      filter: false
    }
  ], [onDeleteRow, onToggleSold, onToggleOpened, onViewContents, onEditPulledFrom, toggleGroup, hiddenColumns, priceChangeRenderer, totalGLRenderer, priceChangeMode, totalGLMode])

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

  const handleGridReady = useCallback((event: GridReadyEvent) => {
    event.api.sizeColumnsToFit()
  }, [])

  const handleGridSizeChanged = useCallback(() => {
    gridRef.current?.api?.sizeColumnsToFit()
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Grid Filter Bar */}
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex gap-1 border border-surface-200 rounded-lg p-0.5 bg-surface-50">
          {(['all', 'cards', 'sealed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setViewFilter(tab)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
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
            className="input-dark !pl-10 py-2 text-sm"
          />
        </div>
        <span className="text-xs text-surface-500 font-mono">
          {filteredByType.length} {filteredByType.length === 1 ? 'item' : 'items'}
        </span>

        <div className="relative ml-auto" ref={columnMenuRef}>
          <button
            onClick={() => setShowColumnMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-surface-700 border border-surface-200 rounded-lg bg-surface-50 hover:bg-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>
            </svg>
            Columns
            {hiddenColumns.size > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent-dark">
                {TOGGLEABLE_COLUMNS.length - hiddenColumns.size}/{TOGGLEABLE_COLUMNS.length}
              </span>
            )}
          </button>

          {showColumnMenu && (
            <div className="absolute right-0 top-full mt-1 z-20 w-56 max-h-80 overflow-y-auto bg-white border border-surface-200 rounded-lg shadow-lg py-1">
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
            onGridReady={handleGridReady}
            onGridSizeChanged={handleGridSizeChanged}
            onRowDragEnd={handleRowDragEnd}
            rowDragManaged={true}
            pagination={false}
            getRowId={(params) => params.data.id}
            domLayout="normal"
            headerHeight={44}
            rowHeight={52}
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
